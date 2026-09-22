import { describe, expect, it } from 'vitest';
import { jitterFor, pileJitter } from './pile.js';

/**
 * El valor de estos tests es la ESTABILIDAD y la SEPARACION.
 *
 * Si el jitter dejara de ser funcion del id, la pila temblaria en cada patch
 * del servidor — varias veces por segundo en una partida de 10 — y el sintoma
 * ("la mesa vibra") no apuntaria de vuelta a este archivo.
 *
 * Y si las cartas de la pila caen casi en el mismo angulo, el monton se ve
 * alineado, que es exactamente lo que la pila viene a arreglar.
 */
describe('jitterFor', () => {
  it('es estable: el mismo id da siempre el mismo resultado', () => {
    const a = jitterFor('r7c12');
    for (let i = 0; i < 50; i++) {
      expect(jitterFor('r7c12')).toEqual(a);
    }
  });

  it('ids distintos dan angulos distintos', () => {
    const ids = ['r0c1', 'r0c2', 'r0c3', 'b5c9', 'w1c0', 'g3c7', 'y9c4'];
    const angles = new Set(ids.map((id) => jitterFor(id).rotate));
    expect(angles.size).toBeGreaterThan(ids.length - 2);
  });

  it('nunca se sale del rango: pasado el abanico se ve como un error de layout', () => {
    for (let i = 0; i < 2000; i++) {
      const { rotate, x, y } = jitterFor(`r${i % 10}c${i}`);
      expect(Math.abs(rotate)).toBeLessThanOrEqual(14);
      expect(Math.abs(x)).toBeLessThanOrEqual(4);
      expect(Math.abs(y)).toBeLessThanOrEqual(4);
    }
  });

  it('rotacion y desplazamiento no estan correlacionados', () => {
    // Si salieran de los mismos bits, toda carta girada a la derecha estaria
    // tambien corrida a la derecha y el monton se veria peinado, no revuelto.
    let sameSign = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const { rotate, x } = jitterFor(`card-${i}`);
      if (Math.sign(rotate) === Math.sign(x)) sameSign++;
    }
    expect(sameSign / n).toBeGreaterThan(0.35);
    expect(sameSign / n).toBeLessThan(0.65);
  });

  it('no explota con un id vacio', () => {
    expect(() => jitterFor('')).not.toThrow();
  });
});

describe('pileJitter', () => {
  it('es estable', () => {
    const a = pileJitter('red-7-c3', 1, 3);
    for (let i = 0; i < 20; i++) expect(pileJitter('red-7-c3', 1, 3)).toEqual(a);
  });

  /**
   * ESTE es el test que importa, y el que encontro los dos bugs.
   *
   * Primero fallaba porque los tres ejes salian de bloques de bits de un mismo
   * hash y con ids casi identicos el eje `y` colapsaba al mismo valor. Despues,
   * ya con hashes separados, las rotaciones salian a menos de un grado entre
   * si en algunas cartas (`blue-9-c7` daba -1.09, -0.52, 0.39).
   *
   * Por eso ahora se reparte por bandas: la separacion es una propiedad de la
   * construccion, no algo que se le pide al azar. Y por eso el test barre las
   * 40 cartas del mazo en vez de probar una a mano.
   */
  it('EL BUG: separacion garantizada para CUALQUIER carta del mazo', () => {
    for (const color of ['red', 'yellow', 'green', 'blue']) {
      for (let v = 0; v <= 9; v++) {
        const id = `${color}-${v}-c7`;
        const rots = [0, 1, 2].map((i) => pileJitter(id, i, 3).rotate).sort((a, b) => a - b);
        const minSep = Math.min(rots[1]! - rots[0]!, rots[2]! - rots[1]!);
        expect(minSep, `${id} quedo alineado: ${rots.map((n) => n.toFixed(2))}`).toBeGreaterThan(1);
      }
    }
  });

  it('respeta el rango aunque cambie la cantidad de fantasmas', () => {
    for (const count of [1, 2, 3, 4, 6]) {
      for (let i = 0; i < count; i++) {
        const { rotate, x, y } = pileJitter('blue-4-c1', i, count);
        expect(Math.abs(rotate)).toBeLessThanOrEqual(14);
        expect(Math.abs(x)).toBeLessThanOrEqual(4);
        expect(Math.abs(y)).toBeLessThanOrEqual(4);
      }
    }
  });

  it('las bandas van en orden: cada fantasma cae despues del anterior', () => {
    const rots = [0, 1, 2, 3].map((i) => pileJitter('green-2-c5', i, 4).rotate);
    for (let i = 1; i < rots.length; i++) {
      expect(rots[i]!).toBeGreaterThan(rots[i - 1]!);
    }
  });
});
