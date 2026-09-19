import { env, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { RedactedGameState } from '@uno/engine';
import type { ReqEnvelope, ServerEnvelope } from '@uno/protocol';

/**
 * El test que justifica la fase: si el Durable Object se evicta a mitad de
 * partida, el estado tiene que volver EXACTO desde el snapshot.
 *
 * Sin esto, un objeto evictado significa una partida perdida sin aviso.
 */

class Client {
  private nextId = 0;
  private readonly pending = new Map<number, (v: never) => void>();
  state: RedactedGameState | null = null;
  playerId: string | null = null;
  playerToken: string | null = null;

  private constructor(private readonly ws: WebSocket) {}

  static async connect(roomId: string): Promise<Client> {
    const res = await SELF.fetch(`https://example.com/ws?room=${roomId}`, {
      headers: { Upgrade: 'websocket' },
    });
    const ws = res.webSocket!;
    ws.accept();
    const client = new Client(ws);
    ws.addEventListener('message', (event: MessageEvent) => {
      const envelope = JSON.parse(String(event.data)) as ServerEnvelope;
      if (envelope.t === 'res') {
        const resolve = client.pending.get(envelope.id);
        if (resolve) {
          client.pending.delete(envelope.id);
          resolve(envelope.d as never);
        }
        return;
      }
      if (envelope.ev === 'state:patch') {
        client.state = (envelope.d as { state: RedactedGameState }).state;
      }
      if (envelope.ev === 'state:sync') client.state = envelope.d as RedactedGameState;
    });
    return client;
  }

  request<T>(ev: string, d?: unknown): Promise<T> {
    const id = ++this.nextId;
    const envelope: ReqEnvelope = { t: 'req', id, ev, ...(d === undefined ? {} : { d }) };
    return new Promise<T>((resolve) => {
      this.pending.set(id, resolve as (v: never) => void);
      this.ws.send(JSON.stringify(envelope));
    });
  }

  close(): void {
    this.ws.close();
  }
}

async function claimRoom(): Promise<string> {
  const res = await SELF.fetch('https://example.com/claim', { method: 'POST' });
  return ((await res.json()) as { roomId: string }).roomId;
}

/** Arma una partida de 2 en curso y devuelve los clientes. */
async function startedGame(): Promise<{ roomId: string; host: Client; guest: Client }> {
  const roomId = await claimRoom();

  const host = await Client.connect(roomId);
  const a = await host.request<{ playerId: string; playerToken: string }>('room:create', {
    nickname: 'A',
  });
  host.playerId = a.playerId;
  host.playerToken = a.playerToken;

  const guest = await Client.connect(roomId);
  const b = await guest.request<{ playerId: string; playerToken: string }>('room:join', {
    roomId,
    nickname: 'B',
  });
  guest.playerId = b.playerId;
  guest.playerToken = b.playerToken;

  await host.request('game:start', {});
  await new Promise((r) => setTimeout(r, 40));
  return { roomId, host, guest };
}

describe('persistencia del snapshot', () => {
  it('guarda la sala en storage al aplicar comandos', async () => {
    const { roomId } = await startedGame();
    const stub = env.ROOM.get(env.ROOM.idFromName(roomId));

    await runInDurableObject(stub, async (_instance, state) => {
      const snapshot = await state.storage.get('room:snapshot');
      expect(snapshot, 'la sala tiene que estar persistida').toBeDefined();
    });
  });

  it('el snapshot incluye la POSICION DEL RNG', async () => {
    // Sin esto el snapshot seria una mentira sutil: el Rng vive fuera del
    // GameState y al restaurar volveria a la posicion 0, haciendo divergir el
    // proximo re-barajado o color por timeout.
    const { roomId } = await startedGame();
    const stub = env.ROOM.get(env.ROOM.idFromName(roomId));

    await runInDurableObject(stub, async (_instance, state) => {
      const snapshot = await state.storage.get<{ rngConsumed: number | null }>('room:snapshot');
      expect(snapshot!.rngConsumed).toBeTypeOf('number');
      expect(snapshot!.rngConsumed).toBeGreaterThan(0);
    });
  });

  it('el snapshot NO guarda sockets: no sobreviven a la eviccion', async () => {
    const { roomId } = await startedGame();
    const stub = env.ROOM.get(env.ROOM.idFromName(roomId));

    await runInDurableObject(stub, async (_instance, state) => {
      const snapshot = await state.storage.get<{
        seats: Array<{ socketId: string | null; connected: boolean }>;
      }>('room:snapshot');
      for (const seat of snapshot!.seats) {
        expect(seat.socketId).toBeNull();
        expect(seat.connected).toBe(false);
      }
    });
  });

  it('LA PRUEBA: el estado vuelve exacto tras una eviccion', async () => {
    const { roomId, host } = await startedGame();
    const handBefore = host.state!.you.hand.map((c) => c.id);
    const versionBefore = host.state!.version;
    const token = host.playerToken!;
    const playerId = host.playerId;

    // Forzamos la eviccion: el estado en memoria se pierde por completo.
    const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
    await runInDurableObject(stub, async (_instance, state) => {
      await state.blockConcurrencyWhile(async () => {
        await state.abort('eviccion forzada por el test');
      });
    }).catch(() => {
      // abort() tira a proposito: el objeto se reinstancia en el proximo acceso.
    });

    // Conexion nueva contra la instancia reinstanciada.
    const reconnected = await Client.connect(roomId);
    const resumed = await reconnected.request<{
      ok: boolean;
      playerId: string;
      state: RedactedGameState | null;
    }>('session:resume', { roomId, playerToken: token });

    expect(resumed.ok, 'el asiento tiene que reclamarse tras la eviccion').toBe(true);
    expect(resumed.playerId).toBe(playerId);
    expect(resumed.state).not.toBeNull();
    // Mano y version identicas: la partida continua donde estaba.
    expect(resumed.state!.you.hand.map((c) => c.id)).toEqual(handBefore);
    expect(resumed.state!.version).toBeGreaterThanOrEqual(versionBefore);
  });

  it('se puede SEGUIR JUGANDO despues de la eviccion', async () => {
    const { roomId, host, guest } = await startedGame();
    const token = host.playerToken!;

    const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
    await runInDurableObject(stub, async (_instance, state) => {
      await state.blockConcurrencyWhile(async () => {
        await state.abort('eviccion forzada por el test');
      });
    }).catch(() => {});

    const back = await Client.connect(roomId);
    const resumed = await back.request<{ ok: boolean; state: RedactedGameState }>(
      'session:resume',
      { roomId, playerToken: token },
    );
    expect(resumed.ok).toBe(true);

    // Y el otro jugador tambien vuelve.
    const backGuest = await Client.connect(roomId);
    const guestResumed = await backGuest.request<{ ok: boolean }>('session:resume', {
      roomId,
      playerToken: guest.playerToken!,
    });
    expect(guestResumed.ok).toBe(true);

    // Un comando sobre el estado restaurado tiene que aplicarse.
    const versionBefore = resumed.state.version;
    const turnHolder = resumed.state.currentPlayerId === resumed.state.you.id ? back : backGuest;
    const res = await turnHolder.request<{ ok: boolean; code?: string }>('game:command', {
      command: { type: 'DRAW_CARD' },
      clientSeq: 1,
    });

    // Si el RNG no se hubiera restaurado, esto podria romper al re-barajar.
    expect(res.ok || res.code === 'WRONG_PHASE').toBe(true);
    await new Promise((r) => setTimeout(r, 40));
    expect(back.state!.version).toBeGreaterThan(versionBefore);
  });

  it('descarta un snapshot de otra version en vez de leerlo mal', async () => {
    // Es preferible perder una sala a reanudarla mal: manos desincronizadas
    // entre jugadores serian un bug irreportable.
    const roomId = await claimRoom();
    const stub = env.ROOM.get(env.ROOM.idFromName(roomId));

    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.put('room:snapshot', { schemaVersion: 999, roomId, seats: [] });
    });

    const client = await Client.connect(roomId);
    const created = await client.request<{ ok: boolean }>('room:create', { nickname: 'A' });
    // La sala se crea limpia: el snapshot incompatible se tiro.
    expect(created.ok).toBe(true);
  });
});
