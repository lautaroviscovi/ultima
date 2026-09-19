import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  MAX_MESSAGE_BYTES,
  reqEnvelopeSchema,
  type PushEnvelope,
  type ResEnvelope,
  type ServerToClientEvents,
} from '@uno/protocol';
import {
  generatePlayerId,
  type ConnectionContext,
  type Gateway,
  type Logger,
  type OwnedEmitter,
  type PushPayload,
} from '@uno/core';

/** Códigos de cierre para violaciones de protocolo. */
const CLOSE_POLICY = 1008;

/**
 * Emitter sobre WebSocket nativo.
 *
 * Es el gemelo de `SocketIOEmitter`: mismo puerto, otro transporte. Que los dos
 * quepan en ~15 lineas es la prueba de que la logica quedo del lado agnostico.
 */
export class WsEmitter implements OwnedEmitter {
  private readonly sockets = new Map<string, WebSocket>();

  owns(connectionId: string): boolean {
    return this.sockets.has(connectionId);
  }

  add(connectionId: string, socket: WebSocket): void {
    this.sockets.set(connectionId, socket);
  }

  remove(connectionId: string): void {
    this.sockets.delete(connectionId);
  }

  push<E extends keyof ServerToClientEvents>(
    connectionId: string,
    event: E,
    data: PushPayload<E>,
  ): void {
    const socket = this.sockets.get(connectionId);
    if (!socket || socket.readyState !== socket.OPEN) return;
    const envelope: PushEnvelope = { t: 'push', ev: event, d: data };
    socket.send(JSON.stringify(envelope));
  }
}

export interface WsTransportDeps {
  httpServer: HttpServer;
  gateway: Gateway;
  emitter: WsEmitter;
  logger: Logger;
  /** Ruta del endpoint. Convive con el de Socket.IO, que usa /socket.io/. */
  path?: string;
}

/**
 * Monta el endpoint de WebSocket nativo sobre el mismo servidor HTTP.
 *
 * Convive con Socket.IO a proposito: durante el port, los dos transportes
 * corren en paralelo y la suite de tests se ejecuta sobre ambos. Si un test
 * pasa en uno y falla en el otro, el bug esta en la capa de transporte; si
 * falla en los dos, esta en la logica compartida. Eso es informacion de
 * diagnostico que de otra forma no se tiene.
 */
export function registerWsTransport(deps: WsTransportDeps): WebSocketServer {
  const { httpServer, gateway, emitter, logger, path = '/ws' } = deps;

  /**
   * `noServer` en vez de `server`: con `server`, ws adjunta SU handler de
   * upgrade al servidor HTTP y rechaza todo lo que no matchee su path —
   * incluido el handshake de Socket.IO, que vive en /socket.io/. Ruteando el
   * upgrade a mano, los dos transportes conviven en el mismo puerto.
   */
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  httpServer.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname !== path) return; // no es nuestro: lo maneja Socket.IO
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });

  wss.on('connection', (socket: WebSocket) => {
    const ctx: ConnectionContext = {
      connectionId: generatePlayerId(),
      playerId: null,
      roomId: null,
      playerToken: null,
    };
    emitter.add(ctx.connectionId, socket);

    socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[]) => {
      void handleMessage(raw);
    });

    async function handleMessage(raw: Buffer | ArrayBuffer | Buffer[]): Promise<void> {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        // No hay cliente legitimo que mande JSON invalido: se cierra en vez de
        // responder, para no darle un canal barato a quien sondea.
        socket.close(CLOSE_POLICY, 'json invalido');
        return;
      }

      const envelope = reqEnvelopeSchema.safeParse(parsed);
      if (!envelope.success) {
        socket.close(CLOSE_POLICY, 'sobre invalido');
        return;
      }

      const { id, ev, d } = envelope.data;
      const ack = await gateway.dispatch(ctx, ev, d);
      if (socket.readyState !== socket.OPEN) return;

      const response: ResEnvelope = { t: 'res', id, d: ack };
      socket.send(JSON.stringify(response));
    }

    socket.on('close', () => {
      emitter.remove(ctx.connectionId);
      gateway.handleDisconnect(ctx, 'transport close');
    });

    socket.on('error', (error: Error) => {
      logger.warn({ connectionId: ctx.connectionId, err: error.message }, 'error de websocket');
    });
  });

  return wss;
}
