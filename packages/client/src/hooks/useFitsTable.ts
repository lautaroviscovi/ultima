import { useEffect, useState } from 'react';
import { MIN_WIDTH } from '../components/TableLayout.js';

/**
 * Si la ventana da el ancho que la mesa de 10 necesita.
 *
 * Vivia suelto adentro de `Table.tsx`, y por eso el aviso llegaba TARDE: el
 * chequeo existia solo en la mesa, asi que desde el telefono se podia crear la
 * sala, copiar el codigo e invitar gente — y recien al empezar la partida
 * aparecia el cartel de "necesitas una ventana mas ancha".
 *
 * Como hook compartido, el Home puede avisar ANTES de que alguien organice una
 * partida que no va a poder jugar.
 *
 * `MIN_WIDTH` sigue siendo decision de producto (desktop-only, ver
 * `TableLayout.tsx`): lo que cambia es donde se avisa, no el limite.
 */
/** La misma consulta en el valor inicial y en la suscripcion. */
const QUERY = `(min-width: ${MIN_WIDTH}px)`;

export function useFitsTable(): boolean {
  /**
   * El valor inicial sale de `matchMedia`, NO de `window.innerWidth`.
   *
   * Parecen equivalentes y no lo son: `innerWidth` incluye la barra de scroll
   * y `matchMedia` no, asi que cerca del umbral pueden discrepar. Usar una
   * fuente para el valor inicial y otra para las actualizaciones haria que el
   * aviso parpadee en el primer render justo en el ancho limite.
   */
  const [fits, setFits] = useState(
    () => typeof window === 'undefined' || !window.matchMedia || window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    /**
     * `matchMedia` y no un listener de `resize`: el navegador solo notifica
     * cuando se CRUZA el umbral, en vez de en cada pixel del arrastre. En una
     * ventana que se redimensiona son decenas de renders menos.
     */
    const query = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent): void => setFits(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return fits;
}
