import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { getPlayableCards, type RedactedGameState } from '@uno/engine';
import type { ReqEnvelope, ServerEnvelope } from '@uno/protocol';

/**
 * Partida real contra el Durable Object, por WebSocket.
 *
 * Es el gate de la fase: si esto pasa, el mismo Gateway y el mismo RoomManager
 * que corren en Node corren en Cloudflare sin cambios.
 */

/** Cliente minimo sobre el WebSocket del DO. */
class DoClient {
  private nextId = 0;
  private readonly pending = new Map<number, (v: never) => void>();
  state: RedactedGameState | null = null;
  playerId: string | null = null;
  playerToken: string | null = null;
  readonly received: unknown[] = [];

  private constructor(private readonly ws: WebSocket) {}

  static async connect(roomId: string): Promise<DoClient> {
    const res = await SELF.fetch(`https://example.com/ws?room=${roomId}`, {
      headers: { Upgrade: 'websocket' },
    });
    const ws = res.webSocket;
    if (!ws) throw new Error('el servidor no devolvio un websocket');
    ws.accept();

    const client = new DoClient(ws);
    ws.addEventListener('message', (event: MessageEvent) => client.onMessage(String(event.data)));
    return client;
  }

  onMessage(raw: string): void {
    const envelope = JSON.parse(raw) as ServerEnvelope;
    if (envelope.t === 'res') {
      const resolve = this.pending.get(envelope.id);
      if (resolve) {
        this.pending.delete(envelope.id);
        resolve(envelope.d as never);
      }
      return;
    }
    this.received.push(envelope.d);
    if (envelope.ev === 'state:patch') {
      this.state = (envelope.d as { state: RedactedGameState }).state;
    }
    if (envelope.ev === 'state:sync') this.state = envelope.d as RedactedGameState;
  }

  request<T>(ev: string, d?: unknown): Promise<T> {
    const id = ++this.nextId;
    const envelope: ReqEnvelope = { t: 'req', id, ev, ...(d === undefined ? {} : { d }) };
    return new Promise<T>((resolve) => {
      this.pending.set(id, resolve as (v: never) => void);
      this.ws.send(JSON.stringify(envelope));
    });
  }

  async settle(): Promise<void> {
    await new Promise((r) => setTimeout(r, 30));
  }
}

async function claimRoom(): Promise<string> {
  const res = await SELF.fetch('https://example.com/claim', { method: 'POST' });
  return ((await res.json()) as { roomId: string }).roomId;
}

describe('partida contra el Durable Object', () => {
  it('crea sala, se unen jugadores y reparte', async () => {
    const roomId = await claimRoom();

    const host = await DoClient.connect(roomId);
    const created = await host.request<{
      ok: boolean;
      playerId: string;
      playerToken: string;
      code?: string;
      message?: string;
    }>('room:create', { nickname: 'Lautaro' });
    expect(created.ok, JSON.stringify(created)).toBe(true);
    host.playerId = created.playerId;
    host.playerToken = created.playerToken;

    const guest = await DoClient.connect(roomId);
    const joined = await guest.request<{ ok: boolean; playerId: string }>('room:join', {
      roomId,
      nickname: 'Sofia',
    });
    expect(joined.ok).toBe(true);
    guest.playerId = joined.playerId;

    const started = await host.request<{ ok: boolean }>('game:start', {});
    expect(started.ok).toBe(true);
    await host.settle();

    expect(host.state).not.toBeNull();
    expect(host.state!.you.hand.length).toBeGreaterThanOrEqual(7);
    expect(host.state!.players).toHaveLength(2);
  });

  it('LA FRONTERA DE SEGURIDAD: cada uno ve su mano y solo el conteo ajeno', async () => {
    const roomId = await claimRoom();
    const host = await DoClient.connect(roomId);
    const hostRes = await host.request<{ playerId: string }>('room:create', { nickname: 'A' });
    host.playerId = hostRes.playerId;

    const guest = await DoClient.connect(roomId);
    const guestRes = await guest.request<{ playerId: string }>('room:join', {
      roomId,
      nickname: 'B',
    });
    guest.playerId = guestRes.playerId;

    await host.request('game:start', {});
    await host.settle();

    const hostIds = new Set(host.state!.you.hand.map((c) => c.id));
    const guestIds = new Set(guest.state!.you.hand.map((c) => c.id));

    // Manos distintas.
    expect([...hostIds].some((id) => guestIds.has(id))).toBe(false);

    /**
     * Ninguno ve la carta del otro en NADA de lo que recibio.
     *
     * Se comparan ids COMPLETOS, no substrings: con `toContain`, buscar
     * "r0c3" da falso positivo contra "r0c36", que puede ser una carta propia.
     * Ese error hacia fallar el test ~1 de cada 3 corridas sin que hubiera
     * filtracion real.
     */
    const seenIds = new Set(
      (JSON.stringify(host.received).match(/"id":"(r\d+c\d+)"/g) ?? []).map((m) =>
        m.slice('"id":"'.length, -1),
      ),
    );
    const discardId = host.state!.discardTop?.id;
    for (const id of guestIds) {
      if (id === discardId) continue;
      expect(seenIds.has(id), `el host vio la carta ajena ${id}`).toBe(false);
    }

    // Del ajeno solo se ve el conteo.
    for (const p of host.state!.players) {
      expect(p).not.toHaveProperty('hand');
      expect(typeof p.cardCount).toBe('number');
    }
    // Y del mazo, el tamaño y nunca el orden.
    expect(host.state!).not.toHaveProperty('drawPile');
  });

  it('juega turnos reales y el estado avanza', async () => {
    const roomId = await claimRoom();
    const host = await DoClient.connect(roomId);
    const a = await host.request<{ playerId: string }>('room:create', { nickname: 'A' });
    host.playerId = a.playerId;

    const guest = await DoClient.connect(roomId);
    const b = await guest.request<{ playerId: string }>('room:join', { roomId, nickname: 'B' });
    guest.playerId = b.playerId;

    await host.request('game:start', {});
    await host.settle();

    const startVersion = host.state!.version;
    let seq = 0;

    for (let turn = 0; turn < 12; turn++) {
      const client = [host, guest].find((c) => c.state?.currentPlayerId === c.playerId);
      if (!client?.state) break;
      const state = client.state;

      let command: unknown;
      if (state.phase === 'choosing_color') command = { type: 'CHOOSE_COLOR', color: 'red' };
      else if (state.phase === 'card_drawn') command = { type: 'PASS' };
      else {
        const card = getPlayableCards(state.you.hand, state.activeColor, state.discardTop)[0];
        command = card
          ? { type: 'PLAY_CARD', cardId: card.id, chosenColor: 'red', declareUno: true }
          : { type: 'DRAW_CARD' };
      }

      await client.request('game:command', { command, clientSeq: ++seq });
      await client.settle();
    }

    expect(host.state!.version).toBeGreaterThan(startVersion);
  });

  it('rechaza jugar fuera de turno', async () => {
    const roomId = await claimRoom();
    const host = await DoClient.connect(roomId);
    const a = await host.request<{ playerId: string }>('room:create', { nickname: 'A' });
    host.playerId = a.playerId;

    const guest = await DoClient.connect(roomId);
    const b = await guest.request<{ playerId: string }>('room:join', { roomId, nickname: 'B' });
    guest.playerId = b.playerId;

    await host.request('game:start', {});
    await host.settle();

    const notTurn = [host, guest].find((c) => c.state?.currentPlayerId !== c.playerId)!;
    const res = await notTurn.request<{ ok: boolean; code: string }>('game:command', {
      command: { type: 'PLAY_CARD', cardId: notTurn.state!.you.hand[0]!.id },
      clientSeq: 1,
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe('NOT_YOUR_TURN');
  });

  it('recupera el asiento con el token tras reconectar', async () => {
    const roomId = await claimRoom();
    const host = await DoClient.connect(roomId);
    const a = await host.request<{ playerId: string; playerToken: string }>('room:create', {
      nickname: 'A',
    });

    const guest = await DoClient.connect(roomId);
    await guest.request('room:join', { roomId, nickname: 'B' });
    await host.request('game:start', {});
    await host.settle();

    const handBefore = host.state!.you.hand.map((c) => c.id);

    // Reconecta con una conexion nueva y reclama el asiento.
    const reconnected = await DoClient.connect(roomId);
    const resumed = await reconnected.request<{
      ok: boolean;
      playerId: string;
      state: RedactedGameState | null;
    }>('session:resume', { roomId, playerToken: a.playerToken });

    expect(resumed.ok).toBe(true);
    expect(resumed.playerId).toBe(a.playerId);
    // Mano intacta: el asiento se conserva.
    expect(resumed.state!.you.hand.map((c) => c.id)).toEqual(handBefore);
  });

  it('cierra la conexion ante un sobre invalido', async () => {
    const roomId = await claimRoom();
    const client = await DoClient.connect(roomId);
    // No hay cliente legitimo que mande esto: se cierra en vez de responder.
    const res = await Promise.race([
      client.request<{ ok: boolean }>('evento:inventado', {}),
      new Promise((r) => setTimeout(() => r('cerrado'), 200)),
    ]);
    expect(res).toBe('cerrado');
  });
});
