import { COLORS, type Card, type CardId, type CardKind, type NumberValue } from './types.js';
import type { Rng } from './rng.js';

export const DECK_SIZE = 108;

/**
 * Ids deterministas derivados del indice de construccion. No usamos nanoid aca
 * a proposito: el mazo debe ser funcion pura del seed para que el replay
 * coincida. El id es opaco para el cliente igual, que es lo unico que importa
 * desde el punto de vista de no filtrar informacion.
 *
 * Se les antepone el numero de ronda para que los ids NO se puedan correlacionar
 * entre rondas (mazo nuevo, ids nuevos).
 */
function cardId(round: number, index: number): CardId {
  return `r${round}c${index}`;
}

/**
 * Mazo oficial de 108 cartas:
 *   - un 0 por color ............................  4
 *   - dos de cada 1-9 por color ................. 72
 *   - dos skip / reverse / draw2 por color ...... 24
 *   - 4 wild + 4 wild4 .......................... 8
 *
 * El bug clasico es poner DOS ceros por color y terminar en 112. Hay un test
 * de composicion que lo cubre.
 */
export function buildDeck(round = 0): Card[] {
  const cards: Card[] = [];
  let i = 0;
  const push = (kind: CardKind): void => {
    cards.push({ ...kind, id: cardId(round, i++) });
  };

  for (const color of COLORS) {
    push({ kind: 'number', color, value: 0 });

    for (let v = 1; v <= 9; v++) {
      const value = v as NumberValue;
      push({ kind: 'number', color, value });
      push({ kind: 'number', color, value });
    }

    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      push({ kind, color });
      push({ kind, color });
    }
  }

  for (let n = 0; n < 4; n++) push({ kind: 'wild' });
  for (let n = 0; n < 4; n++) push({ kind: 'wild4' });

  return cards;
}

export function buildShuffledDeck(rng: Rng, round = 0): Card[] {
  return rng.shuffle(buildDeck(round));
}
