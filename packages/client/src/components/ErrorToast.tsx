import { useEffect } from 'react';
import type { GameError } from '../stores/game.js';

/**
 * El error de un comando rechazado va SOLO al que lo emitio. Se muestra y se
 * va: no hace falta que el jugador lo cierre a mano en medio de una partida.
 */
export function ErrorToast({
  error,
  onDismiss,
}: {
  error: GameError | null;
  onDismiss: () => void;
}): JSX.Element | null {
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(onDismiss, 3000);
    return () => clearTimeout(id);
  }, [error, onDismiss]);

  if (!error) return null;

  return (
    <div
      role="alert"
      className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg bg-intent-danger px-5 py-2
                 text-body font-bold text-white shadow-lg"
    >
      {error.message}
    </div>
  );
}
