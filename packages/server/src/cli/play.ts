/**
 * Cliente de terminal. Sirve para jugar una partida real contra el servidor
 * antes de que exista una sola linea de React, que es el gate de la fase 2.
 *
 *   pnpm --filter @uno/server cli                    # crea una sala
 *   pnpm --filter @uno/server cli -- --room XK4T     # se une a una sala
 *   pnpm --filter @uno/server cli -- --bots 5        # crea sala y suma bots
 */
import { createInterface } from 'node:readline/promises';
import { io as connect, type Socket } from 'socket.io-client';
import { cardLabel, getPlayableCards, type Card, type RedactedGameState } from '@uno/engine';
import type { ClientToServerEvents, PlayerCommand, ServerToClientEvents } from '@uno/protocol';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// pnpm inyecta un `--` literal al reenviar argumentos; lo descartamos.
const args = process.argv.slice(2).filter((a) => a !== '--');
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const url = flag('url') ?? 'http://localhost:3000';
const roomArg = flag('room');
const nickname = flag('name') ?? `Jugador${Math.floor(Math.random() * 100)}`;
const botCount = Number(flag('bots') ?? 0);

const COLOR: Record<string, string> = {
  red: '\x1b[41m\x1b[97m',
  yellow: '\x1b[43m\x1b[30m',
  green: '\x1b[42m\x1b[30m',
  blue: '\x1b[44m\x1b[97m',
  wild: '\x1b[100m\x1b[97m',
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

function paint(card: Card): string {
  const color = 'color' in card ? card.color : 'wild';
  return `${COLOR[color] ?? ''} ${cardLabel(card)} ${RESET}`;
}

function emit<T>(socket: ClientSocket, event: string, ...payload: unknown[]): Promise<T> {
  return new Promise((resolve) => {
    (socket.emit as (e: string, ...a: unknown[]) => void)(event, ...payload, resolve);
  });
}

function render(state: RedactedGameState, myId: string): void {
  console.clear();
  const me = state.players.find((p) => p.id === myId);
  console.log(
    `\n  Sala ${state.roomId}   ronda ${state.round + 1}   objetivo ${state.options.targetScore}`,
  );
  console.log(`  ${DIM}${'-'.repeat(60)}${RESET}`);

  for (const player of state.players) {
    const turn = player.id === state.currentPlayerId ? '>' : ' ';
    const you = player.id === myId ? ' (vos)' : '';
    const status = player.abandoned
      ? ' [abandono]'
      : !player.connected
        ? ' [desconectado]'
        : player.idle
          ? ' [ausente]'
          : '';
    const uno = player.cardCount === 1 ? (player.hasDeclaredUno ? ' UNO!' : ' <sin declarar>') : '';
    console.log(
      `  ${turn} ${player.nickname.padEnd(12)}${you.padEnd(7)} ${String(player.cardCount).padStart(2)} cartas  ${player.score} pts${status}${uno}`,
    );
  }

  console.log(`  ${DIM}${'-'.repeat(60)}${RESET}`);
  const dir = state.direction === 1 ? 'horario' : 'antihorario';
  console.log(
    `  descarte: ${state.discardTop ? paint(state.discardTop) : '-'}   color: ${COLOR[state.activeColor]} ${state.activeColor} ${RESET}   mazo: ${state.drawPileCount}   ${dir}`,
  );

  if (me) {
    const playable = new Set(
      getPlayableCards(state.you.hand, state.activeColor, state.discardTop, state.pendingDraw).map(
        (c) => c.id,
      ),
    );
    console.log('\n  tu mano:');
    state.you.hand.forEach((card, i) => {
      const mark = playable.has(card.id) ? ' *' : `  ${DIM}`;
      const end = playable.has(card.id) ? '' : RESET;
      console.log(`   ${String(i).padStart(2)}.${mark} ${paint(card)}${end}`);
    });
  }

  console.log(`\n  fase: ${state.phase}`);
  if (state.currentPlayerId === myId) console.log('  \x1b[92mTE TOCA\x1b[0m');
}

/** Bot que juega legal. Sirve para llenar la mesa y probar con 10. */
async function runBot(roomId: string, index: number): Promise<void> {
  const socket: ClientSocket = connect(url, { transports: ['websocket'] });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err) => reject(err));
  });
  const join = await emit<{ ok: boolean; message?: string; playerId?: string }>(
    socket,
    'room:join',
    { roomId, nickname: `Bot${index}` },
  );
  if (!join.ok || !join.playerId) {
    console.error(`  no pude sumar Bot${index}: ${join.message ?? 'error'}`);
    return;
  }
  const myId = join.playerId;
  let seq = 0;

  socket.on('state:patch', ({ state }) => {
    if (state.currentPlayerId !== myId) return;
    setTimeout(() => {
      let command: PlayerCommand;
      if (state.phase === 'choosing_color') {
        command = { type: 'CHOOSE_COLOR', color: 'red' };
      } else if (state.phase === 'card_drawn') {
        command = { type: 'PASS' };
      } else {
        const card = getPlayableCards(
          state.you.hand,
          state.activeColor,
          state.discardTop,
          state.pendingDraw,
        )[0];
        command = card
          ? { type: 'PLAY_CARD', cardId: card.id, chosenColor: 'red', declareUno: true }
          : { type: 'DRAW_CARD' };
      }
      void emit(socket, 'game:command', { command, clientSeq: ++seq });
    }, 400);
  });
}

async function main(): Promise<void> {
  const socket: ClientSocket = connect(url, { transports: ['websocket'] });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (err) => reject(err));
    });
  } catch {
    // Sin esto, un servidor apagado escupe 80 lineas de TransportError que no
    // dicen que hacer. El caso comun es justamente que no lo arrancaste.
    console.error(`\n  No pude conectarme a ${url}\n`);
    console.error('  El servidor tiene que estar corriendo EN OTRA TERMINAL:');
    console.error('    pnpm --filter @uno/server dev\n');
    console.error('  Si corre en otro puerto:  --url http://localhost:PUERTO\n');
    process.exit(1);
  }

  const res = roomArg
    ? await emit<{ ok: boolean; message?: string; playerId?: string; roomId?: string }>(
        socket,
        'room:join',
        { roomId: roomArg, nickname },
      )
    : await emit<{ ok: boolean; message?: string; playerId?: string; roomId?: string }>(
        socket,
        'room:create',
        { nickname },
      );

  if (!res.ok || !res.playerId || !res.roomId) {
    console.error('Error:', res.message);
    process.exit(1);
  }

  const myId = res.playerId;
  const roomId = res.roomId;
  console.log(`\n  Sala: ${roomId}   sos ${nickname}`);
  if (!roomArg) console.log(`  Que se unan con: --room ${roomId}\n`);

  for (let i = 1; i <= botCount; i++) await runBot(roomId, i);

  // Anotado explicito: TS lo narrowea a never si solo se asigna en callbacks.
  let state: RedactedGameState | null = null;
  let seq = 0;
  const currentState = (): RedactedGameState | null => state;

  socket.on('state:sync', (s) => {
    state = s;
    render(s, myId);
  });
  socket.on('state:patch', ({ state: s, events }) => {
    state = s;
    render(s, myId);
    for (const event of events.slice(-4)) console.log(`  ${DIM}. ${event.type}${RESET}`);
  });
  socket.on('error:game', (e) => console.log(`\n  [${e.code}] ${e.message}`));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(
    '  comandos: start | <n> jugar | d robar | p pasar | c <color> | u uno | !<id> acusar | q salir\n',
  );

  // stdin cerrado (Ctrl+D, o input piped que se agoto) cierra el readline y
  // question() lanza ERR_USE_AFTER_CLOSE. Lo tratamos como una salida normal.
  let stdinOpen = true;
  rl.once('close', () => {
    stdinOpen = false;
  });

  for (;;) {
    if (!stdinOpen) break;
    let line: string;
    try {
      line = (await rl.question('> ')).trim();
    } catch {
      break;
    }
    if (line === 'q') break;

    if (line === 'start') {
      const r = await emit<{ ok: boolean; message?: string }>(socket, 'game:start', {});
      if (!r.ok) console.log(`  ${r.message}`);
      continue;
    }
    if (line === 'n') {
      await emit<{ ok: boolean }>(socket, 'game:nextRound');
      continue;
    }
    const snapshot = currentState();
    if (!snapshot) {
      console.log('  la partida no empezo');
      continue;
    }

    let command: PlayerCommand | null = null;
    if (line === 'd') command = { type: 'DRAW_CARD' };
    else if (line === 'p') command = { type: 'PASS' };
    else if (line === 'u') command = { type: 'DECLARE_UNO' };
    else if (line.startsWith('c ')) {
      const color = line.slice(2).trim();
      if (['red', 'yellow', 'green', 'blue'].includes(color)) {
        command = { type: 'CHOOSE_COLOR', color: color as 'red' };
      }
    } else if (line.startsWith('!')) {
      command = { type: 'CALL_OUT_UNO', targetId: line.slice(1) };
    } else if (/^\d+$/.test(line)) {
      const card = snapshot.you.hand[Number(line)];
      if (card) {
        command = {
          type: snapshot.phase === 'card_drawn' ? 'PLAY_DRAWN_CARD' : 'PLAY_CARD',
          ...(snapshot.phase === 'card_drawn' ? {} : { cardId: card.id }),
          chosenColor: 'red',
          declareUno: snapshot.you.hand.length === 2,
        } as PlayerCommand;
      }
    }

    if (!command) {
      console.log('  no entendi');
      continue;
    }
    const r = await emit<{ ok: boolean; message?: string }>(socket, 'game:command', {
      command,
      clientSeq: ++seq,
    });
    if (!r.ok) console.log(`  rechazado: ${r.message}`);
  }

  rl.close();
  socket.disconnect();
  process.exit(0);
}

void main();
