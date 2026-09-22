import { AnimatePresence, motion } from 'framer-motion';
import { DURATION, SPRING } from '../design/motion.js';

export interface HandActionsProps {
  /** Te queda una carta despues de jugar: podes cantar. */
  aboutToWin?: boolean;
  onDeclareUno?: () => void;
  /** A quien se le puede acusar el ÚLTIMA no cantado, si la ventana esta abierta. */
  callOut?: { playerId: string; nickname: string } | null;
  onCallOut?: (playerId: string) => void;
}

/**
 * Las dos acciones que no son jugar una carta, al lado de las cartas.
 *
 * Antes estaban en los dos peores lugares posibles:
 *
 * - **¡ÚLTIMA!** vivia en una fila con `justify-between`, o sea pegado al borde
 *   derecho de una pantalla de 1100px o mas, mientras la mano esta CENTRADA.
 *   Con mano chica habia cientos de pixeles entre el boton y la carta mas
 *   cercana.
 * - **Acusar** era un overlay sobre el asiento del rival, arriba en el arco.
 *   Tu atencion esta en tu mano, abajo, y la ventana para acusar dura segundos.
 *
 * Las dos son reacciones a algo que acaba de pasar y compiten con el reloj. Van
 * donde ya estan tus ojos.
 */
export function HandActions({
  aboutToWin = false,
  onDeclareUno,
  callOut = null,
  onCallOut,
}: HandActionsProps): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      {/*
        El acusar aparece y desaparece con la ventana del servidor, asi que
        entra animado: un boton que se materializa al lado de tu mano se nota
        sin tener que buscarlo.
      */}
      <AnimatePresence>
        {callOut && (
          <motion.button
            key="call-out"
            type="button"
            onClick={() => onCallOut?.(callOut.playerId)}
            initial={{ opacity: 0, scale: 0.85, x: 8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={SPRING.pop}
            className="flex items-center gap-1.5 rounded-full bg-intent-urgent px-4 py-1.5
                       text-mini font-black text-white shadow-card-lift"
          >
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            {/* El nombre primero: con 10 jugadores hay que saber a quien. */}
            <span className="max-w-[9rem] truncate">{callOut.nickname}</span>
            <span className="font-normal opacity-90">no dijo ÚLTIMA</span>
          </motion.button>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={onDeclareUno}
        disabled={!aboutToWin}
        // El boton se ilumina ANTES de quedar en una: declarar junto con la
        // jugada elimina la carrera de red que arruina la experiencia.
        animate={aboutToWin ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={
          aboutToWin
            ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }
            : { duration: DURATION.quick }
        }
        className={`rounded-full px-5 py-1.5 font-display text-body font-black transition-colors
                    ${
                      aboutToWin
                        ? 'bg-brand-accent text-brand-ink shadow-card-lift'
                        : 'bg-raised text-white/25'
                    }`}
      >
        ¡ÚLTIMA!
      </motion.button>
    </div>
  );
}
