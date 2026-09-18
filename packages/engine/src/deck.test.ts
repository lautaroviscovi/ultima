import { describe, expect, it } from 'vitest';
import { buildDeck, buildShuffledDeck, DECK_SIZE } from './deck.js';
import { createRng } from './rng.js';
import { cardPoints, type Card } from './types.js';

function countBy(cards: Card[], fn: (c: Card) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cards) out[fn(c)] = (out[fn(c)] ?? 0) + 1;
  return out;
}

describe('buildDeck', () => {
  it('tiene exactamente 108 cartas', () => {
    // El bug mas comun de UNO: dos ceros por color -> 112.
    expect(buildDeck()).toHaveLength(DECK_SIZE);
  });

  it('tiene la composicion oficial por tipo', () => {
    const byKind = countBy(buildDeck(), (c) => c.kind);
    expect(byKind).toEqual({
      number: 76, // 4 ceros + 72 del 1 al 9
      skip: 8,
      reverse: 8,
      draw2: 8,
      wild: 4,
      wild4: 4,
    });
  });

  it('tiene UN cero por color y DOS de cada 1-9', () => {
    const numbers = buildDeck().filter((c) => c.kind === 'number');
    const byFace = countBy(numbers, (c) => (c.kind === 'number' ? `${c.color}-${c.value}` : ''));

    for (const color of ['red', 'yellow', 'green', 'blue']) {
      expect(byFace[`${color}-0`], `${color} 0`).toBe(1);
      for (let v = 1; v <= 9; v++) {
        expect(byFace[`${color}-${v}`], `${color} ${v}`).toBe(2);
      }
    }
  });

  it('reparte los 25 coloreados por cada color', () => {
    const colored = buildDeck().filter((c) => c.kind !== 'wild' && c.kind !== 'wild4');
    const byColor = countBy(colored, (c) => ('color' in c ? c.color : ''));
    expect(byColor).toEqual({ red: 25, yellow: 25, green: 25, blue: 25 });
  });

  it('suma 1240 puntos en total', () => {
    // Derivado, no memorizado: numeros 4*(45+45)=360, los 24 de 20pts=480,
    // los 8 wilds de 50pts=400. Total 1240. Es una invariante cruzada: si
    // cambia la composicion del mazo O la tabla de puntos, esto falla.
    const total = buildDeck().reduce((sum, c) => sum + cardPoints(c), 0);
    expect(total).toBe(1240);
  });

  it('no repite ids dentro de una ronda', () => {
    const ids = new Set(buildDeck().map((c) => c.id));
    expect(ids.size).toBe(DECK_SIZE);
  });

  it('no reusa ids entre rondas, para que no se puedan correlacionar', () => {
    const r0 = new Set(buildDeck(0).map((c) => c.id));
    const r1 = buildDeck(1).map((c) => c.id);
    expect(r1.some((id) => r0.has(id))).toBe(false);
  });
});

describe('buildShuffledDeck', () => {
  it('es determinista para un mismo seed', () => {
    const a = buildShuffledDeck(createRng('abc')).map((c) => c.id);
    const b = buildShuffledDeck(createRng('abc')).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('difiere entre seeds distintos', () => {
    const a = buildShuffledDeck(createRng('abc')).map((c) => c.id);
    const b = buildShuffledDeck(createRng('xyz')).map((c) => c.id);
    expect(a).not.toEqual(b);
  });

  it('baraja sin perder ni duplicar cartas', () => {
    const shuffled = buildShuffledDeck(createRng('s'));
    expect(shuffled).toHaveLength(DECK_SIZE);
    expect(new Set(shuffled.map((c) => c.id)).size).toBe(DECK_SIZE);
  });
});
