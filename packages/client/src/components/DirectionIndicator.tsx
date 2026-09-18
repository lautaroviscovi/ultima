import { motion } from 'framer-motion';

export interface DirectionIndicatorProps {
  direction: 1 | -1;
  /** Se acaba de invertir: el reverse merece la animacion mas grande del juego. */
  flash?: boolean;
  reducedMotion?: boolean;
}

/**
 * El reverse es la jugada que mas confunde en UNO online.
 *
 * Tiene presencia ambiental constante (el arco girando lento) para que la
 * direccion no haya que deducirla del orden de los turnos, y al invertirse hace
 * un latigazo imposible de ignorar.
 */
export function DirectionIndicator({
  direction,
  flash = false,
  reducedMotion = false,
}: DirectionIndicatorProps): JSX.Element {
  return (
    <motion.div
      aria-label={direction === 1 ? 'Sentido horario' : 'Sentido antihorario'}
      className={`pointer-events-none select-none text-3xl ${
        flash ? 'text-uno-yellow' : 'text-white/35'
      }`}
      // El giro lento es la presencia ambiental; el signo marca el sentido.
      animate={
        reducedMotion
          ? { rotate: 0, scale: flash ? 1.4 : 1, scaleX: direction }
          : {
              rotate: direction * 360,
              scale: flash ? [1, 1.8, 1.2] : 1,
              scaleX: direction,
            }
      }
      transition={
        reducedMotion
          ? { duration: 0 }
          : {
              rotate: { duration: flash ? 0.5 : 9, repeat: Infinity, ease: 'linear' },
              scale: { duration: 0.6 },
              scaleX: { duration: 0.4 },
            }
      }
    >
      &#10227;
    </motion.div>
  );
}
