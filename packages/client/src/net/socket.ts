import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@uno/protocol';
import { useGameStore } from '../stores/game.js';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL = import.meta.env['VITE_SERVER_URL'] ?? 'http://localhost:3000';

/**
 * Singleton a nivel de modulo, NO un hook.
 *
 * Un useSocket() que abriera la conexion se montaria y desmontaria con el arbol
 * de React: pelea con StrictMode (doble efecto en dev) y termina abriendo dos
 * sockets. El socket es un singleton de aplicacion, no parte del ciclo de vida
 * de un componente.
 *
 * Tampoco va como middleware de Zustand: el middleware es para transformar
 * set/get, no para I/O.
 */
let socket: ClientSocket | null = null;

export function getSocket(): ClientSocket {
  if (socket) return socket;

  socket = io(SERVER_URL, {
    autoConnect: false,
    // Dejamos el backoff exponencial por defecto de Socket.IO.
    reconnection: true,
    reconnectionAttempts: Infinity,
  });

  const store = useGameStore.getState();

  socket.on('connect', () => store.setConnection('connected'));
  socket.on('disconnect', () => store.setConnection('disconnected'));
  socket.io.on('reconnect_attempt', () => store.setConnection('reconnecting'));
  socket.on('connect_error', () => store.setConnection('disconnected'));

  return socket;
}

export function connect(): ClientSocket {
  const s = getSocket();
  if (!s.connected) {
    useGameStore.getState().setConnection('connecting');
    s.connect();
  }
  return s;
}

export function disconnect(): void {
  socket?.disconnect();
}

/** Emite y espera el ack. Toda la comunicacion pasa por aca. */
export function emitWithAck<T>(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<T> {
  const s = getSocket();
  return new Promise<T>((resolve) => {
    (s.emit as (e: string, ...rest: unknown[]) => void)(event, ...args, resolve);
  });
}

export const serverUrl = SERVER_URL;
