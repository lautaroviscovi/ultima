import {
  createGame,
  disposeGame,
  reduce,
  redact,
  GameError,
  type Command,
  type GameEvent,
  type GameOptions,
  type GameState,
  type RedactedGameState,
} from '@uno/engine';
import type { PlayerCommand, RedactedRoomState } from '@uno/protocol';
import { generatePlayerId, generatePlayerToken, generateRoomCode, generateSeed } from './ids.js';

/**
 * Normaliza el comando validado por zod al tipo del engine.
 *
 * zod `.optional()` produce `T | undefined`, pero el engine declara
 * `chosenColor?: Color`, que con exactOptionalPropertyTypes significa
 * "ausente o Color, nunca undefined explicito". Traducimos en el borde en vez
 * de aflojar los tipos del engine.
 */
function toEngineCommand(command: PlayerCommand): Command {
  if (command.type === 'PLAY_CARD') {
    return {
      type: 'PLAY_CARD',
      cardId: command.cardId,
      ...(command.chosenColor !== undefined ? { chosenColor: command.chosenColor } : {}),
      ...(command.declareUno !== undefined ? { declareUno: command.declareUno } : {}),
    };
  }
  if (command.type === 'PLAY_DRAWN_CARD') {
    return {
      type: 'PLAY_DRAWN_CARD',
      ...(command.chosenColor !== undefined ? { chosenColor: command.chosenColor } : {}),
      ...(command.declareUno !== undefined ? { declareUno: command.declareUno } : {}),
    };
  }
  return command;
}

export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;

export interface RoomConfig {
  /** Cuanto sobrevive un asiento desconectado antes de marcarse abandonado. */
  reconnectGraceMs: number;
  /** Cuanto sobrevive una sala sin actividad. */
  roomTtlMs: number;
  options: GameOptions;
}

export interface Seat {
  playerId: string;
  playerToken: string;
  nickname: string;
  seat: number;
  connected: boolean;
  socketId: string | null;
  /** Ultimo clientSeq procesado. Hace idempotentes los reintentos. */
  lastClientSeq: number;
  disconnectedAt: number | null;
}

export interface Room {
  id: string;
  hostId: string;
  seats: Seat[];
  options: GameOptions;
  game: GameState | null;
  createdAt: number;
  lastActivityAt: number;
}

/** Efectos que el manager pide emitir. El manager no habla con sockets. */
export type RoomEffect =
  | { kind: 'room:updated'; roomId: string }
  | { kind: 'state:patch'; roomId: string; events: GameEvent[] }
  | { kind: 'state:sync'; roomId: string; playerId: string }
  | { kind: 'room:closed'; roomId: string };

export interface ApplyResult {
  version: number;
  effects: RoomEffect[];
}

export class RoomNotFoundError extends Error {
  readonly code = 'ROOM_NOT_FOUND' as const;
}
export class RoomFullError extends Error {
  readonly code = 'ROOM_FULL' as const;
}
export class RoomInProgressError extends Error {
  readonly code = 'ROOM_IN_PROGRESS' as const;
}
export class NicknameTakenError extends Error {
  readonly code = 'NICKNAME_TAKEN' as const;
}
export class InvalidTokenError extends Error {
  readonly code = 'INVALID_TOKEN' as const;
}
export class NotHostError extends Error {
  readonly code = 'NOT_HOST' as const;
}
export class NotInRoomError extends Error {
  readonly code = 'NOT_IN_ROOM' as const;
}
export class StaleCommandError extends Error {
  readonly code = 'STALE_COMMAND' as const;
}

/**
 * Ciclo de vida de las salas. Todo en memoria, en un Map.
 *
 * Consecuencia asumida y documentada: un redeploy mata las partidas en curso.
 * Sin cuentas, sin ranking y sin historial no hay nada que persistir, asi que
 * una base de datos solo agregaria superficie de bugs.
 *
 * El manager NO conoce sockets: devuelve efectos que la capa de socket traduce
 * a emisiones. Eso lo hace testeable sin levantar un servidor.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  /** Indice inverso para O(1) al desconectar. */
  private readonly socketIndex = new Map<string, { roomId: string; playerId: string }>();

  constructor(private readonly config: RoomConfig) {}

  get size(): number {
    return this.rooms.size;
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }

  get(roomId: string): Room {
    const room = this.rooms.get(roomId.toUpperCase());
    if (!room) throw new RoomNotFoundError(`La sala ${roomId} no existe`);
    return room;
  }

  find(roomId: string): Room | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  createRoom(
    nickname: string,
    socketId: string,
    now: number,
    options?: Partial<GameOptions>,
    /**
     * Codigo de sala impuesto desde afuera.
     *
     * En Node el manager genera el codigo, porque tiene el Map de salas a mano
     * para detectar colisiones. En un Durable Object la identidad viene de
     * `idFromName(codigo)` ANTES de que exista la sala, asi que el codigo ya
     * esta decidido y el manager tiene que usar ESE — si generara otro,
     * `room:join` buscaria una sala que no existe con ese nombre.
     */
    forcedId?: string,
  ): {
    room: Room;
    seat: Seat;
  } {
    let id = forcedId ?? generateRoomCode();
    // Colision de codigos: 31^4 = ~920k combinaciones, pero mejor no confiar.
    let attempts = 0;
    while (!forcedId && this.rooms.has(id) && attempts++ < 50) id = generateRoomCode();

    const seat = this.makeSeat(nickname, 0, socketId);
    const room: Room = {
      id,
      hostId: seat.playerId,
      seats: [seat],
      options: { ...this.config.options, ...options },
      game: null,
      createdAt: now,
      lastActivityAt: now,
    };

    this.rooms.set(id, room);
    this.socketIndex.set(socketId, { roomId: id, playerId: seat.playerId });
    return { room, seat };
  }

  joinRoom(
    roomId: string,
    nickname: string,
    socketId: string,
    now: number,
  ): {
    room: Room;
    seat: Seat;
  } {
    const room = this.get(roomId);
    if (room.game) throw new RoomInProgressError('La partida ya empezo');
    if (room.seats.length >= MAX_PLAYERS) throw new RoomFullError('La sala esta llena');

    const taken = room.seats.some((s) => s.nickname.toLowerCase() === nickname.toLowerCase());
    if (taken) throw new NicknameTakenError('Ese nombre ya esta en uso en esta sala');

    const seat = this.makeSeat(nickname, room.seats.length, socketId);
    room.seats.push(seat);
    room.lastActivityAt = now;
    this.socketIndex.set(socketId, { roomId: room.id, playerId: seat.playerId });
    return { room, seat };
  }

  /**
   * Reclamo del asiento con el token guardado en localStorage.
   *
   * Si ya habia otro socket en el asiento, gana el ultimo: dos sockets activos
   * sobre el mismo asiento generarian comandos duplicados. El anterior recibe
   * SESSION_TAKEN_OVER.
   */
  resumeSession(
    roomId: string,
    playerToken: string,
    socketId: string,
    now: number,
  ): { room: Room; seat: Seat; displacedSocketId: string | null } {
    const room = this.get(roomId);
    const seat = room.seats.find((s) => s.playerToken === playerToken);
    if (!seat) throw new InvalidTokenError('Ese token no corresponde a ningun asiento');

    const displacedSocketId = seat.socketId && seat.socketId !== socketId ? seat.socketId : null;
    if (displacedSocketId) this.socketIndex.delete(displacedSocketId);

    seat.connected = true;
    seat.socketId = socketId;
    seat.disconnectedAt = null;
    room.lastActivityAt = now;
    this.socketIndex.set(socketId, { roomId: room.id, playerId: seat.playerId });

    if (room.game) {
      room.game = reduce(
        room.game,
        { type: 'RECONNECT', playerId: seat.playerId },
        { playerId: seat.playerId, now },
      ).state;
    }

    return { room, seat, displacedSocketId };
  }

  startGame(
    roomId: string,
    playerId: string,
    now: number,
    options?: Partial<GameOptions>,
  ): {
    room: Room;
    events: GameEvent[];
  } {
    const room = this.get(roomId);
    if (room.hostId !== playerId) throw new NotHostError('Solo el anfitrion puede empezar');
    if (room.game) throw new RoomInProgressError('La partida ya empezo');
    if (room.seats.length < MIN_PLAYERS) {
      throw new GameError('NOT_ENOUGH_PLAYERS', `Hacen falta al menos ${MIN_PLAYERS} jugadores`);
    }

    if (options) room.options = { ...room.options, ...options };

    const { state, events } = createGame({
      roomId: room.id,
      seed: generateSeed(),
      players: room.seats.map((s) => ({ id: s.playerId, nickname: s.nickname })),
      options: room.options,
      now,
    });

    room.game = state;
    room.lastActivityAt = now;
    return { room, events };
  }

  /**
   * Aplica un comando de jugador. El playerId viene del socket autenticado,
   * NUNCA del payload: si viniera del cliente seria suplantacion.
   */
  applyCommand(
    roomId: string,
    playerId: string,
    command: PlayerCommand,
    now: number,
    opts: { clientSeq: number; expectedVersion?: number },
  ): ApplyResult {
    const room = this.get(roomId);
    if (!room.game) throw new NotInRoomError('La partida no empezo');

    const seat = room.seats.find((s) => s.playerId === playerId);
    if (!seat) throw new NotInRoomError('No estas en esta sala');

    // Reintento del mismo comando tras un timeout de red: respondemos igual
    // que la primera vez en vez de aplicarlo dos veces.
    if (opts.clientSeq <= seat.lastClientSeq) {
      return { version: room.game.version, effects: [] };
    }

    if (opts.expectedVersion !== undefined && opts.expectedVersion !== room.game.version) {
      throw new StaleCommandError('El estado cambio desde que mandaste el comando');
    }

    const { state, events } = reduce(room.game, toEngineCommand(command), { playerId, now });
    room.game = state;
    seat.lastClientSeq = opts.clientSeq;
    room.lastActivityAt = now;

    return { version: state.version, effects: [{ kind: 'state:patch', roomId: room.id, events }] };
  }

  /** Turno expirado. Lo dispara el timer del servidor, no un cliente. */
  applyTimeout(roomId: string, now: number): ApplyResult | null {
    const room = this.find(roomId);
    if (!room?.game) return null;
    if (room.game.phase === 'round_over' || room.game.phase === 'game_over') return null;

    const { state, events } = reduce(room.game, { type: 'TIMEOUT' }, { playerId: null, now });
    room.game = state;
    room.lastActivityAt = now;
    return { version: state.version, effects: [{ kind: 'state:patch', roomId: room.id, events }] };
  }

  closeUnoWindow(roomId: string, now: number): ApplyResult | null {
    const room = this.find(roomId);
    if (!room?.game?.unoWindow) return null;

    const { state, events } = reduce(
      room.game,
      { type: 'CLOSE_UNO_WINDOW' },
      { playerId: null, now },
    );
    room.game = state;
    return { version: state.version, effects: [{ kind: 'state:patch', roomId: room.id, events }] };
  }

  nextRound(roomId: string, playerId: string, now: number): ApplyResult {
    const room = this.get(roomId);
    if (!room.game) throw new NotInRoomError('La partida no empezo');
    if (room.hostId !== playerId) throw new NotHostError('Solo el anfitrion puede seguir');

    const { state, events } = reduce(room.game, { type: 'NEXT_ROUND' }, { playerId, now });
    room.game = state;
    room.lastActivityAt = now;
    return { version: state.version, effects: [{ kind: 'state:patch', roomId: room.id, events }] };
  }

  /**
   * Desconexion != abandono. El asiento y la mano se mantienen, y el timer del
   * turno NO se pausa: pausarlo dejaria que una conexion mala congele a los
   * otros 9. En el lobby, en cambio, el asiento se libera al toque.
   */
  handleDisconnect(socketId: string, now: number): { room: Room; playerId: string } | null {
    const entry = this.socketIndex.get(socketId);
    if (!entry) return null;
    this.socketIndex.delete(socketId);

    const room = this.find(entry.roomId);
    if (!room) return null;

    const seatIndex = room.seats.findIndex((s) => s.playerId === entry.playerId);
    const seat = room.seats[seatIndex];
    if (!seat) return null;
    // Ya fue desplazado por otra pestaña: no lo marcamos desconectado.
    if (seat.socketId !== socketId) return null;

    seat.connected = false;
    seat.socketId = null;
    seat.disconnectedAt = now;
    room.lastActivityAt = now;

    if (!room.game) {
      // Pre-inicio: el asiento se libera y los demas se recompactan.
      room.seats.splice(seatIndex, 1);
      room.seats.forEach((s, i) => (s.seat = i));
      if (room.seats.length === 0) {
        this.rooms.delete(room.id);
      } else if (room.hostId === entry.playerId) {
        room.hostId = room.seats[0]!.playerId;
      }
      return { room, playerId: entry.playerId };
    }

    room.game = reduce(
      room.game,
      { type: 'DISCONNECT', playerId: entry.playerId },
      { playerId: entry.playerId, now },
    ).state;

    return { room, playerId: entry.playerId };
  }

  /**
   * Barrido periodico: marca abandonados a los que no volvieron dentro de la
   * ventana de gracia, y borra salas vencidas.
   */
  sweep(now: number): RoomEffect[] {
    const effects: RoomEffect[] = [];

    for (const room of [...this.rooms.values()]) {
      if (now - room.lastActivityAt > this.config.roomTtlMs) {
        if (room.game) disposeGame(room.game);
        this.rooms.delete(room.id);
        effects.push({ kind: 'room:closed', roomId: room.id });
        continue;
      }

      if (!room.game) continue;

      for (const seat of room.seats) {
        const gone =
          !seat.connected &&
          seat.disconnectedAt !== null &&
          now - seat.disconnectedAt > this.config.reconnectGraceMs;
        if (!gone) continue;

        const player = room.game.players.find((p) => p.id === seat.playerId);
        if (!player || player.abandoned) continue;

        const { state, events } = reduce(
          room.game,
          { type: 'ABANDON', playerId: seat.playerId },
          { playerId: null, now },
        );
        room.game = state;
        effects.push({ kind: 'state:patch', roomId: room.id, events });
      }
    }

    return effects;
  }

  /**
   * Inserta una sala ya construida, sin pasar por createRoom.
   *
   * Lo usa el Durable Object al rehidratar desde un snapshot: la sala ya
   * existia, con su codigo, sus asientos y su partida en curso. El indice de
   * sockets queda vacio a proposito — las conexiones no sobreviven a la
   * eviccion y cada jugador reclama su asiento con el token al reconectar.
   */
  adopt(room: Room): void {
    this.rooms.set(room.id.toUpperCase(), room);
  }

  removeRoom(roomId: string): void {
    const room = this.find(roomId);
    if (!room) return;
    if (room.game) disposeGame(room.game);
    for (const seat of room.seats) {
      if (seat.socketId) this.socketIndex.delete(seat.socketId);
    }
    this.rooms.delete(room.id);
  }

  seatBySocket(socketId: string): { room: Room; seat: Seat } | null {
    const entry = this.socketIndex.get(socketId);
    if (!entry) return null;
    const room = this.find(entry.roomId);
    const seat = room?.seats.find((s) => s.playerId === entry.playerId);
    return room && seat ? { room, seat } : null;
  }

  /** Vista del lobby. Nunca incluye playerToken: es la credencial. */
  redactRoom(room: Room): RedactedRoomState {
    return {
      roomId: room.id,
      hostId: room.hostId,
      players: room.seats.map((s) => ({
        id: s.playerId,
        nickname: s.nickname,
        seat: s.seat,
        connected: s.connected,
      })),
      options: room.options,
      started: room.game !== null,
      maxPlayers: MAX_PLAYERS,
    };
  }

  viewFor(room: Room, playerId: string): RedactedGameState | null {
    return room.game ? redact(room.game, playerId) : null;
  }

  private makeSeat(nickname: string, seat: number, socketId: string): Seat {
    return {
      playerId: generatePlayerId(),
      playerToken: generatePlayerToken(),
      nickname,
      seat,
      connected: true,
      socketId,
      lastClientSeq: 0,
      disconnectedAt: null,
    };
  }
}
