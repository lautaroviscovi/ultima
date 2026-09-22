import { describe, expect, it } from 'vitest';
import { SURFACE, seatPositions } from './seats.js';

/**
 * La mesa tiene que CONTENER a la gente sentada a ella.
 *
 * Esto existe por un bug que cometí dos veces en la misma tarde, las dos por
 * elegir los números a ojo en vez de derivarlos:
 *
 * 1. Primero dibujé el paño MÁS CHICO que el arco. Los tres asientos de abajo
 *    quedaron colgando fuera del óvalo — gente flotando al lado de la mesa.
 * 2. Después lo agrandé hasta los cuatro bordes de la pantalla, y volvió a
 *    leerse como fondo en vez de objeto.
 *
 * Ninguna de las dos rompía un test, porque no había ninguno que relacionara
 * las dos geometrías: `seats.ts` tenía sus tests y el SVG no tenía nada.
 *
 * El riesgo real no es que yo me equivoque hoy —eso ya pasó y se ve en
 * pantalla— sino que alguien toque `ARC_DEGREES` o `RADIUS_Y` dentro de un
 * año y el paño se desincronice EN SILENCIO: los asientos siguen bien
 * distribuidos, los tests de `seats.ts` siguen verdes, y la mesa queda mal
 * dibujada sin que nada avise.
 */

/** ¿Cae el punto dentro de la elipse del paño? */
function dentroDelPano(x: number, y: number): boolean {
  const dx = (x - SURFACE.cx) / SURFACE.rx;
  const dy = (y - SURFACE.cy) / SURFACE.ry;
  return dx * dx + dy * dy <= 1;
}

describe('la mesa contiene al arco', () => {
  /**
   * El caso que falló: con 10 jugadores el arco se abre del todo y los
   * asientos de los extremos bajan mucho más de lo que sugiere `RADIUS_Y`.
   */
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])('con %i oponentes, todos sentados al paño', (n) => {
    const fuera = seatPositions(n).filter((p) => !dentroDelPano(p.x, p.y));
    expect(fuera, `asientos fuera del paño: ${JSON.stringify(fuera)}`).toEqual([]);
  });

  /**
   * El otro extremo. Una mesa que llega a los bordes deja de leerse como
   * objeto y vuelve a ser un fondo — que es exactamente la queja que esta
   * fase vino a resolver.
   *
   * El margen se mide sobre el área del arco, que ya viene achicada por el
   * `inset` del contenedor en `TableLayout`.
   */
  it('deja piso visible alrededor: la mesa es un objeto, no un fondo', () => {
    expect(SURFACE.cx + SURFACE.rx, 'el paño toca el borde derecho').toBeLessThan(100);
    expect(SURFACE.cx - SURFACE.rx, 'el paño toca el borde izquierdo').toBeGreaterThan(0);
    expect(SURFACE.cy - SURFACE.ry, 'el paño toca el borde superior').toBeGreaterThan(0);
  });

  /**
   * Holgura, no ajuste exacto: los asientos tienen ~120px de ancho y su
   * POSICIÓN es el centro, así que un asiento cuyo centro cae justo sobre el
   * borde igual sobresale medio cuerpo.
   */
  it('los asientos quedan con holgura, no pegados al canto', () => {
    const margenes = seatPositions(9).map((p) => {
      const dx = (p.x - SURFACE.cx) / SURFACE.rx;
      const dy = (p.y - SURFACE.cy) / SURFACE.ry;
      return Math.sqrt(dx * dx + dy * dy);
    });
    // 0.92 deja al asiento más externo con un 8% de radio de aire por detrás.
    expect(Math.max(...margenes)).toBeLessThan(0.92);
  });
});
