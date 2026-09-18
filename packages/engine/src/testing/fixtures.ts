/**
 * Builders de datos de prueba, exportados DESDE el engine a proposito.
 *
 * Los usan tanto los tests como las stories de Storybook: una sola fuente, de
 * modo que si cambia GameState/RedactedGameState rompe la compilacion en ambos
 * lados a la vez en vez de dejar las stories mintiendo.
 */
import { DEFAULT_OPTIONS, type GameState, type Player } from '../state.js';
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
