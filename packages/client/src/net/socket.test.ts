import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SocketModule from './socket.js';

/**
 * Socket.IO daba gratis los acks, el timeout y la reconexion. Al reimplementarlos
 * sobre WebSocket nativo, estos son los comportamientos que no pueden romperse.
 */

type Listener = (event: unknown) => void;

/** WebSocket falso, controlable desde el test. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  // Los mismos valores que el WebSocket real: el codigo compara contra
  // WebSocket.CONNECTING, asi que el fake tiene que declararlo.
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = 0;
  sent: string[] = [];
  onopen: Listener | null = null;
  onmessage: Listener | null = null;
  onclose: Listener | null = null;
  onerror: Listener | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code: 1000 });
  }

  /** Simula que el servidor acepto la conexion. */
  accept(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  /** Simula un mensaje del servidor. */
  receive(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  /** Simula una caida de red (sin handshake de cierre). */
  drop(code = 1006): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code });
  }

  static last(): FakeWebSocket {
    return FakeWebSocket.instances.at(-1)!;
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }
}

vi.stubGlobal('WebSocket', FakeWebSocket);

let net: typeof SocketModule;

beforeEach(async () => {
  FakeWebSocket.reset();
  vi.resetModules();
  vi.useFakeTimers();
  net = await import('./socket.js');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('request/response', () => {
  it('correlaciona la respuesta con su request por id', async () => {
    net.connect();
    FakeWebSocket.last().accept();

    const promise = net.emitWithAck<{ ok: boolean; roomId: string }>('room:create', {
      nickname: 'Lautaro',
    });

    const sent = JSON.parse(FakeWebSocket.last().sent[0]!) as { t: string; id: number; ev: string };
    expect(sent.t).toBe('req');
    expect(sent.ev).toBe('room:create');

    FakeWebSocket.last().receive({ t: 'res', id: sent.id, d: { ok: true, roomId: 'AB12' } });
    await expect(promise).resolves.toEqual({ ok: true, roomId: 'AB12' });
  });

  it('resuelve cada request con SU respuesta, aunque lleguen desordenadas', async () => {
    net.connect();
    FakeWebSocket.last().accept();

    const first = net.emitWithAck<{ n: number }>('room:create', { nickname: 'A' });
    const second = net.emitWithAck<{ n: number }>('room:create', { nickname: 'B' });

    const ids = FakeWebSocket.last().sent.map((raw) => (JSON.parse(raw) as { id: number }).id);
    // El servidor responde al segundo primero.
    FakeWebSocket.last().receive({ t: 'res', id: ids[1], d: { n: 2 } });
    FakeWebSocket.last().receive({ t: 'res', id: ids[0], d: { n: 1 } });

    await expect(first).resolves.toEqual({ n: 1 });
    await expect(second).resolves.toEqual({ n: 2 });
  });

  it('RESUELVE con error al vencer el timeout, no rechaza', async () => {
    // Todo commands.ts asume que el ack siempre llega y hace `if (!res.ok)`.
    // Rechazar reventaria sendCommand sin desmarcar cardsInFlight, y la carta
    // quedaria invisible para siempre.
    net.connect();
    FakeWebSocket.last().accept();

    const promise = net.emitWithAck<{ ok: boolean; code: string }>('game:start', {});
    vi.advanceTimersByTime(10_500);

    const res = await promise;
    expect(res.ok).toBe(false);
    expect(res.code).toBe('INTERNAL_ERROR');
  });

  it('ENCOLA los requests emitidos antes de que el socket abra', async () => {
    // Socket.IO bufferea los emits hasta conectar. Sin replicarlo, el primer
    // createRoom tras cargar la pagina fallaba con "sin conexion" porque el
    // socket todavia estaba en CONNECTING.
    net.connect();
    const promise = net.emitWithAck<{ ok: boolean }>('room:create', { nickname: 'Lautaro' });

    // Todavia no abrio: no se mando nada.
    expect(FakeWebSocket.last().sent).toHaveLength(0);

    FakeWebSocket.last().accept();
    expect(FakeWebSocket.last().sent).toHaveLength(1);

    const sent = JSON.parse(FakeWebSocket.last().sent[0]!) as { id: number };
    FakeWebSocket.last().receive({ t: 'res', id: sent.id, d: { ok: true } });
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('responde con error si se pide algo sin conexion', async () => {
    const res = await net.emitWithAck<{ ok: boolean }>('game:start', {});
    expect(res.ok).toBe(false);
  });

  it('resuelve los pendientes al cerrarse la conexion, sin dejarlos colgados', async () => {
    net.connect();
    FakeWebSocket.last().accept();

    const promise = net.emitWithAck<{ ok: boolean }>('game:start', {});
    FakeWebSocket.last().drop();

    await expect(promise).resolves.toMatchObject({ ok: false });
  });
});

describe('pushes', () => {
  it('entrega los eventos del servidor al handler', () => {
    const seen: Array<{ event: string; data: unknown }> = [];
    net.getSocket().setPushHandler((event, data) => seen.push({ event, data }));

    net.connect();
    FakeWebSocket.last().accept();
    FakeWebSocket.last().receive({ t: 'push', ev: 'room:updated', d: { roomId: 'AB12' } });

    expect(seen).toEqual([{ event: 'room:updated', data: { roomId: 'AB12' } }]);
  });

  it('ignora un mensaje que no es JSON en vez de romper', () => {
    net.connect();
    FakeWebSocket.last().accept();
    expect(() => FakeWebSocket.last().onmessage?.({ data: 'no soy json' })).not.toThrow();
  });
});

describe('reconexion', () => {
  it('reintenta tras una caida de red', () => {
    net.connect();
    FakeWebSocket.last().accept();
    expect(FakeWebSocket.instances).toHaveLength(1);

    FakeWebSocket.last().drop();
    vi.advanceTimersByTime(2_000);

    expect(FakeWebSocket.instances.length).toBeGreaterThan(1);
  });

  it('NO reintenta tras un cierre por violacion de protocolo', () => {
    // 1008 es terminal (sobre invalido, sesion tomada): reintentar seria un bucle.
    net.connect();
    FakeWebSocket.last().accept();
    FakeWebSocket.last().drop(1008);

    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('NO reintenta si la desconexion fue intencional', () => {
    net.connect();
    FakeWebSocket.last().accept();
    net.disconnect();

    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('dispara el hook onOpen al reconectar, para reclamar el asiento', () => {
    let opens = 0;
    net.getSocket().setOnOpen(() => opens++);

    net.connect();
    FakeWebSocket.last().accept();
    expect(opens).toBe(1);

    FakeWebSocket.last().drop();
    vi.advanceTimersByTime(5_000);
    FakeWebSocket.last().accept();

    // Sin esto, una reconexion silenciosa dejaba al jugador con el socket
    // abierto pero sin asiento del lado del servidor.
    expect(opens).toBe(2);
  });

  it('el backoff crece entre intentos', () => {
    net.connect();
    FakeWebSocket.last().accept();

    FakeWebSocket.last().drop();
    vi.advanceTimersByTime(2_000);
    const afterFirst = FakeWebSocket.instances.length;

    FakeWebSocket.last().drop();
    // Con el backoff creciendo, 1s ya no alcanza para el segundo reintento.
    vi.advanceTimersByTime(900);
    expect(FakeWebSocket.instances).toHaveLength(afterFirst);
  });
});
