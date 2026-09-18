import { describe, expect, it } from 'vitest';
import { CARD_WIDTH, overlapFor } from './Hand.js';

/** Ancho total que ocupa el abanico con ese solapamiento. */
function fanWidth(count: number, overlap: number): number {
  return count * CARD_WIDTH + (count - 1) * overlap;
}

describe('overlapFor', () => {
  it('no solapa cuando las cartas entran de sobra', () => {
    expect(overlapFor(7, 1400)).toBe(0);
    expect(overlapFor(1, 400)).toBe(0);
    expect(overlapFor(0, 400)).toBe(0);
  });

  it('EL BUG: 25 cartas tienen que entrar en el viewport', () => {
    // Con umbrales fijos, 25 x (96 - 30) = 1650px desbordaban un viewport de
    // 1400 y las cartas de los extremos quedaban cortadas.
    const width = 1400;
    const overlap = overlapFor(25, width);
    expect(fanWidth(25, overlap)).toBeLessThanOrEqual(width);
  });

  it('entra para cualquier cantidad razonable y cualquier ancho tipico', () => {
    for (const width of [1036, 1100, 1400, 1920]) {
      for (const count of [8, 12, 20, 25, 30, 40]) {
        const overlap = overlapFor(count, width);
        const total = fanWidth(count, overlap);
        // Con manos muy grandes se alcanza el tope de solapamiento; ahi
        // desbordar es inevitable, pero el overflow-hidden lo contiene y la
        // carta sigue siendo distinguible.
        const maxOverlapReached = overlap === -(CARD_WIDTH - 26);
        if (!maxOverlapReached) {
          expect(total, `${count} cartas en ${width}px`).toBeLessThanOrEqual(width + 1);
        }
      }
    }
  });

  it('nunca tapa tanto como para no distinguir la carta', () => {
    // Si asoman menos de ~26px no se ve ni el numero de la esquina.
    const overlap = overlapFor(60, 800);
    expect(CARD_WIDTH + overlap).toBeGreaterThanOrEqual(26);
  });

  it('solapa mas cuanto mas cartas hay', () => {
    const a = overlapFor(12, 1400);
    const b = overlapFor(20, 1400);
    const c = overlapFor(28, 1400);
    expect(b).toBeLessThan(a);
    expect(c).toBeLessThan(b);
  });

  it('solapa menos en pantallas mas anchas', () => {
    expect(overlapFor(20, 1920)).toBeGreaterThan(overlapFor(20, 1100));
  });
});
