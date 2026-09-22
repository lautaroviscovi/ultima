import { AnimatePresence, motion } from 'framer-motion';
import { Card } from './Card.js';
import { DRAW_FLIGHT_MS, DRAW_STAGGER_MS, type DrawFlight } from '../hooks/useGameMoments.js';

/**
 * La carta viajando del mazo a tu mano.
 *
 * Robar era la unica accion frecuente sin NINGUN movimiento: la carta
 * simplemente aparecia en la mano. Con +2 y +4 volando, eso significa que la
 * mitad de lo que te pasa en la mesa no tiene representacion visual.
 *
 * Tres decisiones que no son cosmeticas:
 *
 * 1. **`layoutId` propio, no `card.id`.** Cuando esto se monta, la carta YA
 *    esta en tu mano y la mano la dibuja con `layoutId = card.id`. Dos nodos
 *    con el mismo `layoutId` hacen que Framer los trate como el mismo elemento
 *    y la animacion salta desde la esquina superior izquierda. Este nodo vive
 *    fuera del LayoutGroup y se desmonta al aterrizar.
 *
 * 2. **Dorso, no cara.** La carta se da vuelta al llegar. Ver la cara desde el
 *    mazo spoilea lo que robaste antes de que llegue, y ademas es lo que pasa
 *    en una mesa real.
 *
 * 3. **`position: fixed` y coordenadas de viewport.** El vuelo cruza dos
 *    contenedores (la mesa y la barra de mano) que tienen su propio stacking
 *    context. Cualquier posicionamiento relativo lo recorta uno de los dos.
 */
export function DrawFlightLayer({ flights }: { flights: DrawFlight[] }): JSX.Element {
  return (
    <AnimatePresence>
      {flights.map((flight) => (
        <motion.div
          key={flight.key}
          className="pointer-events-none fixed z-40"
          // Sale del centro de la mesa, que es donde esta el mazo.
          initial={{ left: '50%', top: '45%', x: '-50%', y: '-50%', scale: 0.85, opacity: 0 }}
          animate={{
            left: '50%',
            // Aterriza en la barra de mano, abajo.
            top: '88%',
            x: '-50%',
            y: '-50%',
            scale: 1,
            opacity: [0, 1, 1, 0],
          }}
          exit={{ opacity: 0 }}
          transition={{
            duration: DRAW_FLIGHT_MS / 1000,
            delay: (flight.index * DRAW_STAGGER_MS) / 1000,
            ease: 'easeOut',
            opacity: { times: [0, 0.15, 0.75, 1], duration: DRAW_FLIGHT_MS / 1000 },
          }}
        >
          <Card card={flight.card} faceDown size="lg" animateLayout={false} />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
