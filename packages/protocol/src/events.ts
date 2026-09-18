import type { GameErrorCode, GameEvent, RedactedGameState } from '@uno/engine';
import type {
  CommandEnvelope,
  CreateRoomPayload,
  JoinRoomPayload,
  ResumeSessionPayload,
  StartGamePayload,
} from './schemas.js';

/**
 * El contrato entre cliente y servidor. Si se agrega un campo a
 * RedactedGameState, el cliente no compila hasta manejarlo: esa es toda la
 * ceremonia que hace falta. Los genericos nativos de Socket.IO alcanzan, no
 * hay que meter tRPC ni un event bus propio.
 */

export type ProtocolErrorCode =
  | GameErrorCode
  | 'INVALID_PAYLOAD'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_IN_PROGRESS'
  | 'NICKNAME_TAKEN'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'INVALID_TOKEN'
  | 'SESSION_TAKEN_OVER'
  | 'STALE_COMMAND'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

/** Ack sin payload extra. `Record<string, never>` no compone con la interseccion. */
export type Empty = Record<never, never>;

export type Ack<T = Empty> =
  | ({ ok: true } & T)
  | {
      ok: false;
      code: ProtocolErrorCode;
      message: string;
      /** Version actual del servidor, para que el cliente detecte que esta atrasado. */
      version?: number;
      /** Eco del clientSeq, para saber que comando revertir visualmente. */
      clientSeq?: number;
    };

/** Vista del lobby, antes de que empiece la partida. */
export interface RedactedRoomState {
  roomId: string;
  hostId: string;
  players: Array<{
    id: string;
    nickname: string;
    seat: number;
    connected: boolean;
  }>;
  options: {
    targetScore: number;
    turnTimeoutMs: number;
    unoWindowMs: number;
  };
  started: boolean;
  maxPlayers: number;
}

export interface JoinResult {
  /** LA CREDENCIAL DEL ASIENTO. Va solo en el ack, nunca en un broadcast. */
  playerToken: string;
  playerId: string;
  roomId: string;
  room: RedactedRoomState;
}

export interface ResumeResult {
  playerId: string;
  room: RedactedRoomState;
  /** Presente solo si la partida ya empezo. */
  state: RedactedGameState | null;
}

export interface ClientToServerEvents {
  'room:create': (payload: CreateRoomPayload, ack: (res: Ack<JoinResult>) => void) => void;
  'room:join': (payload: JoinRoomPayload, ack: (res: Ack<JoinResult>) => void) => void;
  'room:leave': (ack: (res: Ack) => void) => void;
  'session:resume': (payload: ResumeSessionPayload, ack: (res: Ack<ResumeResult>) => void) => void;
  'game:start': (payload: StartGamePayload, ack: (res: Ack) => void) => void;
  'game:command': (
    payload: CommandEnvelope,
    ack: (res: Ack<{ version: number; clientSeq: number }>) => void,
  ) => void;
  'game:nextRound': (ack: (res: Ack) => void) => void;
}

export interface ServerToClientEvents {
  /** Estado completo. Se manda al entrar y al reconectar. */
  'state:sync': (state: RedactedGameState) => void;
  /**
   * Estado redactado COMPLETO + los eventos que lo causaron.
   *
   * No mandamos diffs a proposito: con 10 jugadores el payload son pocos KB, y
   * un diff real (JSON Patch, CRDT) es optimizacion prematura y una fuente
   * enorme de bugs de desincronizacion. El estado es la verdad; los eventos
   * dicen que animar.
   */
  'state:patch': (payload: { state: RedactedGameState; events: GameEvent[] }) => void;
  'room:updated': (room: RedactedRoomState) => void;
  'error:game': (error: { code: ProtocolErrorCode; message: string }) => void;
  /** El servidor se esta por reiniciar: las salas viven en memoria. */
  'server:shutdown': (payload: { message: string }) => void;
}

export interface SocketData {
  playerId: string | null;
  roomId: string | null;
  playerToken: string | null;
}

/** Sin uso hoy (no hay comunicacion entre instancias), pero lo pide el generico. */
export type InterServerEvents = Record<string, never>;
