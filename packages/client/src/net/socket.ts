import {
  MAX_MESSAGE_BYTES,
  type ClientToServerEvents,
  type PushEnvelope,
  type ReqEnvelope,
  type ServerEnvelope,
  type ServerToClientEvents,
} from '@uno/protocol';
import { useGameStore } from '../stores/game.js';

const SERVER_URL = import.meta.env['VITE_SERVER_URL'] ?? 'http://localhost:3000';

/** Un request sin respuesta cuelga la promesa para siempre si no hay timeout. */
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

/** Handler de un push del servidor. */
export type PushHandler = (event: keyof ServerToClientEvents, data: unknown) => void;

interface Pending {
  resolve: (value: never) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Transporte WebSocket nativo, singleton a nivel de modulo.
 *
 * NO es un hook: un `useSocket()` que abriera la conexion se montaria y
 * desmontaria con el arbol de React, pelearia con StrictMode y terminaria
 * abriendo dos sockets. El socket es un singleton de aplicacion.
 *
 * Reemplaza a socket.io-client, que daba gratis los acks y la reconexion. Los
 * acks se correlacionan con el `id` del envelope; la reconexion esta abajo.
 */
class UnoSocket {
  private ws: WebSocket | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, Pending>();
  private pushHandler: PushHandler | null = null;

  /**
   * Requests emitidos antes de que el socket abriera.
   *
   * Socket.IO bufferea los emits hasta conectar; sobre WS nativo hay que
   * hacerlo a mano. Sin esto, el primer `createRoom` tras cargar la pagina
   * falla con "sin conexion" porque el socket todavia esta en CONNECTING.
   */
  private readonly queued: Array<() => void> = [];

  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  /** Se dispara al (re)abrir: es donde el cliente reclama su asiento. */
  private onOpenHook: (() => void) | null = null;

  /**
   * La sala a la que hay que conectarse.
   *
   * En Node el servidor acepta cualquier conexion y la sala se resuelve por
   * comando. En Cloudflare, el Worker necesita el codigo ANTES de aceptar el
   * socket, porque de ahi sale a que Durable Object rutear. Por eso el codigo
   * viaja en la URL, y si cambia hay que reconectar.
   */
  private roomId: string | null = null;

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  setPushHandler(handler: PushHandler): void {
    this.pushHandler = handler;
  }

  setOnOpen(hook: () => void): void {
    this.onOpenHook = hook;
  }

  connect(roomId?: string): void {
    const sameRoom = roomId === undefined || roomId === this.roomId;
    if (
      sameRoom &&
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (roomId !== undefined && roomId !== this.roomId) {
      // Cambio de sala: hay que abrir una conexion nueva al DO que corresponda.
      this.roomId = roomId;
      this.ws?.close();
      this.ws = null;
    }

    this.intentionallyClosed = false;
    this.open();
  }

  private open(): void {
    const store = useGameStore.getState();
    store.setConnection(this.attempts === 0 ? 'connecting' : 'reconnecting');

    const base = SERVER_URL.replace(/^http/, 'ws') + '/ws';
    const url = this.roomId ? `${base}?room=${encodeURIComponent(this.roomId)}` : base;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      useGameStore.getState().setConnection('connected');

      // Primero el hook (reclama el asiento), despues lo que estaba encolado.
      this.onOpenHook?.();
      const queued = this.queued.splice(0);
      for (const send of queued) send();
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string' || event.data.length > MAX_MESSAGE_BYTES) return;
      let envelope: ServerEnvelope;
      try {
        envelope = JSON.parse(event.data) as ServerEnvelope;
      } catch {
        return;
      }

      if (envelope.t === 'res') {
        const pending = this.pending.get(envelope.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(envelope.id);
        pending.resolve(envelope.d as never);
        return;
      }

      const push = envelope as PushEnvelope;
      this.pushHandler?.(push.ev, push.d);
    };

    ws.onclose = (event) => {
      this.failPending('conexión cerrada');
      useGameStore.getState().setConnection('disconnected');

      // 1008 es violacion de protocolo y SESSION_TAKEN_OVER es terminal:
      // reintentar seria un bucle.
      if (this.intentionallyClosed || event.code === 1008) return;
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // El close que sigue se encarga de reprogramar.
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    /**
     * Backoff exponencial CON jitter. El jitter no es cosmetico: sin el, un
     * redeploy hace que todas las pestañas reconecten en el mismo milisegundo.
     */
    const base = Math.min(1000 * 2 ** this.attempts, MAX_BACKOFF_MS);
    const delay = base * (0.5 + Math.random() * 0.5);
    this.attempts++;

    useGameStore.getState().setConnection('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // Si la pestaña esta oculta, diferimos: ahorra requests en pestañas
      // olvidadas, que es un caso real.
      if (typeof document !== 'undefined' && document.hidden) {
        this.scheduleReconnect();
        return;
      }
      this.open();
    }, delay);
  }

  /** Emite y espera el ack correlacionado por id. */
  request<T>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
    const connecting = this.ws?.readyState === WebSocket.CONNECTING;
    if (!this.ws || (!this.connected && !connecting)) {
      return Promise.resolve(this.offline<T>());
    }

    const id = ++this.nextId;
    const envelope: ReqEnvelope = {
      t: 'req',
      id,
      ev: event,
      ...(payload === undefined ? {} : { d: payload }),
    };

    return new Promise<T>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        // RESOLVE, no reject: todo commands.ts asume que el ack siempre llega
        // y hace `if (!res.ok)`. Rechazar reventaria sendCommand sin desmarcar
        // cardsInFlight, y la carta quedaria invisible.
        resolve(this.offline<T>('el servidor no respondió'));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve: resolve as (v: never) => void, timer });

      const send = (): void => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(envelope));
      };
      // Si todavia no abrio, se encola: el timeout sigue corriendo igual, asi
      // que un socket que nunca abre no deja la promesa colgada.
      if (connecting) this.queued.push(send);
      else send();
    });
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.failPending('desconectado');
  }

  private failPending(message: string): void {
    for (const { resolve, timer } of this.pending.values()) {
      clearTimeout(timer);
      (resolve as (v: unknown) => void)(this.offline(message));
    }
    this.pending.clear();
  }

  private offline<T>(message = 'sin conexión'): T {
    return { ok: false, code: 'INTERNAL_ERROR', message } as T;
  }
}

const socket = new UnoSocket();

export function getSocket(): UnoSocket {
  return socket;
}

export function connect(roomId?: string): UnoSocket {
  socket.connect(roomId);
  return socket;
}

/**
 * Reserva un codigo de sala en el servidor.
 *
 * Solo el backend de Cloudflare lo necesita: alli la identidad del Durable
 * Object se fija con el codigo antes de que la sala exista. El servidor Node
 * devuelve 404 y en ese caso se sigue con el flujo de siempre.
 */
export type ClaimResult =
  /** El backend reservo el codigo (Cloudflare). */
  | { kind: 'claimed'; roomId: string }
  /** Este backend no necesita reserva: el servidor genera el codigo (Node). */
  | { kind: 'not-needed' }
  /** No se pudo hablar con el servidor. */
  | { kind: 'unreachable'; message: string };

export async function claimRoom(): Promise<ClaimResult> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/claim`, { method: 'POST' });
  } catch {
    /**
     * Distinguir "no hace falta" de "no llegue" importa: con el backend de
     * Node el /claim devuelve 404 y hay que seguir normal, pero si el servidor
     * no responde hay que AVISAR. Antes los dos casos daban null y el cliente
     * conectaba igual, a una sala inexistente, y el sintoma era
     * "conexion cerrada" sin explicacion.
     */
    return { kind: 'unreachable', message: 'No se pudo contactar al servidor' };
  }

  // 404 = este backend no tiene /claim (Node).
  if (res.status === 404) return { kind: 'not-needed' };
  if (!res.ok) return { kind: 'unreachable', message: `El servidor respondió ${res.status}` };

  try {
    const body = (await res.json()) as { ok: boolean; roomId?: string };
    if (body.ok && body.roomId) return { kind: 'claimed', roomId: body.roomId };
  } catch {
    // Cuerpo ilegible: lo tratamos como servidor inalcanzable.
  }
  return { kind: 'unreachable', message: 'El servidor no pudo reservar una sala' };
}

export function disconnect(): void {
  socket.disconnect();
}

/** Emite y espera el ack. Toda la comunicacion pasa por aca. */
export function emitWithAck<T>(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<T> {
  return socket.request<T>(event, args[0]);
}

export const serverUrl = SERVER_URL;
