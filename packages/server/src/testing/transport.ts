import { io as connect, type Socket } from 'socket.io-client';
import WebSocket from 'ws';
import {
  type ClientToServerEvents,
  type PushEnvelope,
  type ReqEnvelope,
  type ServerEnvelope,
  type ServerToClientEvents,
} from '@uno/protocol';

/** Handlers que el TestClient registra, agnosticos del transporte. */
export interface TransportHandlers {
  onPush(event: keyof ServerToClientEvents, data: unknown): void;
}

/**
 * Lo que el TestClient necesita de un transporte.
 *
 * Extraerlo es lo que permite correr los MISMOS tests sobre Socket.IO y sobre
 * WebSocket nativo: si un test pasa en uno y falla en el otro, el bug esta en
 * la capa de transporte; si falla en los dos, esta en la logica compartida.
 */
export interface TestTransport {
  connect(handlers: TransportHandlers): Promise<void>;
  request<T>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T>;
  /** Corta de golpe, como una caida de red. */
  hardDisconnect(): void;
  close(): void;
  readonly connected: boolean;
}

export type TransportKind = 'socketio' | 'ws';

export function createTransport(kind: TransportKind, url: string): TestTransport {
  return kind === 'socketio' ? new SocketIoTransport(url) : new WsTransport(url);
}

class SocketIoTransport implements TestTransport {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private handlers: TransportHandlers | null = null;

  constructor(private readonly url: string) {}

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  async connect(handlers: TransportHandlers): Promise<void> {
    this.handlers = handlers;
    const socket = connect(this.url, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
    });
    this.socket = socket;

    for (const event of [
      'state:sync',
      'state:patch',
      'room:updated',
      'error:game',
      'server:shutdown',
    ] as const) {
      socket.on(event, (data: unknown) => handlers.onPush(event, data));
    }

    if (socket.connected) return;
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
  }

  request<T>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
    const socket = this.socket;
    if (!socket) throw new Error('transporte no conectado');
    return new Promise<T>((resolve) => {
      const args: unknown[] = payload === undefined ? [] : [payload];
      (socket.emit as (e: string, ...rest: unknown[]) => void)(event, ...args, resolve);
    });
  }

  hardDisconnect(): void {
    this.socket?.disconnect();
  }

  close(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}

/**
 * Transporte sobre WebSocket nativo: el mismo protocolo que usara el cliente
 * real y el Durable Object.
 */
class WsTransport implements TestTransport {
  private socket: WebSocket | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, (value: never) => void>();

  constructor(private readonly url: string) {}

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async connect(handlers: TransportHandlers): Promise<void> {
    const wsUrl = this.url.replace(/^http/, 'ws') + '/ws';
    const socket = new WebSocket(wsUrl);
    this.socket = socket;

    socket.on('message', (raw: Buffer) => {
      const envelope = JSON.parse(String(raw)) as ServerEnvelope;
      if (envelope.t === 'res') {
        const resolve = this.pending.get(envelope.id);
        if (resolve) {
          this.pending.delete(envelope.id);
          resolve(envelope.d as never);
        }
        return;
      }
      const push = envelope as PushEnvelope;
      handlers.onPush(push.ev, push.d);
    });

    // Al cerrarse, los requests pendientes no pueden quedar colgados.
    socket.on('close', () => this.failPending());

    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
  }

  request<T>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.resolve({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'sin conexion',
      } as T);
    }

    const id = ++this.nextId;
    const envelope: ReqEnvelope = {
      t: 'req',
      id,
      ev: event,
      ...(payload === undefined ? {} : { d: payload }),
    };

    return new Promise<T>((resolve) => {
      this.pending.set(id, resolve as (value: never) => void);
      socket.send(JSON.stringify(envelope));
    });
  }

  hardDisconnect(): void {
    // terminate() corta sin handshake de cierre: es una caida de red, no un adios.
    this.socket?.terminate();
    this.failPending();
  }

  close(): void {
    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = null;
    this.failPending();
  }

  private failPending(): void {
    for (const resolve of this.pending.values()) {
      (resolve as (v: unknown) => void)({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'conexion cerrada',
      });
    }
    this.pending.clear();
  }
}
