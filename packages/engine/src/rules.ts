import type { GameState, Player } from './state.js';
import { cardPoints, type Card, type Color } from './types.js';

/**
 * La funcion mas usada del engine y la mas facil de romper.
 *
 * La comparten cliente y servidor: el cliente para resaltar la mano, el server
 * para decidir. Un solo isPlayable() elimina la clase entera de bugs "el
 * cliente me dejo clickear y el server me rechazo".
 *
 * Wild Draw Four: PERMISIVO por decision de producto (asi juega el equipo).
 * Es jugable siempre, sin exigir que no tengas el color activo y sin sistema
 * de desafio. Consecuencia asumida: el +4 no tiene costo. El toggle de
 * validacion estricta es fase 2 y entra exactamente aca.
 */
export function isPlayable(card: Card, activeColor: Color, discardTop: Card | null): boolean {
  if (card.kind === 'wild' || card.kind === 'wild4') return true;
  if (card.color === activeColor) return true;

  if (!discardTop) return false;

  // Mismo simbolo o mismo numero que el tope, aunque cambie el color.
  if (card.kind === 'number' && discardTop.kind === 'number') {
    return card.value === discardTop.value;
  }
  return card.kind === discardTop.kind;
}

export function getPlayableCards(
  hand: readonly Card[],
  activeColor: Color,
  discardTop: Card | null,
): Card[] {
  return hand.filter((c) => isPlayable(c, activeColor, discardTop));
}

/** Jugadores que siguen en la ronda (no abandonaron). */
export function activePlayers(state: GameState): Player[] {
  return state.players.filter((p) => !p.abandoned);
}

/**
 * Avanza `steps` posiciones desde `fromIndex`, salteando abandonados.
 *
 * Ojo: con n=2 esto NO resuelve el reverse-como-skip. Avanzar una posicion
 * lleva al otro jugador sea cual sea el signo de la direccion, asi que el
 * skip de 2 jugadores se aplica explicitamente en applyCardEffect.
 */
export function nextPlayerIndex(state: GameState, fromIndex: number, steps = 1): number {
  const n = state.players.length;
  if (n === 0) return 0;
  if (activePlayers(state).length === 0) return fromIndex;

  let index = fromIndex;
  let remaining = steps;
  let guard = 0;

  while (remaining > 0) {
    index = (index + state.direction + n) % n;
    if (!state.players[index]?.abandoned) remaining--;
    if (++guard > n * (steps + 2)) break; // no colgarse si todos abandonaron
  }
  return index;
}

/** Puntos que suma el ganador: la suma de las manos de todos los demas. */
export function scoreRound(state: GameState, winnerId: string): number {
  return state.players
    .filter((p) => p.id !== winnerId)
    .reduce((sum, p) => sum + p.hand.reduce((s, c) => s + cardPoints(c), 0), 0);
}
