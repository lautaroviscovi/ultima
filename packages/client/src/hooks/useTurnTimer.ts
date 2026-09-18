import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/game.js';

/**
 * Countdown derivado de `turnDeadline`, que es un timestamp ABSOLUTO del
 * servidor.
 *
 * El timer autoritativo vive en el servidor; el cliente solo pinta pixeles. No
 * se confia en el reloj del cliente para nada mas que eso: si estan
 * desfasados, el peor caso es un countdown corrido, nunca un turno perdido o
 * robado.
 */
export interface TurnTimer {
  /** Fraccion restante, 1 al empezar y 0 al vencer. Alimenta el anillo. */
  progress: number;
  secondsLeft: number;
}

export function useTurnTimer(): TurnTimer {
  const deadline = useGameStore((s) => s.state?.turnDeadline ?? 0);
  const total = useGameStore((s) => s.state?.options.turnTimeoutMs ?? 45_000);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    // 250ms alcanza para un countdown fluido sin re-renderizar de mas.
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return { progress: 1, secondsLeft: 0 };

  const remaining = Math.max(0, deadline - now);
  return {
    progress: Math.max(0, Math.min(1, remaining / total)),
    secondsLeft: Math.ceil(remaining / 1000),
  };
}
