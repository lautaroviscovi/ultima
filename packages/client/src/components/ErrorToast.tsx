import { useEffect, useRef } from 'react';
import type { GameError } from '../stores/game.js';
import { errorCopy } from '../net/errorCopy.js';

/**
 * El error de un comando rechazado va SOLO al que lo emitio. Se muestra y se
 * va: no hace falta que el jugador lo cierre a mano en medio de una partida.
 *
 * Muestra la traduccion del `code`, NUNCA el `message` del servidor: ese texto
 * expone estado interno del motor (el nombre de la fase, ids de jugador, la
 * lista de comandos del protocolo). Ver `net/errorCopy.ts`.
 */
export function ErrorToast({
  error,
  onDismiss,
}: {
  error: GameError | null;
  onDismiss: () => void;
}): JSX.Element | null {
  /**
   * EL BUG: el toast se quedaba fijo en pantalla, para siempre.
   *
   * El temporizador estaba bien —3 segundos y se va— pero el efecto dependia
   * de `onDismiss`, y quien lo usa lo pasa como arrow inline
   * (`onDismiss={() => setError(null)}`). Eso es una funcion NUEVA en cada
   * render, asi que React re-corria el efecto, el cleanup cancelaba el timer
   * y volvia a arrancar de cero.
   *
   * En una partida hay renders todo el tiempo (el reloj del turno, cada carta
   * jugada, cada patch del servidor), asi que la cuenta se reiniciaba antes de
   * llegar a 3s y el toast no se iba nunca.
   *
   * La ref rompe esa dependencia: el efecto se dispara SOLO cuando cambia el
   * error, que es la unica razon legitima para reiniciar la cuenta.
   */
  const dismissRef = useRef(onDismiss);

  // La ref se actualiza en un efecto, no durante el render: escribirla en el
  // cuerpo del componente es lo que `react-hooks/refs` prohibe, y con razon.
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => dismissRef.current(), 3000);
    return () => clearTimeout(id);
  }, [error]);

  if (!error) return null;

  return (
    <div
      role="alert"
      className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg bg-intent-danger px-5 py-2
                 text-body font-bold text-white shadow-lg"
    >
      {errorCopy(error.code)}
    </div>
  );
}
