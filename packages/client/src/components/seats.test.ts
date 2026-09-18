import { describe, expect, it } from 'vitest';
import { seatPositions, seatVariant } from './seats.js';

describe('seatPositions', () => {
  it('devuelve una posicion por oponente', () => {
    for (const n of [1, 2, 5, 9]) {
      expect(seatPositions(n)).toHaveLength(n);
    }
  });

  it('maneja 0 oponentes sin romper', () => {
    expect(seatPositions(0)).toEqual([]);
  });

  it('con un solo oponente lo pone arriba y centrado', () => {
    const [seat] = seatPositions(1);
    expect(seat!.x).toBeCloseTo(50, 5);
    expect(seat!.y).toBeLessThan(50);
  });

  it('mantiene todos los asientos dentro del contenedor', () => {
    // Coordenadas en % : si se van de [0,100] el asiento queda fuera de pantalla.
    for (let n = 1; n <= 9; n++) {
      for (const seat of seatPositions(n)) {
        expect(seat.x, `x con ${n} oponentes`).toBeGreaterThanOrEqual(0);
        expect(seat.x, `x con ${n} oponentes`).toBeLessThanOrEqual(100);
        expect(seat.y, `y con ${n} oponentes`).toBeGreaterThanOrEqual(0);
        expect(seat.y, `y con ${n} oponentes`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('DEJA LIBRE el sector inferior, que es donde va tu mano', () => {
    // La decision central del layout: tu mano no es un asiento. Si un oponente
    // aterriza abajo del centro, se pisa con tu mano.
    for (let n = 1; n <= 9; n++) {
      for (const seat of seatPositions(n)) {
        expect(seat.y, `${n} oponentes: ningun asiento invade la zona de la mano`).toBeLessThan(80);
      }
    }
  });

  it('reparte los asientos sin superponerlos', () => {
    // Con 9 oponentes (mesa de 10) los asientos quedan mas juntos, pero no
    // encimados: el arco tiene que dar separacion suficiente.
    const positions = seatPositions(9);
    for (let i = 1; i < positions.length; i++) {
      const a = positions[i - 1]!;
      const b = positions[i]!;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      expect(distance, `separacion entre asiento ${i - 1} y ${i}`).toBeGreaterThan(5);
    }
  });

  it('es simetrico: el primero y el ultimo quedan a la misma altura', () => {
    const positions = seatPositions(9);
    const first = positions[0]!;
    const last = positions.at(-1)!;
    expect(first.y).toBeCloseTo(last.y, 5);
    // Y a lados opuestos del centro.
    expect(first.x).toBeLessThan(50);
    expect(last.x).toBeGreaterThan(50);
  });

  it('es determinista', () => {
    expect(seatPositions(7)).toEqual(seatPositions(7));
  });
});

describe('seatVariant', () => {
  it('usa la variante completa con pocas personas', () => {
    expect(seatVariant(3)).toBe('full');
    expect(seatVariant(7)).toBe('full');
  });

  it('compacta a partir de 8 oponentes', () => {
    // No achicamos la carta ni la tipografia: escalar todo hacia abajo es lo
    // que hacen mal las plataformas que topan en 4-8.
    expect(seatVariant(8)).toBe('compact');
    expect(seatVariant(9)).toBe('compact');
  });
});
