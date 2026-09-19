import { z } from 'zod';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from './events.js';

/**
 * Protocolo de request/response sobre WebSocket nativo.
 *
 * Socket.IO daba acks gratis; sobre WS crudo no existen, asi que hay que
 * correlacionar a mano. Son tres formas de mensaje y ~60 lineas de tipos: no
 * justifica una dependencia, y meter una en la capa mas critica del sistema
 * iria contra la tesis del proyecto de que los tipos propios alcanzan.
 */

/** Pedido del cliente que espera respuesta. */
export interface ReqEnvelope {
  t: 'req';
  /**
   * Correlaciona request con response. Monotonico POR CONEXION.
   *
   * Deliberadamente distinto de `clientSeq`, que es monotonico por JUGADOR y
   * sobrevive a la reconexion: `clientSeq` es idempotencia de dominio, `id` es
   * plomeria de transporte. Confundirlos romperia la idempotencia al
   * reconectar, porque el `id` se reinicia y el `clientSeq` no.
   */
  id: number;
  ev: string;
  d?: unknown;
}

/** Respuesta a un `ReqEnvelope`, con el mismo `id`. */
export interface ResEnvelope {
  t: 'res';
  id: number;
  d: Ack<Record<string, unknown>>;
}

/** Evento del servidor que no responde a nada. */
export interface PushEnvelope {
  t: 'push';
  ev: keyof ServerToClientEvents;
  d: unknown;
}

export type ServerEnvelope = ResEnvelope | PushEnvelope;

/** Eventos que un cliente puede originar. Nada mas que estos. */
export const CLIENT_EVENTS = [
  'room:create',
  'room:join',
  'room:leave',
  'session:resume',
  'game:start',
  'game:command',
  'game:nextRound',
] as const;

export type ClientEvent = (typeof CLIENT_EVENTS)[number];

/**
 * Valida el sobre ANTES de mirar el payload.
 *
 * Socket.IO garantizaba que el evento existia; sobre WS crudo llega un string
 * arbitrario. El payload lo valida despues el schema que corresponda.
 */
export const reqEnvelopeSchema = z.object({
  t: z.literal('req'),
  id: z.number().int().nonnegative(),
  ev: z.enum(CLIENT_EVENTS),
  d: z.unknown().optional(),
});

/** Tamaño maximo de un mensaje. Es el vector mas barato de tumbar un servidor. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/**
 * Payload de un evento cliente -> servidor, derivado de la firma existente.
 *
 * Los eventos sin payload (`room:leave`, `game:nextRound`) tienen el ack como
 * primer parametro, asi que dan `undefined` — que es exactamente lo correcto.
 */
export type ReqPayload<E extends keyof ClientToServerEvents> = Parameters<
  ClientToServerEvents[E]
>[0] extends (res: never) => void
  ? undefined
  : Parameters<ClientToServerEvents[E]>[0];

/** Tipo del ack de un evento, extraido de su firma. */
export type ReqAck<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]> extends [...unknown[], (res: infer R) => void] ? R : never;

/** Payload de un evento servidor -> cliente. */
export type PushData<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>[0];
