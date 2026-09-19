import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@uno/protocol';
import type { ConnectionContext, Emitter, Gateway, PushPayload } from '@uno/core';

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

/**
 * Adaptador de Socket.IO al puerto `Emitter`.
 *
 * Toda la logica vive en `@uno/core`, que no sabe que existe Socket.IO. Esto
 * es lo unico que los conecta — y su equivalente para el Worker sera un
 * `WsEmitter` que hace `ws.send(JSON.stringify(...))`.
 */
export class SocketIOEmitter implements Emitter {
  constructor(private readonly io: UnoServer) {}

  push<E extends keyof ServerToClientEvents>(
    connectionId: string,
    event: E,
    data: PushPayload<E>,
  ): void {
    // El cast es necesario porque Socket.IO tipa emit por evento y aca el
    // evento es generico; la firma publica ya garantiza que el par
    // (evento, payload) es correcto.
    (this.io.to(connectionId).emit as (ev: string, payload: unknown) => void)(event, data);
  }
}

/** Los eventos que un cliente puede originar. Nada mas que estos. */
const CLIENT_EVENTS = [
  'room:create',
  'room:join',
  'room:leave',
  'session:resume',
  'game:start',
  'game:command',
  'game:nextRound',
] as const;

/**
 * Cablea los eventos de Socket.IO al `dispatch` del Gateway.
 *
 * Antes cada handler tenia su logica adentro; ahora son todos la misma linea.
 * Esa uniformidad es la prueba de que la logica quedo del lado agnostico.
 */
export function registerSocketIO(io: UnoServer, gateway: Gateway): void {
  io.on('connection', (socket: UnoSocket) => {
    const ctx: ConnectionContext = {
      connectionId: socket.id,
      playerId: null,
      roomId: null,
      playerToken: null,
    };

    for (const event of CLIENT_EVENTS) {
      socket.on(event, (...args: unknown[]) => {
        // El ultimo argumento es siempre el ack; los eventos sin payload
        // (room:leave, game:nextRound) llegan solo con el.
        const ack = args.at(-1) as (res: unknown) => void;
        const payload = args.length > 1 ? args[0] : undefined;
        void gateway.dispatch(ctx, event, payload).then(ack);
      });
    }

    socket.on('disconnect', (reason) => gateway.handleDisconnect(ctx, reason));
  });
}
