/**
 * Tipos del dominio. Sin dependencias de red: el engine no sabe que existe un socket.
 */

export type Color = 'red' | 'yellow' | 'green' | 'blue';

export const COLORS: readonly Color[] = ['red', 'yellow', 'green', 'blue'] as const;

export type NumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Id opaco por INSTANCIA de carta (no por tipo). Ver nota en `Card`. */
export type CardId = string;
export type PlayerId = string;

export type CardKind =
  | { kind: 'number'; color: Color; value: NumberValue }
  | { kind: 'skip'; color: Color }
  | { kind: 'reverse'; color: Color }
  | { kind: 'draw2'; color: Color }
  | { kind: 'wild' }
  | { kind: 'wild4' };

/**
 * El `id` es unico por instancia, no por cara. Tres razones, en orden de peso:
 *
 * 1. No filtrar informacion: con ids opacos, tus cartas viajan completas y las
 *    ajenas son solo un conteo. La alternativa (indices posicionales) es fragil
 *    y estructuralmente reveladora.
 * 2. Animaciones: `layoutId={card.id}` da la transicion mano->descarte gratis.
 *    Sin id por instancia, al jugar una de tus dos `red-7` React no sabe cual
 *    desaparecio y la animacion salta.
 * 3. Comandos inequivocos: `{ cardId }` no tiene ambiguedad con reordenamientos.
 */
export type Card = CardKind & { id: CardId };

/** Cartas con color propio (todo menos los wilds). */
export type ColoredCard = Extract<CardKind, { color: Color }> & { id: CardId };

export function isColored(card: Card): card is ColoredCard {
  return card.kind !== 'wild' && card.kind !== 'wild4';
}

export function isWild(card: Card): boolean {
  return card.kind === 'wild' || card.kind === 'wild4';
}

/** Puntaje de una carta al contar manos ajenas al final de la ronda. */
export function cardPoints(card: Card): number {
  switch (card.kind) {
    case 'number':
      return card.value;
    case 'skip':
    case 'reverse':
    case 'draw2':
      return 20;
    case 'wild':
    case 'wild4':
      return 50;
  }
}

/** Etiqueta corta para logs y el log de mesa. */
export function cardLabel(card: Card): string {
  switch (card.kind) {
    case 'number':
      return `${card.color} ${card.value}`;
    case 'skip':
      return `${card.color} skip`;
    case 'reverse':
      return `${card.color} reverse`;
    case 'draw2':
      return `${card.color} +2`;
    case 'wild':
      return 'wild';
    case 'wild4':
      return 'wild +4';
  }
}
