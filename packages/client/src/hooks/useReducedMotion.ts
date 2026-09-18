import { useEffect, useState } from 'react';

/**
 * Respeta `prefers-reduced-motion`.
 *
 * No es decorativo: para alguien con sensibilidad vestibular, cartas volando y
 * un reverse con latigazo pueden marear de verdad. Con esto activado las
 * transiciones pasan a duracion 0 en vez de desaparecer, asi el estado final
 * sigue siendo el mismo y nada queda a medio camino.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
