import { AnimatePresence, motion } from 'framer-motion';

/**
 * Destello de pantalla completa al invertirse el sentido.
 *
 * Es la animacion mas grande del juego a proposito: con 10 jugadores, el
 * reverse cambia quien sigue y si pasa desapercibido la gente juega fuera de
 * turno y se frustra. No bloquea nada — es puramente visual y dura medio
 * segundo.
 */
export function ReverseFlash({
  show,
  direction,
  reducedMotion = false,
}: {
  show: boolean;
  direction: 1 | -1;
  reducedMotion?: boolean;
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
          transition={{ duration: reducedMotion ? 0 : 0.2 }}
        >
          <div className="absolute inset-0 bg-uno-yellow/15" />
          <motion.p
            className="rounded-2xl bg-black/70 px-8 py-4 text-3xl font-black text-uno-yellow"
            initial={reducedMotion ? { scale: 1 } : { scale: 0.5, rotate: -12 }}
            animate={reducedMotion ? { scale: 1 } : { scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          >
            {direction === 1 ? '↻' : '↺'} CAMBIO DE SENTIDO
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
