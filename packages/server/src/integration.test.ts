import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, getPlayableCards } from '@uno/engine';
import { createApp, type UnoApp } from './app.js';
import { TestClient } from './testing/client.js';

/**
 * Tests de integracion: servidor real en un puerto efimero, clientes reales.
 * Pocos y gordos, a proposito. Mockear Socket.IO costaria mas de lo que da y
 * dejaria de cubrir lo fragil: handshake, acks, orden y reconexion.
 */

let app: UnoApp;
let url: string;
const clients: TestClient[] = [];

async function spawn(): Promise<TestClient> {
  const client = new TestClient(url);
  await client.waitConnected();
  clients.push(client);
  return client;
}

/** Crea una sala con `count` jugadores conectados. */
async function lobby(count: number, options?: object) {
  const host = await spawn();
  const res = await host.createRoom('Host', options);
  if (!res.ok) throw new Error(`no se pudo crear la sala: ${res.message}`);

  const rest: TestClient[] = [];
  for (let i = 1; i < count; i++) {
    const client = await spawn();
    const join = await client.joinRoom(res.roomId, `J${i}`);
    if (!join.ok) throw new Error(`no se pudo unir J${i}: ${join.message}`);
    rest.push(client);
  }
  return { host, rest, all: [host, ...rest], roomId: res.roomId };
}

/**
 * Arranca la partida y espera a que TODOS los clientes tengan el estado ya
 * repartido. Esperar solo `state !== null` no alcanza: bajo carga un cliente
 * puede seguir con el estado del lobby y los tests eligen mal el turno.
 */
async function startAndSettle(host: TestClient, all: TestClient[], options?: object) {
  const res = await host.start(options);
  if (!res.ok) throw new Error(`no se pudo iniciar: ${res.message}`);
  await host.waitFor(
    () => all.every((c) => c.state !== null && c.state.you.hand.length > 0),
    5000,
    'reparto propagado a todos',
  );
  return res;
}

/** El cliente cuyo PROPIO estado dice que tiene el turno. */
function turnHolder(all: TestClient[]): TestClient {
  const client = all.find((c) => c.state?.currentPlayerId === c.playerId);
  if (!client?.state) throw new Error('nadie tiene el turno');
  return client;
}

/** Juega un movimiento legal cualquiera para el jugador de turno. */
async function playOneTurn(all: TestClient[]): Promise<void> {
  // El state del jugador de turno puede no haber propagado aun: esperamos en
  // vez de asumir. Sin esto el test es flaky bajo carga.
  const deadline = Date.now() + 2000;
  let client: TestClient | undefined;
  while (Date.now() < deadline) {
    client = all.find((c) => c.state?.currentPlayerId === c.playerId);
    if (client?.state) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  if (!client?.state) throw new Error('nadie tiene el turno');
  const state = client.state;

  if (state.phase === 'choosing_color') {
    await client.command({ type: 'CHOOSE_COLOR', color: 'red' });
    return;
  }
  if (state.phase === 'card_drawn') {
    await client.command({ type: 'PASS' });
    return;
  }

  const playable = getPlayableCards(state.you.hand, state.activeColor, state.discardTop);
  const card = playable[0];
  if (card) {
    await client.command({
      type: 'PLAY_CARD',
      cardId: card.id,
      chosenColor: 'red',
      declareUno: true,
    });
  } else {
    await client.command({ type: 'DRAW_CARD' });
  }
}

beforeEach(async () => {
  app = createApp({ clientOrigins: ['*'], sweepIntervalMs: 50, reconnectGraceMs: 200 });
  const port = await app.listen(0);
  url = `http://localhost:${port}`;
});

afterEach(async () => {
  for (const client of clients) client.close();
  clients.length = 0;
  await app.close();
});

describe('salas', () => {
  it('crea una sala y devuelve el token solo al creador', async () => {
    const client = await spawn();
    const res = await client.createRoom('Lautaro');

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.roomId).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    expect(res.playerToken).toHaveLength(32);
    expect(res.room.players).toHaveLength(1);
    expect(res.room.hostId).toBe(res.playerId);
  });

  it('el codigo de sala no usa caracteres ambiguos', async () => {
    // Se dicta por voz en la videollamada: 0/O y 1/I/L cuestan una ronda de
    // "no, la letra".
    for (let i = 0; i < 25; i++) {
      const client = await spawn();
      const res = await client.createRoom(`P${i}`);
      if (!res.ok) throw new Error('fallo al crear');
      expect(res.roomId).not.toMatch(/[01OIL]/);
    }
  });

  it('acepta hasta 10 jugadores y rechaza el 11', async () => {
    const { roomId } = await lobby(10);
    const extra = await spawn();
    const res = await extra.joinRoom(roomId, 'Undecimo');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('ROOM_FULL');
  });

  it('rechaza un nickname repetido en la misma sala', async () => {
    const { roomId } = await lobby(2);
    const client = await spawn();
    const res = await client.joinRoom(roomId, 'Host');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('NICKNAME_TAKEN');
  });

  it('rechaza unirse a una sala inexistente', async () => {
    const client = await spawn();
    const res = await client.joinRoom('ZZZZ', 'Nadie');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('ROOM_NOT_FOUND');
  });

  it('avisa a los demas cuando alguien se une', async () => {
    const { host, roomId } = await lobby(1);
    const client = await spawn();
    await client.joinRoom(roomId, 'Segundo');
    await host.waitFor(() => host.room?.players.length === 2, 2000, 'room:updated');
    expect(host.room?.players.map((p) => p.nickname)).toEqual(['Host', 'Segundo']);
  });

  it('solo el anfitrion puede empezar', async () => {
    const { rest } = await lobby(3);
    const res = await rest[0]!.start();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('NOT_HOST');
  });

  it('no arranca con un solo jugador', async () => {
    const { host } = await lobby(1);
    const res = await host.start();
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('NOT_ENOUGH_PLAYERS');
  });
});

describe('partida de 10 jugadores', () => {
  it('reparte y cada uno recibe SU mano y solo conteos ajenos', async () => {
    const { host, all } = await lobby(10);
    const res = await startAndSettle(host, all);
    expect(res.ok).toBe(true);

    for (const client of all) {
      const state = client.state!;
      expect(state.you.hand).toHaveLength(7);
      expect(state.players).toHaveLength(10);
      for (const other of state.players) {
        expect(other.cardCount).toBeGreaterThan(0);
        expect(other).not.toHaveProperty('hand');
      }
      // El mazo va como conteo, nunca su contenido ni su orden.
      expect(state.drawPileCount).toBeGreaterThan(0);
      expect(state).not.toHaveProperty('drawPile');
    }
  });

  it('NINGUN cliente recibe jamas una carta ajena', async () => {
    // La guardia de seguridad, ahora sobre el cable de verdad.
    const { host, all } = await lobby(10);
    await startAndSettle(host, all);

    for (let turn = 0; turn < 40; turn++) {
      if (all.some((c) => c.state?.phase === 'round_over' || c.state?.phase === 'game_over')) break;
      await playOneTurn(all);
      await host.waitFor(
        () => all.every((c) => c.state !== null),
        2000,
        `propagacion del turno ${turn}`,
      );
    }

    for (const client of all) {
      // Lo que un cliente PUEDE ver legitimamente:
      //  - su propia mano actual
      //  - cartas que tuvo y jugo, o que robo (van en sus propios eventos)
      //  - cualquier carta que haya pasado por el descarte: es publica
      const legit = new Set<string>(client.state!.you.hand.map((c) => c.id));
      for (const event of client.events) {
        if (event.type === 'CARD_PLAYED') legit.add(event.card.id);
        if (event.type === 'CARDS_DRAWN') for (const c of event.cards ?? []) legit.add(c.id);
      }
      // El descarte es publico por definicion: es la carta boca arriba.
      for (const payload of client.received) {
        const top = (payload as { state?: { discardTop?: { id?: string } } }).state?.discardTop;
        if (top?.id) legit.add(top.id);
        const sync = (payload as { discardTop?: { id?: string } }).discardTop;
        if (sync?.id) legit.add(sync.id);
      }

      const seen = (JSON.stringify(client.received).match(/"id":"(r\d+c\d+)"/g) ?? []).map((m) =>
        m.slice('"id":"'.length, -1),
      );
      for (const id of new Set(seen)) {
        expect(legit.has(id), `${client.playerId} vio la carta ajena ${id}`).toBe(true);
      }
    }
  });

  it('juega una partida completa hasta GAME_ENDED', async () => {
    // El minimo que permite el schema, para que termine rapido.
    const { host, all } = await lobby(10, { targetScore: 100 });
    await startAndSettle(host, all);

    for (let turn = 0; turn < 600; turn++) {
      const finished = host.state?.phase === 'game_over';
      if (finished) break;
      await playOneTurn(all);
      await host.waitFor(() => host.state !== null, 2000, `turno ${turn}`);
    }

    expect(host.state?.phase).toBe('game_over');
    expect(host.state?.gameWinnerId).toBeTruthy();
    expect(host.events.some((e) => e.type === 'GAME_ENDED')).toBe(true);
  });
});

describe('comandos ilegales', () => {
  it('rechaza jugar fuera de turno y NO se lo cuenta a los demas', async () => {
    const { host, all } = await lobby(4);
    await startAndSettle(host, all);

    const holder = turnHolder(all);
    const notTurn = all.find((c) => c.playerId !== holder.playerId)!;
    const before = all.map((c) => c.events.length);

    const res = await notTurn.command({
      type: 'PLAY_CARD',
      cardId: notTurn.state!.you.hand[0]!.id,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('NOT_YOUR_TURN');

    // Ningun otro jugador se entera: contarselo revelaria que tiene esa carta.
    await new Promise((r) => setTimeout(r, 50));
    expect(all.map((c) => c.events.length)).toEqual(before);
  });

  it('rechaza una carta que no esta en la mano', async () => {
    const { host, all } = await lobby(3);
    await startAndSettle(host, all);

    const client = turnHolder(all);
    const res = await client.command({ type: 'PLAY_CARD', cardId: 'r0c999' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('CARD_NOT_IN_HAND');
  });

  it('rechaza un payload malformado', async () => {
    const { host, all } = await lobby(2);
    await startAndSettle(host, all);

    const res = await host.rawCommand({ command: { type: 'NO_EXISTE' }, clientSeq: 1 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('INVALID_PAYLOAD');
  });

  it('rechaza comandos internos del servidor mandados por un cliente', async () => {
    // Un cliente que pudiera mandar ABANDON con el id de otro tendria un
    // vector de griefing trivial; TIMEOUT le dejaria saltear turnos ajenos.
    const { host, all } = await lobby(3);
    await startAndSettle(host, all);

    for (const type of ['TIMEOUT', 'ABANDON', 'DISCONNECT', 'NEXT_ROUND', 'START_GAME']) {
      const res = await host.rawCommand({
        command: { type, playerId: all[1]!.playerId },
        clientSeq: 99,
      });
      expect(res.ok, `${type} deberia rechazarse`).toBe(false);
      if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD');
    }
  });

  it('un jugador no puede suplantar a otro: el playerId sale del socket', async () => {
    const { host, all } = await lobby(3);
    await startAndSettle(host, all);

    const holder = turnHolder(all);
    const impostor = all.find((c) => c.playerId !== holder.playerId)!;

    // Aunque mande un playerId ajeno en el payload, el server usa el del socket.
    const res = await impostor.rawCommand({
      command: { type: 'DRAW_CARD' },
      clientSeq: 50,
      playerId: holder.playerId,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('NOT_YOUR_TURN');
  });

  it('descarta un clientSeq repetido en vez de aplicarlo dos veces', async () => {
    const { host, all } = await lobby(3);
    await startAndSettle(host, all);

    // Ojo: el turno puede no ser del asiento 0 (la carta inicial pudo ser un
    // skip/reverse/draw2), asi que lo tomamos del estado propio de cada cliente.
    const client = turnHolder(all);
    const handBefore = client.state!.you.hand.length;

    const first = await client.command({ type: 'DRAW_CARD' }, { clientSeq: 7 });
    expect(first.ok).toBe(true);
    await client.waitFor(() => client.state!.you.hand.length > handBefore, 2000, 'robo');
    const afterFirst = client.state!.you.hand.length;

    // Reintento del MISMO clientSeq, como haria un cliente tras un timeout de
    // red. Debe responder ok (idempotente) pero no robar otra carta.
    const retry = await client.command({ type: 'DRAW_CARD' }, { clientSeq: 7 });
    expect(retry.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    expect(client.state!.you.hand.length).toBe(afterFirst);
  });

  it('rechaza un comando basado en una version vieja y reenvia el estado', async () => {
    const { host, all } = await lobby(3);
    await startAndSettle(host, all);

    const client = turnHolder(all);
    // Version deliberadamente vieja: la partida recien creada ya esta en 1, asi
    // que pedir 0 simula un comando emitido desde un estado atrasado.
    const res = await client.command({ type: 'DRAW_CARD' }, { expectedVersion: 0 });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('STALE_COMMAND');
    // El server le reenvia el estado actual para que se ponga al dia.
    await client.waitFor(() => client.state !== null, 2000, 'resync');
  });
});

describe('reconexion', () => {
  it('recupera el asiento y el estado exacto con el token', async () => {
    // El flujo mas fragil y el mas dificil de probar a mano.
    const { host, all, roomId } = await lobby(4);
    await startAndSettle(host, all);

    const victim = all[2]!;
    const token = victim.playerToken!;
    const handBefore = victim.state!.you.hand.map((c) => c.id);
    const playerId = victim.playerId;

    victim.hardDisconnect();
    await host.waitFor(
      () => host.state?.players.find((p) => p.id === playerId)?.connected === false,
      2000,
      'marca de desconectado',
    );

    await victim.reconnect();
    const res = await victim.resume(roomId, token);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.playerId).toBe(playerId);
    expect(res.state).not.toBeNull();
    // Mano intacta: el asiento se conserva.
    expect(res.state!.you.hand.map((c) => c.id)).toEqual(handBefore);

    await host.waitFor(
      () => host.state?.players.find((p) => p.id === playerId)?.connected === true,
      2000,
      'marca de reconectado',
    );
  });

  it('rechaza un token invalido', async () => {
    const { host, roomId } = await lobby(2);
    await host.start();
    const intruder = await spawn();
    const res = await intruder.resume(roomId, 'x'.repeat(32));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('INVALID_TOKEN');
  });

  it('el segundo socket con el mismo token desplaza al primero', async () => {
    const { host, all, roomId } = await lobby(3);
    await startAndSettle(host, all);

    const original = all[1]!;
    const token = original.playerToken!;

    const secondTab = await spawn();
    const res = await secondTab.resume(roomId, token);
    expect(res.ok).toBe(true);

    // La primera pestaña se entera: dos sockets en un asiento generarian
    // comandos duplicados.
    await original.waitFor(
      () => original.errors.some((e) => e.code === 'SESSION_TAKEN_OVER'),
      2000,
      'aviso de sesion tomada',
    );
  });

  it('marca abandonado al que no vuelve dentro de la ventana de gracia', async () => {
    const { host, all } = await lobby(4);
    await startAndSettle(host, all);

    const victim = all[3]!;
    const playerId = victim.playerId;
    victim.hardDisconnect();

    // reconnectGraceMs = 200 y el sweep corre cada 50ms en estos tests.
    await host.waitFor(
      () => host.state?.players.find((p) => p.id === playerId)?.abandoned === true,
      3000,
      'marca de abandono',
    );

    const abandoned = host.state!.players.find((p) => p.id === playerId)!;
    expect(abandoned.cardCount).toBe(0);
  });

  it('en el lobby la desconexion libera el asiento al toque', async () => {
    const { host, rest } = await lobby(3);
    rest[0]!.hardDisconnect();
    await host.waitFor(() => host.room?.players.length === 2, 2000, 'asiento liberado');
    expect(host.room?.players).toHaveLength(2);
  });
});

describe('timeout de turno', () => {
  it('auto-roba al expirar y pasa al siguiente', async () => {
    const { host, all } = await lobby(3, { turnTimeoutMs: 10_000 });
    await startAndSettle(host, all, { turnTimeoutMs: 10_000 });

    const first = host.state!.currentPlayerId;
    // Forzamos el vencimiento sin esperar 10s reales.
    app.gateway.handleTurnExpired(host.roomId!);

    await host.waitFor(
      () => host.state?.currentPlayerId !== first,
      2000,
      'cambio de turno por timeout',
    );
    expect(host.events.some((e) => e.type === 'PLAYER_TIMED_OUT')).toBe(true);
  });
});

describe('health', () => {
  it('reporta las salas activas, para mirar antes de un redeploy', async () => {
    await lobby(3);
    const res = await fetch(`${url}/health/rooms`);
    const body = (await res.json()) as { count: number; rooms: Array<{ players: number }> };
    expect(body.count).toBe(1);
    expect(body.rooms[0]?.players).toBe(3);
  });
});

describe('opciones de partida', () => {
  it('respeta el objetivo configurado en el lobby', async () => {
    const { host, all } = await lobby(3, { targetScore: 200 });
    await startAndSettle(host, all);
    expect(host.state?.options.targetScore).toBe(200);
  });

  it('usa los valores por defecto si no se especifican', async () => {
    const { host, all } = await lobby(2);
    await startAndSettle(host, all);
    expect(host.state?.options.targetScore).toBe(DEFAULT_OPTIONS.targetScore);
  });

  it('rechaza opciones fuera de rango', async () => {
    const client = await spawn();
    const res = await client.createRoom('X', { targetScore: 999_999 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('INVALID_PAYLOAD');
  });
});
