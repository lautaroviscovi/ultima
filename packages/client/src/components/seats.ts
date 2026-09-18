/**
 * Geometria del arco de asientos. Aca se gana o se pierde el diferencial del
 * producto, asi que va aparte del componente y con tests.
 *
 * Decision central: TU MANO NO ES UN ASIENTO. Es UI separada, fija abajo y a
 * tamaño completo. Los N-1 oponentes se reparten en un arco que deja libre el
 * sector inferior. Eso libera el borde inferior, que es el espacio mas valioso
 * y donde vive tu interaccion real.
 */

export interface SeatPosition {
  /** Porcentaje del contenedor: responde a cualquier ancho sin media queries. */
  x: number;
  y: number;
  angle: number;
}

/** Arco de 280 grados: deja +-40 libres abajo para tu mano. */
const ARC_DEGREES = 280;
const START_DEGREES = 130;
const RADIUS_X = 42;
const RADIUS_Y = 34;
const CENTER_X = 50;
const CENTER_Y = 45;

export function seatPositions(count: number): SeatPosition[] {
  if (count <= 0) return [];
  if (count === 1) {
    // Un solo oponente va arriba del todo, centrado.
    return [{ x: CENTER_X, y: CENTER_Y - RADIUS_Y, angle: 90 }];
  }

  const step = ARC_DEGREES / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const deg = START_DEGREES + step * i;
    const rad = (deg * Math.PI) / 180;
    return {
      x: CENTER_X + RADIUS_X * Math.cos(rad),
      y: CENTER_Y - RADIUS_Y * Math.sin(rad),
      angle: deg,
    };
  });
}

/**
 * Variante compacta del asiento cuando el arco se satura.
 *
 * NO achicamos la carta ni la tipografia: escalar todo hacia abajo es
 * exactamente lo que hacen mal las plataformas que topan en 4-8 jugadores.
 * Lo que cambia es la densidad de informacion del asiento, no su tamaño.
 */
export function seatVariant(count: number): 'full' | 'compact' {
  return count >= 8 ? 'compact' : 'full';
}
