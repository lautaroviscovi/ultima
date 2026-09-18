import { describe, expect, it } from 'vitest';
import { createRng } from './rng.js';

describe('createRng', () => {
  it('produce la misma secuencia para el mismo seed', () => {
    const a = Array.from({ length: 50 }, () => createRng('seed-1').nextInt(1000));
    const rng = createRng('seed-1');
    const b = Array.from({ length: 50 }, () => rng.nextInt(1000));
    // Cada rng nuevo arranca igual; el mismo stream avanza distinto.
    expect(a.every((v) => v === a[0])).toBe(true);
    expect(new Set(b).size).toBeGreaterThan(1);
  });

  it('dos streams con el mismo seed avanzan identico', () => {
    const a = createRng('igual');
    const b = createRng('igual');
    for (let i = 0; i < 100; i++) {
      expect(a.nextInt(97)).toBe(b.nextInt(97));
    }
  });

  it('respeta el rango [0, max)', () => {
    const rng = createRng('rango');
    for (let i = 0; i < 500; i++) {
      const v = rng.nextInt(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it('rechaza max invalido en vez de devolver basura', () => {
    const rng = createRng('x');
    expect(() => rng.nextInt(0)).toThrow();
    expect(() => rng.nextInt(-1)).toThrow();
    expect(() => rng.nextInt(1.5)).toThrow();
  });

  it('cuenta lo consumido, para poder assertear determinismo', () => {
    const rng = createRng('c');
    expect(rng.consumed).toBe(0);
    rng.nextInt(10);
    rng.nextInt(10);
    expect(rng.consumed).toBe(2);
  });

  describe('shuffle', () => {
    it('no muta la entrada', () => {
      const original = [1, 2, 3, 4, 5];
      const copy = [...original];
      createRng('s').shuffle(original);
      expect(original).toEqual(copy);
    });

    it('conserva todos los elementos', () => {
      const input = Array.from({ length: 40 }, (_, i) => i);
      const out = createRng('s').shuffle(input);
      expect([...out].sort((a, b) => a - b)).toEqual(input);
    });

    it('efectivamente reordena', () => {
      const input = Array.from({ length: 40 }, (_, i) => i);
      expect(createRng('s').shuffle(input)).not.toEqual(input);
    });

    it('maneja el array vacio y el de un elemento', () => {
      expect(createRng('s').shuffle([])).toEqual([]);
      expect(createRng('s').shuffle([7])).toEqual([7]);
    });
  });

  describe('pick', () => {
    it('siempre devuelve un elemento de la lista', () => {
      const rng = createRng('p');
      const items = ['a', 'b', 'c', 'd'];
      for (let i = 0; i < 100; i++) {
        expect(items).toContain(rng.pick(items));
      }
    });

    it('falla explicito sobre un array vacio', () => {
      expect(() => createRng('p').pick([])).toThrow();
    });
  });
});
