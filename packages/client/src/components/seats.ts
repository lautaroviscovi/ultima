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
/**
 * La elipse del arco.
 *
 * Se exportan porque `TableSurface` DIBUJA esta misma elipse: la mesa y los
 * asientos tienen que ser la misma figura, o la gente queda sentada al aire.
 * Exportarlas no cambia ninguna posicion — son las constantes de siempre.
 */
export const TABLE_RADIUS_X = 42;
export const TABLE_RADIUS_Y = 34;
export const TABLE_CENTER_X = 50;
export const TABLE_CENTER_Y = 45;

/**
 * La elipse del PANO, derivada del arco.
 *
 * Vive aca y no en `TableSurface` porque es la misma geometria: el paño tiene
 * que seguir al arco, y tenerlos en archivos distintos fue lo que permitio que
 * se desincronizaran dos veces sin que ningun test lo notara.
 *
 * Los factores estan MEDIDOS en el layout de 10, que es el caso limite. El
 * arco son 280 grados —no una elipse completa— asi que los asientos de los
 * extremos bajan bastante mas de lo que sugiere `TABLE_RADIUS_Y`: el mas bajo
 * cae al 79% del contenedor. Por eso el pano se extiende en vez de achicarse,
 * y se corre 2 puntos hacia abajo para abrazar el arco.
 */
export const SURFACE = {
  cx: TABLE_CENTER_X,
  cy: TABLE_CENTER_Y + 2,
  rx: TABLE_RADIUS_X * 1.14,
  ry: TABLE_RADIUS_Y * 1.2,
} as const;

const RADIUS_X = TABLE_RADIUS_X;
const RADIUS_Y = TABLE_RADIUS_Y;
const CENTER_X = TABLE_CENTER_X;
const CENTER_Y = TABLE_CENTER_Y;

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
