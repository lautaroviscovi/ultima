import type { Card, CardId, Color, PlayerId } from './types.js';

export type Phase =
  'lobby' | 'awaiting_turn' | 'choosing_color' | 'card_drawn' | 'round_over' | 'game_over';

export interface Player {
  id: PlayerId;
  nickname: string;
  seat: number;
  /** EL SECRETO. Nunca sale del servidor salvo hacia su propio dueño. */
  hand: Card[];
  connected: boolean;
  /** Se salteo automaticamente tras 3 timeouts seguidos. */
  idle: boolean;
  abandoned: boolean;
  consecutiveTimeouts: number;
  hasDeclaredUno: boolean;
  score: number;
}

export interface GameOptions {
  /** Puntaje objetivo. Configurable porque con 10 jugadores una ronda suma 9 manos. */
  targetScore: number;
  turnTimeoutMs: number;
  /** Ventana no bloqueante para acusar un UNO no declarado. */
  unoWindowMs: number;
}

export const DEFAULT_OPTIONS: GameOptions = {
  targetScore: 500,
  turnTimeoutMs: 45_000,
  unoWindowMs: 3_000,
};

/**
 * Estado autoritativo. Vive SOLO en el servidor y NUNCA se serializa a un socket.
 * Contiene dos secretos: las manos y el orden del mazo.
 */
export interface GameState {
  roomId: string;
  seed: string;
  round: number;
  options: GameOptions;

  players: Player[];
  drawPile: Card[];
  discardPile: Card[];

  /** Puede diferir del color del tope cuando se jugo un wild. */
  activeColor: Color;
  currentPlayerIndex: number;
  direction: 1 | -1;
  phase: Phase;

  /** Acumulador de +2/+4. En v1 no hay stacking, pero el campo ya existe. */
  pendingDraw: number;
  /** Carta recien robada que el jugador todavia puede jugar (fase card_drawn). */
  drawnCardId: CardId | null;

  /** Ventana de UNO abierta: hasta cuando y sobre quien. */
  unoWindow: { playerId: PlayerId; closesAt: number } | null;

  turnDeadline: number;
  roundWinnerId: PlayerId | null;
  gameWinnerId: PlayerId | null;
  /** Monotonico. El cliente descarta patches con version <= la suya. */
  version: number;
}

/** La vista que SI viaja por el cable, calculada por jugador. */
export interface RedactedPlayer {
  id: PlayerId;
  nickname: string;
  seat: number;
  /** SOLO el conteo. Jamas las cartas. */
  cardCount: number;
  connected: boolean;
  idle: boolean;
  abandoned: boolean;
  hasDeclaredUno: boolean;
  score: number;
}

export interface RedactedGameState {
  roomId: string;
  round: number;
  options: GameOptions;
  you: { id: PlayerId; hand: Card[] };
  players: RedactedPlayer[];
  discardTop: Card | null;
  activeColor: Color;
  /** Conteo, jamas el contenido: el orden del mazo dice que va a robar cada uno. */
  drawPileCount: number;
  currentPlayerId: PlayerId | null;
  direction: 1 | -1;
  phase: Phase;
  pendingDraw: number;
  drawnCardId: CardId | null;
  unoWindow: { playerId: PlayerId; closesAt: number } | null;
  turnDeadline: number;
  roundWinnerId: PlayerId | null;
  gameWinnerId: PlayerId | null;
  version: number;
}

/**
 * LA FRONTERA DE SEGURIDAD DEL PRODUCTO.
 *
 * Cualquier jugador abre DevTools -> Network -> WS y ve cada frame que recibio.
 * Si mandaramos el GameState completo y ocultaramos las manos ajenas en el
 * render de React, el juego seria trivialmente explotable y ninguna
 * minificacion lo arreglaria. La redaccion es ESTRUCTURAL y ocurre aca.
 *
 * Regla de arquitectura que acompaña a esta funcion: la capa de socket solo
 * puede emitir el retorno de redact(). Hay un test que simula una partida
 * completa y falla si aparece un CardId ajeno en cualquier payload.
 */
export function redact(state: GameState, viewerId: PlayerId): RedactedGameState {
  const you = state.players.find((p) => p.id === viewerId);
  if (!you) throw new Error(`redact: el jugador ${viewerId} no esta en la partida`);

  const current = state.players[state.currentPlayerIndex];

  return {
    roomId: state.roomId,
    round: state.round,
    options: state.options,
    you: { id: you.id, hand: you.hand },
    players: state.players.map((p): RedactedPlayer => ({
      id: p.id,
      nickname: p.nickname,
      seat: p.seat,
      cardCount: p.hand.length,
      connected: p.connected,
      idle: p.idle,
      abandoned: p.abandoned,
      hasDeclaredUno: p.hasDeclaredUno,
      score: p.score,
    })),
    discardTop: state.discardPile.at(-1) ?? null,
    activeColor: state.activeColor,
    drawPileCount: state.drawPile.length,
    currentPlayerId: current?.id ?? null,
    direction: state.direction,
    phase: state.phase,
    pendingDraw: state.pendingDraw,
    // Solo tiene sentido para el dueño del turno, y solo el ve su propia mano.
    drawnCardId: current?.id === viewerId ? state.drawnCardId : null,
    unoWindow: state.unoWindow,
    turnDeadline: state.turnDeadline,
    roundWinnerId: state.roundWinnerId,
    gameWinnerId: state.gameWinnerId,
    version: state.version,
  };
}
