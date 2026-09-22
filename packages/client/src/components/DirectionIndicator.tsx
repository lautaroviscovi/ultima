import { motion } from 'framer-motion';
import { DURATION } from '../design/motion.js';

export interface DirectionIndicatorProps {
  direction: 1 | -1;
  /** Se acaba de invertir: el reverse merece la animacion mas grande del juego. */
  flash?: boolean;
}

/**
 * El reverse es la jugada que mas confunde en UNO online.
 *
 * Tiene presencia ambiental constante (el arco girando lento) para que la
 * direccion no haya que deducirla del orden de los turnos, y al invertirse hace
 * un latigazo imposible de ignorar.
 *
 * No recibe `reducedMotion`: el MotionConfig que lo envuelve ya lo aplica a
 * todo el arbol. Pasarlo por prop era la misma preferencia leida dos veces, y
 * la copia por prop era la que se podia olvidar de enchufar.
 */
export function DirectionIndicator({
  direction,
  flash = false,
}: DirectionIndicatorProps): JSX.Element {
  return (
    <motion.div
      aria-label={direction === 1 ? 'Sentido horario' : 'Sentido antihorario'}
      // `uno-yellow` a proposito: es el eco de la carta reverse jugada, no un
      // estado de UI. Misma excepcion documentada en ReverseFlash.
      className={`pointer-events-none select-none text-figure-md ${
        flash ? 'text-uno-yellow' : 'text-white/35'
      }`}
      // El giro lento es la presencia ambiental; el signo marca el sentido.
      animate={{
        rotate: direction * 360,
        scale: flash ? [1, 1.8, 1.2] : 1,
        scaleX: direction,
      }}
      transition={{
        rotate: { duration: flash ? 0.5 : 9, repeat: Infinity, ease: 'linear' },
        scale: { duration: 0.6 },
        scaleX: { duration: DURATION.color * 0.8 },
      }}
    >
      &#10227;
    </motion.div>
  );
}
