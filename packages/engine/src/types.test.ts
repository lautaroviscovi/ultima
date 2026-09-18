import { describe, expect, it } from 'vitest';
import { cardLabel, cardPoints, isColored, isWild } from './types.js';
import { colored, num, wild, wild4 } from './testing/fixtures.js';

describe('cardPoints', () => {
  it('da el valor facial a los numeros', () => {
    for (let v = 0; v <= 9; v++) {
      expect(cardPoints(num('red', v as 0))).toBe(v);
    }
  });

  it('da 20 a skip, reverse y draw2', () => {
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      expect(cardPoints(colored(kind, 'red')), kind).toBe(20);
    }
  });

  it('da 50 a los wilds', () => {
    expect(cardPoints(wild())).toBe(50);
    expect(cardPoints(wild4())).toBe(50);
  });
});

describe('isColored / isWild', () => {
  it('distingue coloreadas de wilds', () => {
    expect(isColored(num('red', 5))).toBe(true);
    expect(isColored(colored('skip', 'blue'))).toBe(true);
    expect(isColored(wild())).toBe(false);
    expect(isColored(wild4())).toBe(false);
  });

  it('isWild es el complemento', () => {
    for (const card of [num('red', 5), colored('skip', 'blue'), wild(), wild4()]) {
      expect(isWild(card)).toBe(!isColored(card));
    }
  });
});

describe('cardLabel', () => {
  it('describe cada tipo de carta', () => {
    expect(cardLabel(num('red', 7))).toBe('red 7');
    expect(cardLabel(colored('skip', 'blue'))).toBe('blue skip');
    expect(cardLabel(colored('reverse', 'green'))).toBe('green reverse');
    expect(cardLabel(colored('draw2', 'yellow'))).toBe('yellow +2');
    expect(cardLabel(wild())).toBe('wild');
    expect(cardLabel(wild4())).toBe('wild +4');
  });
});
