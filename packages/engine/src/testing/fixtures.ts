/**
 * Builders de datos de prueba, exportados DESDE el engine a proposito.
 *
 * Los usan tanto los tests como las stories de Storybook: una sola fuente, de
 * modo que si cambia GameState/RedactedGameState rompe la compilacion en ambos
 * lados a la vez en vez de dejar las stories mintiendo.
 */
import {
  DEFAULT_OPTIONS,
  type GameState,
  type Player,
  type RedactedGameState,
  type RedactedPlayer,
} from '../state.js';
import type { Card, Color, NumberValue } from '../types.js';

let counter = 0;
/** Ids legibles y unicos dentro del proceso de test. */
function testId(prefix: string): string {
  return `${prefix}${counter++}`;
}

export function resetFixtureIds(): void {
  counter = 0;
}

export function num(color: Color, value: NumberValue): Card {
  return { kind: 'number', color, value, id: testId('n') };
}

export function colored(kind: 'skip' | 'reverse' | 'draw2', color: Color): Card {
  return { kind, color, id: testId('c') };
}

export function wild(): Card {
  return { kind: 'wild', id: testId('w') };
}

export function wild4(): Card {
  return { kind: 'wild4', id: testId('W') };
}

export function makePlayer(overrides: Partial<Player> & { seat: number }): Player {
  return {
    id: `p${overrides.seat}`,
    nickname: `Jugador ${overrides.seat + 1}`,
    hand: [],
    connected: true,
    idle: false,
    abandoned: false,
    consecutiveTimeouts: 0,
    hasDeclaredUno: false,
    score: 0,
    ...overrides,
  };
}

export interface MakeStateOptions {
  /** Una mano por jugador. Define cuantos jugadores hay. */
  hands?: Card[][];
  playerCount?: number;
  drawPile?: Card[];
  discardPile?: Card[];
  activeColor?: Color;
  currentPlayerIndex?: number;
  direction?: 1 | -1;
  phase?: GameState['phase'];
  targetScore?: number;
}

/** Estado armado a mano para tests de unidades chicas. Para partidas reales, createGame(). */
export function makeState(opts: MakeStateOptions = {}): GameState {
  const hands = opts.hands ?? Array.from({ length: opts.playerCount ?? 4 }, () => []);
  const players = hands.map((hand, seat) => makePlayer({ seat, hand }));

  return {
    roomId: 'TEST',
    seed: 'test-seed',
    round: 0,
    options: { ...DEFAULT_OPTIONS, ...(opts.targetScore ? { targetScore: opts.targetScore } : {}) },
    players,
    drawPile: opts.drawPile ?? [],
    discardPile: opts.discardPile ?? [],
    activeColor: opts.activeColor ?? 'red',
    currentPlayerIndex: opts.currentPlayerIndex ?? 0,
    direction: opts.direction ?? 1,
    phase: opts.phase ?? 'awaiting_turn',
    pendingDraw: 0,
    drawnCardId: null,
    unoWindow: null,
    turnDeadline: 0,
    roundWinnerId: null,
    gameWinnerId: null,
    version: 1,
  };
}

/** Un jugador tal como lo ve otro: solo conteo, jamas cartas. */
export function makeRedactedPlayer(
  overrides: Partial<RedactedPlayer> & { seat: number },
): RedactedPlayer {
  return {
    id: `p${overrides.seat}`,
    nickname: `Jugador ${overrides.seat + 1}`,
    cardCount: 7,
    connected: true,
    idle: false,
    abandoned: false,
    hasDeclaredUno: false,
    score: 0,
    ...overrides,
  };
}

export interface MakeRedactedOptions {
  playerCount?: number;
  /** Cartas de TU mano. Por defecto una mano variada de 7. */
  yourHand?: Card[];
  /** Asiento en turno. Por defecto 1 (un oponente), no vos: es el caso comun. */
  currentSeat?: number;
  discardTop?: Card;
  activeColor?: Color;
  direction?: 1 | -1;
  phase?: RedactedGameState['phase'];
  drawPileCount?: number;
  /** Conteos ajenos, por asiento. Util para probar UNO y manos grandes. */
  cardCounts?: number[];
}

/**
 * Vista redactada lista para stories y tests. Los usan ambos: una sola fuente,
 * de modo que si cambia RedactedGameState rompe compilacion en los dos lados.
 */
export function makeRedactedState(opts: MakeRedactedOptions = {}): RedactedGameState {
  const playerCount = opts.playerCount ?? 4;
  const yourHand = opts.yourHand ?? [
    num('red', 5),
    num('blue', 9),
    colored('skip', 'green'),
    wild(),
    num('yellow', 0),
    colored('draw2', 'red'),
    wild4(),
  ];

  const players = Array.from({ length: playerCount }, (_, seat) =>
    makeRedactedPlayer({
      seat,
      ...(seat === 0 ? { cardCount: yourHand.length } : {}),
      ...(opts.cardCounts?.[seat] !== undefined ? { cardCount: opts.cardCounts[seat]! } : {}),
    }),
  );

  return {
    roomId: 'TEST',
    round: 0,
    options: DEFAULT_OPTIONS,
    you: { id: 'p0', hand: yourHand },
    players,
    discardTop: opts.discardTop ?? num('red', 3),
    activeColor: opts.activeColor ?? 'red',
    drawPileCount: opts.drawPileCount ?? 60,
    currentPlayerId: `p${opts.currentSeat ?? 1}`,
    direction: opts.direction ?? 1,
    phase: opts.phase ?? 'awaiting_turn',
    pendingDraw: 0,
    drawnCardId: null,
    unoWindow: null,
    turnDeadline: 0,
    roundWinnerId: null,
    gameWinnerId: null,
    version: 1,
  };
}
