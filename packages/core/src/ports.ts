import type { ServerToClientEvents } from '@uno/protocol';

/**
 * Los "puertos" que separan la logica de sala del transporte.
 *
 * @uno/core no puede importar nada de Node ni de Workers: tiene que compilar y
 * correr igual en un proceso Node con Socket.IO y en un Durable Object con
 * WebSocket nativo. Todo lo especifico de una plataforma entra por estas
 * interfaces.
 */

export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** Logger mudo, para tests. */
export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Payload de un evento servidor -> cliente, derivado de la firma existente. */
export type PushPayload<E extends keyof ServerToClientEvents> = Parameters<
  ServerToClientEvents[E]
>[0];

/**
 * Manda un evento a UNA conexion.
 *
 * Deliberadamente no hay un `broadcast`: cada jugador recibe una vista
 * redactada distinta, asi que emitir "a todos de una" seria imposible sin
 * romper la frontera de seguridad. La unica forma de mandarle a varios es
 * iterar y redactar por destinatario, que es lo que hace el Gateway.
 */
export interface Emitter {
  push<E extends keyof ServerToClientEvents>(
    connectionId: string,
    event: E,
    data: PushPayload<E>,
  ): void;
}

/**
 * Programa el proximo vencimiento de una sala.
 *
 * En Node es un setTimeout por sala. En un Durable Object sera la Alarms API,
 * porque un setTimeout muere cuando el objeto hiberna — y hibernar es
 * exactamente lo que pasa cuando un jugador NO juega, que es el caso que el
 * timeout existe para resolver.
 */
export interface Scheduler {
  /** Reprograma el vencimiento de una sala. Cancela el anterior. */
  schedule(roomId: string, deadline: number, now: number): void;
  cancel(roomId: string): void;
  cancelAll(): void;
}
