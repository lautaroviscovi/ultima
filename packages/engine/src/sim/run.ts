/**
 * Gate de la Fase 1: juega N partidas completas con bots aleatorios y verifica
 * las invariantes en cada paso. Si esto corre limpio, las reglas estan bien.
 *
 *   pnpm sim                 # 1000 partidas de 10 jugadores
 *   pnpm sim -- 200 4        # 200 partidas de 4
 */
import { DECK_SIZE } from '../deck.js';
import { createGame, disposeGame, reduce } from '../game.js';
import { createRng, type Rng } from '../rng.js';
import { getPlayableCards } from '../rules.js';
import type { GameState } from '../state.js';
import { COLORS } from '../types.js';

// pnpm inyecta un `--` literal al reenviar argumentos: sin filtrarlo, GAMES
// quedaba NaN, no se simulaba NADA y el script reportaba "OK" igual. El gate
// de fase 1 pasaba en falso.
const args = process.argv.slice(2).filter((a) => a !== '--');
const GAMES = Number(args[0] ?? 1000);
const PLAYERS = Number(args[1] ?? 10);

if (!Number.isInteger(GAMES) || GAMES < 1) {
  console.error(`Cantidad de partidas invalida: ${args[0]}`);
  process.exit(1);
}
if (!Number.isInteger(PLAYERS) || PLAYERS < 2 || PLAYERS > 10) {
  console.error(`Cantidad de jugadores invalida: ${args[1]} (tiene que ser 2..10)`);
  process.exit(1);
}
const MAX_TURNS = 5000;

interface Failure {
  seed: string;
  reason: string;
  turn: number;
}

function totalCards(s: GameState): number {
  return (
    s.drawPile.length + s.discardPile.length + s.players.reduce((n, p) => n + p.hand.length, 0)
  );
}

function checkInvariants(s: GameState, turn: number): string | null {
  if (totalCards(s) !== DECK_SIZE) {
    return `esperaba ${DECK_SIZE} cartas, hay ${totalCards(s)}`;
  }
  const ids = [
    ...s.drawPile.map((c) => c.id),
    ...s.discardPile.map((c) => c.id),
    ...s.players.flatMap((p) => p.hand.map((c) => c.id)),
  ];
  if (new Set(ids).size !== ids.length) return 'hay CardIds duplicados';

  const current = s.players[s.currentPlayerIndex];
  if (!current) return 'no hay jugador de turno';
  if (current.abandoned) return 'el jugador de turno esta abandonado';
  if (turn > MAX_TURNS) return 'la partida no termina';
  return null;
}

function step(state: GameState, rng: Rng, turn: number): GameState {
  const player = state.players[state.currentPlayerIndex]!;
  const ctx = { playerId: player.id, now: turn * 1000 };

  if (state.phase === 'choosing_color') {
    return reduce(state, { type: 'CHOOSE_COLOR', color: rng.pick(COLORS) }, ctx).state;
  }
  if (state.phase === 'card_drawn') {
    const card = player.hand.find((c) => c.id === state.drawnCardId);
    const top = state.discardPile.at(-1) ?? null;
    if (
      card &&
      getPlayableCards([card], state.activeColor, top, state.pendingDraw).length &&
      rng.nextInt(2) === 0
    ) {
      return reduce(
        state,
        { type: 'PLAY_DRAWN_CARD', chosenColor: rng.pick(COLORS), declareUno: true },
        ctx,
      ).state;
    }
    return reduce(state, { type: 'PASS' }, ctx).state;
  }

  const top = state.discardPile.at(-1) ?? null;
  const playable = getPlayableCards(player.hand, state.activeColor, top, state.pendingDraw);
  if (playable.length > 0) {
    const card = rng.pick(playable);
    return reduce(
      state,
      { type: 'PLAY_CARD', cardId: card.id, chosenColor: rng.pick(COLORS), declareUno: true },
      ctx,
    ).state;
  }
  return reduce(state, { type: 'DRAW_CARD' }, ctx).state;
}

function playGame(seed: string): { turns: number; rounds: number; failure: Failure | null } {
  const players = Array.from({ length: PLAYERS }, (_, i) => ({ id: `p${i}`, nickname: `J${i}` }));
  let { state } = createGame({
    roomId: 'SIM',
    seed,
    players,
    options: { targetScore: 500 },
    now: 0,
  });
  const rng = createRng(`bot-${seed}`);

  let turns = 0;
  let rounds = 1;

  while (turns < MAX_TURNS) {
    const problem = checkInvariants(state, turns);
    if (problem) {
      disposeGame(state);
      return { turns, rounds, failure: { seed, reason: problem, turn: turns } };
    }

    if (state.phase === 'game_over') break;
    if (state.phase === 'round_over') {
      state = reduce(state, { type: 'NEXT_ROUND' }, { playerId: null, now: turns * 1000 }).state;
      rounds++;
      continue;
    }

    state = step(state, rng, turns);
    turns++;
  }

  const finished = state.phase === 'game_over';
  disposeGame(state);
  return {
    turns,
    rounds,
    failure: finished ? null : { seed, reason: 'no termino', turn: turns },
  };
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))] ?? 0;
}

console.log(`Simulando ${GAMES} partidas de ${PLAYERS} jugadores...\n`);
const started = Date.now();

const failures: Failure[] = [];
const turnCounts: number[] = [];
const roundCounts: number[] = [];

for (let i = 0; i < GAMES; i++) {
  const { turns, rounds, failure } = playGame(`sim-${i}`);
  if (failure) failures.push(failure);
  else {
    turnCounts.push(turns);
    roundCounts.push(rounds);
  }
}

const elapsed = Date.now() - started;
const sortedTurns = [...turnCounts].sort((a, b) => a - b);
const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

console.log(`Partidas completadas : ${turnCounts.length}/${GAMES}`);
console.log(`Fallidas             : ${failures.length}`);
console.log(`Tiempo               : ${elapsed}ms (${(elapsed / GAMES).toFixed(2)}ms por partida)`);
console.log('');
console.log(
  `Turnos  promedio/p50/p95/max : ${avg(turnCounts).toFixed(0)} / ${percentile(sortedTurns, 50)} / ${percentile(sortedTurns, 95)} / ${sortedTurns.at(-1) ?? 0}`,
);
console.log(`Rondas  promedio             : ${avg(roundCounts).toFixed(1)}`);

if (failures.length > 0) {
  console.log('\nFallos (reproducibles desde su seed):');
  for (const f of failures.slice(0, 10)) {
    console.log(`  seed=${f.seed} turno=${f.turn}: ${f.reason}`);
  }
  if (failures.length > 10) console.log(`  ... y ${failures.length - 10} mas`);
  process.exit(1);
}

if (turnCounts.length === 0) {
  console.error('\nERROR: no se completo ninguna partida.');
  process.exit(1);
}

console.log('\nOK: ninguna partida violo las invariantes.');
