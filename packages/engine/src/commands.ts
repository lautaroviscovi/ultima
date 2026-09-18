import type { GameState } from './state.js';
import type { Card, CardId, Color, PlayerId } from './types.js';

export type Command =
  | { type: 'START_GAME' }
  | { type: 'PLAY_CARD'; cardId: CardId; chosenColor?: Color; declareUno?: boolean }
  | { type: 'DRAW_CARD' }
  | { type: 'PLAY_DRAWN_CARD'; chosenColor?: Color; declareUno?: boolean }
  | { type: 'PASS' }
  | { type: 'CHOOSE_COLOR'; color: Color }
  | { type: 'DECLARE_UNO' }
  | { type: 'CALL_OUT_UNO'; targetId: PlayerId }
  | { type: 'TIMEOUT' }
  | { type: 'DISCONNECT'; playerId: PlayerId }
  | { type: 'RECONNECT'; playerId: PlayerId }
  | { type: 'ABANDON'; playerId: PlayerId }
  | { type: 'CLOSE_UNO_WINDOW' }
  | { type: 'NEXT_ROUND' };

/**
 * Los eventos son la capa de NARRACION: alimentan animaciones y el log de mesa.
 * El estado redactado es la verdad; los eventos son el diff explicado.
 * Se mandan ambos: el estado corrige cualquier deriva, los eventos dicen que animar.
 */
export type GameEvent =
  | { type: 'GAME_STARTED'; round: number }
  | { type: 'CARDS_DEALT'; perPlayer: number }
  | { type: 'CARD_PLAYED'; playerId: PlayerId; card: Card; chosenColor?: Color }
  | { type: 'CARDS_DRAWN'; playerId: PlayerId; count: number; cards?: Card[] }
  | { type: 'TURN_CHANGED'; playerId: PlayerId }
  | { type: 'DIRECTION_REVERSED'; direction: 1 | -1 }
  | { type: 'PLAYER_SKIPPED'; playerId: PlayerId }
  | { type: 'COLOR_CHOSEN'; playerId: PlayerId; color: Color }
  | { type: 'UNO_DECLARED'; playerId: PlayerId }
  | { type: 'UNO_PENALTY'; playerId: PlayerId; calledBy: PlayerId; cardsDrawn: number }
  | { type: 'DECK_RESHUFFLED'; count: number }
  | { type: 'PLAYER_TIMED_OUT'; playerId: PlayerId }
  | { type: 'PLAYER_IDLE'; playerId: PlayerId }
  | { type: 'PLAYER_CONNECTION'; playerId: PlayerId; connected: boolean }
  | { type: 'PLAYER_ABANDONED'; playerId: PlayerId }
  | { type: 'ROUND_ENDED'; winnerId: PlayerId; points: number }
  | { type: 'GAME_ENDED'; winnerId: PlayerId };

export type GameErrorCode =
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_MOVE'
  | 'CARD_NOT_IN_HAND'
  | 'WRONG_PHASE'
  | 'COLOR_REQUIRED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'GAME_ALREADY_STARTED'
  | 'PLAYER_NOT_FOUND';

export class GameError extends Error {
  constructor(
    readonly code: GameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

/** Entrada no-deterministica del reducer: el tiempo entra por parametro, nunca Date.now(). */
export interface CommandContext {
  playerId: PlayerId | null;
  now: number;
}

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}
