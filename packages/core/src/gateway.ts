import { GameError, type GameEvent } from '@uno/engine';
import {
  commandEnvelopeSchema,
  createRoomSchema,
  joinRoomSchema,
  resumeSessionSchema,
  startGameSchema,
  type Ack,
  type ProtocolErrorCode,
} from '@uno/protocol';
import { z } from 'zod';
import type { Room, RoomManager } from './RoomManager.js';
import type { Emitter, Logger, Scheduler } from './ports.js';
import { compact } from './compact.js';
export interface GatewayDeps {
  /** El transporte. Node usa Socket.IO; el Worker, WebSocket nativo. */
  emitter: Emitter;
  rooms: RoomManager;
  scheduler: Scheduler;
  logger: Logger;
  now: () => number;
}

/** Contexto de una conexion, equivalente al `socket.data` de Socket.IO. */
export interface ConnectionContext {
  connectionId: string;
  playerId: string | null;
  roomId: string | null;
  playerToken: string | null;
  /**
   * Codigo de sala impuesto por el transporte.
   *
   * Lo usa el Durable Object, donde la identidad del objeto ya fija el codigo
   * antes de que la sala exista. En Node queda undefined y el manager genera
   * el codigo como siempre.
   */
  forcedRoomId?: string;
}

function toErrorCode(error: unknown): { code: ProtocolErrorCode; message: string } {
  if (error instanceof GameError) return { code: error.code, message: error.message };
  if (error instanceof z.ZodError) {
    return { code: 'INVALID_PAYLOAD', message: error.issues[0]?.message ?? 'Payload invalido' };
  }
  if (error && typeof error === 'object' && 'code' in error) {
    return {
      code: (error as { code: string }).code as ProtocolErrorCode,
      message: error instanceof Error ? error.message : 'Error',
    };
  }
  return { code: 'INTERNAL_ERROR', message: 'Error interno' };
}

function fail(error: unknown, extra: { clientSeq?: number; version?: number } = {}): Ack<never> {
  const { code, message } = toErrorCode(error);
  return { ok: false, code, message, ...extra };
}

/**
 * Los eventos tambien se redactan: CARDS_DRAWN lleva las cartas SOLO para quien
 * robo. Sin esto el estado estaria redactado pero los eventos filtrarian
 * exactamente lo que el estado oculta.
 */
function redactEvents(events: GameEvent[], viewerId: string): GameEvent[] {
  return events.map((event) => {
    if (event.type === 'CARDS_DRAWN' && event.playerId !== viewerId) {
      const { cards: _cards, ...rest } = event;
      return rest;
    }
    return event;
  });
}

/**
 * Limita acciones por socket. Un cliente legitimo manda unos pocos por segundo.
 *
 * El limite de comandos frena bucles; el de creacion de salas frena que alguien
 * llene la memoria del servidor creando salas sin parar, que con el estado en
 * memoria y sin base de datos es el vector mas barato de tumbar el server.
 */
class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.hits.set(key, recent);
    if (recent.length >= this.limit) return false;
    recent.push(now);
    return true;
  }

  forget(key: string): void {
    this.hits.delete(key);
  }
}

/**
 * Capa de socket. Valida, traduce errores y emite.
 *
 * REGLA DE ARQUITECTURA: `broadcastState` y `syncOne` son las UNICAS funciones
 * que emiten estado de juego, y ambas pasan por `viewFor()` -> `redact()`.
 * Nunca se emite `room.game` directo. Si aparece una tercera via de emision,
 * la frontera de seguridad deja de ser auditable de un vistazo.
 */
export class Gateway {
  private readonly limiter = new RateLimiter(30, 1_000);
  /** Crear/unirse es mucho mas caro que un comando: 10 cada 10 segundos. */
  private readonly joinLimiter = new RateLimiter(10, 10_000);

  constructor(private readonly deps: GatewayDeps) {}

  /** Emite el estado a cada jugador conectado, redactado por destinatario. */
  broadcastState(room: Room, events: GameEvent[] = []): void {
    const { emitter, rooms } = this.deps;
    if (!room.game) return;

    for (const seat of room.seats) {
      if (!seat.socketId || !seat.connected) continue;
      const state = rooms.viewFor(room, seat.playerId);
      if (!state) continue;
      emitter.push(seat.socketId, 'state:patch', {
        state,
        events: redactEvents(events, seat.playerId),
      });
    }
    this.rescheduleTurn(room);
  }

  syncOne(room: Room, playerId: string, socketId: string): void {
    const state = this.deps.rooms.viewFor(room, playerId);
    if (state) this.deps.emitter.push(socketId, 'state:sync', state);
  }

  broadcastRoom(room: Room): void {
    const view = this.deps.rooms.redactRoom(room);
    for (const seat of room.seats) {
      if (seat.socketId) this.deps.emitter.push(seat.socketId, 'room:updated', view);
    }
  }

  /** Turno expirado. Lo dispara el scheduler del servidor, nunca un cliente. */
  handleTurnExpired(roomId: string): void {
    const { rooms, scheduler, now } = this.deps;
    const result = rooms.applyTimeout(roomId, now());
    const room = rooms.find(roomId);
    if (!result || !room?.game) {
      scheduler.cancel(roomId);
      return;
    }
    for (const effect of result.effects) {
      if (effect.kind === 'state:patch') this.broadcastState(room, effect.events);
    }
  }

  private rescheduleTurn(room: Room): void {
    const { scheduler, now } = this.deps;
    const game = room.game;
    if (!game || game.phase === 'round_over' || game.phase === 'game_over') {
      scheduler.cancel(room.id);
      return;
    }
    scheduler.schedule(room.id, game.turnDeadline, now());
  }

  /**
   * Procesa un evento del cliente y devuelve el ack.
   *
   * Reemplaza los handlers anidados de `io.on('connection')`: el transporte
   * decide como recibe el mensaje y como devuelve la respuesta; esta capa solo
   * hace la logica. Es lo que permite el mismo Gateway sobre Socket.IO y sobre
   * WebSocket nativo.
   */
  async dispatch(
    ctx: ConnectionContext,
    event: string,
    payload: unknown,
  ): Promise<Ack<Record<string, unknown>>> {
    const { rooms, logger, now } = this.deps;

    try {
      switch (event) {
        case 'room:create': {
          this.requireQuota(this.joinLimiter, ctx, 'Demasiadas salas creadas, esperá un momento');
          const input = createRoomSchema.parse(payload);
          const { room, seat } = rooms.createRoom(
            input.nickname,
            ctx.connectionId,
            now(),
            compact(input.options),
            ctx.forcedRoomId,
          );
          this.bind(ctx, room.id, seat.playerId, seat.playerToken);
          logger.info({ roomId: room.id, playerId: seat.playerId }, 'sala creada');
          return {
            ok: true,
            // El token va SOLO en el ack, jamas en un broadcast: es la credencial.
            playerToken: seat.playerToken,
            playerId: seat.playerId,
            roomId: room.id,
            room: rooms.redactRoom(room),
          };
        }

        case 'room:join': {
          this.requireQuota(this.joinLimiter, ctx, 'Demasiados intentos, esperá un momento');
          const input = joinRoomSchema.parse(payload);
          const { room, seat } = rooms.joinRoom(
            input.roomId,
            input.nickname,
            ctx.connectionId,
            now(),
          );
          this.bind(ctx, room.id, seat.playerId, seat.playerToken);
          logger.info({ roomId: room.id, playerId: seat.playerId }, 'jugador se unio');

          const ack: Ack<Record<string, unknown>> = {
            ok: true,
            playerToken: seat.playerToken,
            playerId: seat.playerId,
            roomId: room.id,
            room: rooms.redactRoom(room),
          };
          this.broadcastRoom(room);
          return ack;
        }

        case 'session:resume': {
          const input = resumeSessionSchema.parse(payload);
          const { room, seat, displacedSocketId } = rooms.resumeSession(
            input.roomId,
            input.playerToken,
            ctx.connectionId,
            now(),
          );

          if (displacedSocketId) {
            // Dos pestañas con el mismo token generarian comandos duplicados.
            this.deps.emitter.push(displacedSocketId, 'error:game', {
              code: 'SESSION_TAKEN_OVER',
              message: 'Abriste la partida en otra pestaña',
            });
          }

          this.bind(ctx, room.id, seat.playerId, seat.playerToken);
          logger.info({ roomId: room.id, playerId: seat.playerId }, 'sesion reanudada');

          const ack: Ack<Record<string, unknown>> = {
            ok: true,
            playerId: seat.playerId,
            room: rooms.redactRoom(room),
            // Estado COMPLETO: no intentamos reproducir el diff que se perdio.
            state: rooms.viewFor(room, seat.playerId),
          };
          this.broadcastRoom(room);
          if (room.game) this.broadcastState(room);
          return ack;
        }

        case 'game:start': {
          const input = startGameSchema.parse(payload ?? {});
          const { playerId, roomId } = ctx;
          if (!playerId || !roomId) throw new GameError('PLAYER_NOT_FOUND', 'No estas en una sala');

          const { room, events } = rooms.startGame(roomId, playerId, now(), compact(input.options));
          logger.info(
            { roomId: room.id, seed: room.game?.seed, players: room.seats.length },
            'partida iniciada',
          );
          this.broadcastRoom(room);
          this.broadcastState(room, events);
          return { ok: true };
        }

        case 'game:command': {
          this.requireQuota(this.limiter, ctx, 'Demasiados comandos');
          const input = commandEnvelopeSchema.parse(payload);
          const { playerId, roomId } = ctx;
          if (!playerId || !roomId) throw new GameError('PLAYER_NOT_FOUND', 'No estas en una sala');

          try {
            // El playerId sale del contexto de la conexion, NUNCA del payload.
            const result = rooms.applyCommand(roomId, playerId, input.command, now(), {
              clientSeq: input.clientSeq,
              ...(input.expectedVersion !== undefined
                ? { expectedVersion: input.expectedVersion }
                : {}),
            });

            const room = rooms.find(roomId);
            if (room) {
              for (const effect of result.effects) {
                if (effect.kind === 'state:patch') this.broadcastState(room, effect.events);
              }
            }
            return { ok: true, version: result.version, clientSeq: input.clientSeq };
          } catch (error) {
            const room = rooms.find(roomId);
            const version = room?.game?.version;

            // Si el comando venia de un estado viejo, le reenviamos el actual.
            if (toErrorCode(error).code === 'STALE_COMMAND' && room && ctx.playerId) {
              this.syncOne(room, ctx.playerId, ctx.connectionId);
            }
            // El ack va SOLO al emisor: los otros 9 no tienen por que enterarse
            // de un intento ilegal, y contarselo revelaria que tiene esa carta.
            return fail(error, {
              clientSeq: input.clientSeq,
              ...(version !== undefined ? { version } : {}),
            });
          }
        }

        case 'game:nextRound': {
          const { playerId, roomId } = ctx;
          if (!playerId || !roomId) throw new GameError('PLAYER_NOT_FOUND', 'No estas en una sala');
          const result = rooms.nextRound(roomId, playerId, now());

          const room = rooms.find(roomId);
          if (room) {
            for (const effect of result.effects) {
              if (effect.kind === 'state:patch') this.broadcastState(room, effect.events);
            }
          }
          return { ok: true };
        }

        case 'room:leave': {
          const result = rooms.handleDisconnect(ctx.connectionId, now());
          this.bind(ctx, null, null, null);
          if (result) {
            this.broadcastRoom(result.room);
            if (result.room.game) this.broadcastState(result.room);
          }
          return { ok: true };
        }

        default:
          return fail(
            Object.assign(new Error(`Evento desconocido: ${event}`), {
              code: 'INVALID_PAYLOAD',
            }),
          );
      }
    } catch (error) {
      return fail(error);
    }
  }

  /** Desconexion de una conexion. La dispara el transporte, no el cliente. */
  handleDisconnect(ctx: ConnectionContext, reason: string): void {
    const { rooms, logger, now } = this.deps;
    this.limiter.forget(ctx.connectionId);
    this.joinLimiter.forget(ctx.connectionId);

    const result = rooms.handleDisconnect(ctx.connectionId, now());
    if (!result) return;

    logger.info({ roomId: result.room.id, playerId: result.playerId, reason }, 'desconexion');
    this.broadcastRoom(result.room);
    // El timer del turno NO se pausa aca a proposito.
    if (result.room.game) this.broadcastState(result.room);
  }

  private requireQuota(limiter: RateLimiter, ctx: ConnectionContext, message: string): void {
    if (!limiter.allow(ctx.connectionId, this.deps.now())) {
      throw Object.assign(new Error(message), { code: 'RATE_LIMITED' });
    }
  }

  private bind(
    ctx: ConnectionContext,
    roomId: string | null,
    playerId: string | null,
    playerToken: string | null,
  ): void {
    ctx.roomId = roomId;
    ctx.playerId = playerId;
    ctx.playerToken = playerToken;
  }
}
