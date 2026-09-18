import type { Server, Socket } from 'socket.io';
import { GameError, type GameEvent } from '@uno/engine';
import {
  commandEnvelopeSchema,
  createRoomSchema,
  joinRoomSchema,
  resumeSessionSchema,
  startGameSchema,
  type Ack,
  type ClientToServerEvents,
  type InterServerEvents,
  type ProtocolErrorCode,
  type ServerToClientEvents,
  type SocketData,
} from '@uno/protocol';
import { z } from 'zod';
import type { Room, RoomManager } from './RoomManager.js';
import type { TurnScheduler } from './TurnScheduler.js';
import type { Logger } from './logger.js';
import { compact } from './compact.js';

export type UnoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
export type UnoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export interface GatewayDeps {
  io: UnoServer;
  rooms: RoomManager;
  scheduler: TurnScheduler;
  logger: Logger;
  now: () => number;
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
    const { io, rooms } = this.deps;
    if (!room.game) return;

    for (const seat of room.seats) {
      if (!seat.socketId || !seat.connected) continue;
      const state = rooms.viewFor(room, seat.playerId);
      if (!state) continue;
      io.to(seat.socketId).emit('state:patch', {
        state,
        events: redactEvents(events, seat.playerId),
      });
    }
    this.rescheduleTurn(room);
  }

  syncOne(room: Room, playerId: string, socketId: string): void {
    const state = this.deps.rooms.viewFor(room, playerId);
    if (state) this.deps.io.to(socketId).emit('state:sync', state);
  }

  broadcastRoom(room: Room): void {
    const view = this.deps.rooms.redactRoom(room);
    for (const seat of room.seats) {
      if (seat.socketId) this.deps.io.to(seat.socketId).emit('room:updated', view);
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

  register(): void {
    const { io, rooms, logger, now } = this.deps;

    io.on('connection', (socket: UnoSocket) => {
      socket.data.playerId = null;
      socket.data.roomId = null;
      socket.data.playerToken = null;

      socket.on('room:create', (payload, ack) => {
        try {
          if (!this.joinLimiter.allow(socket.id, now())) {
            throw Object.assign(new Error('Demasiadas salas creadas, esperá un momento'), {
              code: 'RATE_LIMITED',
            });
          }
          const input = createRoomSchema.parse(payload);
          const { room, seat } = rooms.createRoom(
            input.nickname,
            socket.id,
            now(),
            compact(input.options),
          );
          this.bind(socket, room.id, seat.playerId, seat.playerToken);

          logger.info({ roomId: room.id, playerId: seat.playerId }, 'sala creada');
          ack({
            ok: true,
            // El token va SOLO en el ack, jamas en un broadcast: es la credencial.
            playerToken: seat.playerToken,
            playerId: seat.playerId,
            roomId: room.id,
            room: rooms.redactRoom(room),
          });
        } catch (error) {
          ack(fail(error));
        }
      });

      socket.on('room:join', (payload, ack) => {
        try {
          if (!this.joinLimiter.allow(socket.id, now())) {
            throw Object.assign(new Error('Demasiados intentos, esperá un momento'), {
              code: 'RATE_LIMITED',
            });
          }
          const input = joinRoomSchema.parse(payload);
          const { room, seat } = rooms.joinRoom(input.roomId, input.nickname, socket.id, now());
          this.bind(socket, room.id, seat.playerId, seat.playerToken);

          logger.info({ roomId: room.id, playerId: seat.playerId }, 'jugador se unio');
          ack({
            ok: true,
            playerToken: seat.playerToken,
            playerId: seat.playerId,
            roomId: room.id,
            room: rooms.redactRoom(room),
          });
          this.broadcastRoom(room);
        } catch (error) {
          ack(fail(error));
        }
      });

      socket.on('session:resume', (payload, ack) => {
        try {
          const input = resumeSessionSchema.parse(payload);
          const { room, seat, displacedSocketId } = rooms.resumeSession(
            input.roomId,
            input.playerToken,
            socket.id,
            now(),
          );

          if (displacedSocketId) {
            io.to(displacedSocketId).emit('error:game', {
              code: 'SESSION_TAKEN_OVER',
              message: 'Abriste la partida en otra pestaña',
            });
          }

          this.bind(socket, room.id, seat.playerId, seat.playerToken);
          logger.info({ roomId: room.id, playerId: seat.playerId }, 'sesion reanudada');

          ack({
            ok: true,
            playerId: seat.playerId,
            room: rooms.redactRoom(room),
            // Estado COMPLETO: no intentamos reproducir el diff que se perdio.
            state: rooms.viewFor(room, seat.playerId),
          });
          this.broadcastRoom(room);
          if (room.game) this.broadcastState(room);
        } catch (error) {
          ack(fail(error));
        }
      });

      socket.on('game:start', (payload, ack) => {
        try {
          const input = startGameSchema.parse(payload ?? {});
          const { playerId, roomId } = socket.data;
          if (!playerId || !roomId) throw new GameError('PLAYER_NOT_FOUND', 'No estas en una sala');

          const { room, events } = rooms.startGame(roomId, playerId, now(), compact(input.options));
          logger.info(
            { roomId: room.id, seed: room.game?.seed, players: room.seats.length },
            'partida iniciada',
          );
          ack({ ok: true });
          this.broadcastRoom(room);
          this.broadcastState(room, events);
        } catch (error) {
          ack(fail(error));
        }
      });

      socket.on('game:command', (payload, ack) => {
        let clientSeq = 0;
        try {
          if (!this.limiter.allow(socket.id, now())) {
            throw Object.assign(new Error('Demasiados comandos'), { code: 'RATE_LIMITED' });
          }

          const input = commandEnvelopeSchema.parse(payload);
          clientSeq = input.clientSeq;
          const { playerId, roomId } = socket.data;
          if (!playerId || !roomId) throw new GameError('PLAYER_NOT_FOUND', 'No estas en una sala');

          // El playerId sale del socket autenticado, NUNCA del payload.
          const result = rooms.applyCommand(roomId, playerId, input.command, now(), {
            clientSeq: input.clientSeq,
            ...(input.expectedVersion !== undefined
              ? { expectedVersion: input.expectedVersion }
              : {}),
          });

          ack({ ok: true, version: result.version, clientSeq: input.clientSeq });

          const room = rooms.find(roomId);
          if (!room) return;
          for (const effect of result.effects) {
            if (effect.kind === 'state:patch') this.broadcastState(room, effect.events);
          }
        } catch (error) {
          const room = socket.data.roomId ? rooms.find(socket.data.roomId) : undefined;
          const version = room?.game?.version;

          // El ack va SOLO al emisor: los otros 9 no tienen por que enterarse de
          // un intento ilegal, y contarselo revelaria que tiene esa carta.
          ack(fail(error, { clientSeq, ...(version !== undefined ? { version } : {}) }));

          const { code } = toErrorCode(error);
          if (code === 'STALE_COMMAND' && room && socket.data.playerId) {
            this.syncOne(room, socket.data.playerId, socket.id);
          }
        }
      });

      socket.on('game:nextRound', (ack) => {
        try {
          const { playerId, roomId } = socket.data;
          if (!playerId || !roomId) throw new GameError('PLAYER_NOT_FOUND', 'No estas en una sala');
          const result = rooms.nextRound(roomId, playerId, now());
          ack({ ok: true });

          const room = rooms.find(roomId);
          if (!room) return;
          for (const effect of result.effects) {
            if (effect.kind === 'state:patch') this.broadcastState(room, effect.events);
          }
        } catch (error) {
          ack(fail(error));
        }
      });

      socket.on('room:leave', (ack) => {
        try {
          const result = rooms.handleDisconnect(socket.id, now());
          this.bind(socket, null, null, null);
          ack({ ok: true });
          if (result) {
            this.broadcastRoom(result.room);
            if (result.room.game) this.broadcastState(result.room);
          }
        } catch (error) {
          ack(fail(error));
        }
      });

      socket.on('disconnect', (reason) => {
        this.limiter.forget(socket.id);
        this.joinLimiter.forget(socket.id);
        const result = rooms.handleDisconnect(socket.id, now());
        if (!result) return;

        logger.info({ roomId: result.room.id, playerId: result.playerId, reason }, 'desconexion');
        this.broadcastRoom(result.room);
        // El timer del turno NO se pausa aca a proposito.
        if (result.room.game) this.broadcastState(result.room);
      });
    });
  }

  private bind(
    socket: UnoSocket,
    roomId: string | null,
    playerId: string | null,
    playerToken: string | null,
  ): void {
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;
    socket.data.playerToken = playerToken;
    if (roomId) void socket.join(roomId);
  }
}
