import { AnimatePresence, motion } from 'framer-motion';
import { DURATION, SPRING } from '../design/motion.js';

/**
 * Destello de pantalla completa al invertirse el sentido.
 *
 * Es la animacion mas grande del juego a proposito: con 10 jugadores, el
 * reverse cambia quien sigue y si pasa desapercibido la gente juega fuera de
 * turno y se frustra. No bloquea nada — es puramente visual y dura medio
 * segundo.
 *
 * No recibe `reducedMotion`: el MotionConfig del arbol ya lo aplica.
 *
 * EXCEPCION DELIBERADA a la regla pigmento/intencion: el amarillo de aca es
 * `uno-yellow`, no `brand-accent`. El flash es el eco visual de la CARTA que
 * se acaba de jugar, no un estado de la interfaz — si el amarillo del mazo
 * cambiara, este tiene que cambiar con el, que es lo contrario de lo que pide
 * un token de intencion. No lo "arregles".
 */
export function ReverseFlash({
  show,
  direction,
}: {
  show: boolean;
  direction: 1 | -1;
}): JSX.Element {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="reverse-flash"
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.quick }}
        >
          <div className="absolute inset-0 bg-uno-yellow/15" />
          <motion.p
            className="rounded-2xl bg-scrim px-8 py-4 font-display text-display font-black text-uno-yellow"
            initial={{ scale: 0.5, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={SPRING.pop}
          >
            {direction === 1 ? '↻' : '↺'} CAMBIO DE SENTIDO
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
