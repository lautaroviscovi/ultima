import { useEffect, useState } from 'react';
import type { Card } from '@uno/engine';
import { useGameStore } from '../stores/game.js';

/** Cuanto dura el vuelo mazo -> mano, en ms. */
const FLIGHT_MS = 420;
/** Separacion entre cartas de un mismo robo multiple (+2 / +4). */
const STAGGER_MS = 110;

export interface DrawFlight {
  /**
   * Clave del nodo que vuela.
   *
   * NO es `card.id`, y esa es LA decision de este modulo: mientras vuela, la
   * carta YA esta en tu mano (el patch llego antes de que empiece la
   * animacion), y la mano la renderiza con `layoutId = card.id`. Dos nodos
   * montados con el mismo `layoutId` hacen que Framer los trate como el mismo
   * elemento y el resultado es un salto desde la esquina superior izquierda.
   *
   * Con una clave propia, el vuelo es un nodo independiente que se desmonta al
   * aterrizar, y la carta de la mano no se entera.
   */
  key: string;
  card: Card;
  /** Posicion dentro de un robo multiple, para escalonar la salida. */
  index: number;
  total: number;
}

/**
 * Traduce eventos del juego a momentos animables.
 *
 * Los eventos son la capa de narracion: el estado dice COMO quedo la mesa, los
 * eventos dicen QUE paso. Una animacion necesita lo segundo.
 *
 * Sobre robar cartas ajenas: `CARDS_DRAWN` trae `cards` SOLO para quien robo
 * (lo redacta el gateway). Asi que este hook anima con cartas reales sin
 * inventar nada, y para los demas jugadores simplemente no hay nada que animar
 * — que es justamente lo correcto: no deberias ver que roba el otro.
 */
export function useGameMoments(): { flights: DrawFlight[]; penalty: number } {
  const [flights, setFlights] = useState<DrawFlight[]>([]);
  /** Cuantas cartas te acaban de imponer (+2/+4). 0 = ninguna. */
  const [penalty, setPenalty] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    /**
     * Hasta que numero de evento ya vimos.
     *
     * NO se puede leer `store.events` y confiar en que este: `useEventLog` la
     * vacia con `drainEvents()`, y si ese hook corre primero — depende del
     * orden en que se llamen en el componente — este callback recibe una cola
     * vacia y no anima nada.
     *
     * Eso fue un bug real y desconcertante: el SONIDO del robo se oia
     * perfectamente (ese hook se registra antes que el log) pero la carta no
     * volaba nunca. Medido en el navegador: las 10 notificaciones llegaban con
     * `events.length === 0`.
     *
     * `eventSeq` solo crece, asi que cada consumidor sabe que le falta sin
     * depender del orden ni de quien vacie la cola.
     */
    let seen = useGameStore.getState().eventSeq;

    const unsubscribe = useGameStore.subscribe((store) => {
      if (store.eventSeq === seen || !store.state) return;

      /**
       * Los eventos que entraron desde la ultima vez.
       *
       * El `Math.max(0, ...)` no es defensivo por las dudas: tras un
       * `state:sync` la cola se vacia pero `eventSeq` sigue, asi que `pending`
       * puede ser mayor que lo que hay. Acotado asi, el peor caso es leer lo
       * que quede en la ventana — nunca leer de mas.
       */
      const pending = store.eventSeq - seen;
      seen = store.eventSeq;
      const fresh = store.events.slice(Math.max(0, store.events.length - pending));
      const me = store.state.you.id;

      for (const event of fresh) {
        if (event.type !== 'CARDS_DRAWN' || event.playerId !== me) continue;

        // Sin `cards` no hay nada que animar: es un robo ajeno, o un evento
        // viejo de antes de que el engine las incluyera.
        const cards = event.cards;
        if (!cards?.length) continue;

        // Un robo de mas de una carta es SIEMPRE un castigo (+2 o +4): robar
        // por turno saca exactamente una.
        if (cards.length > 1) {
          setPenalty(cards.length);
          timers.push(setTimeout(() => setPenalty(0), FLIGHT_MS + cards.length * STAGGER_MS + 500));
        }

        const stamp = Date.now();
        const next: DrawFlight[] = cards.map((card, index) => ({
          // El timestamp evita colisionar con un vuelo anterior de la misma
          // carta (posible tras un rebarajado).
          key: `draw-${card.id}-${stamp}`,
          card,
          index,
          total: cards.length,
        }));

        setFlights((current) => [...current, ...next]);

        // Cada vuelo se limpia solo. Sin esto la lista crece toda la partida.
        for (const flight of next) {
          timers.push(
            setTimeout(
              () => setFlights((current) => current.filter((f) => f.key !== flight.key)),
              FLIGHT_MS + flight.index * STAGGER_MS + 80,
            ),
          );
        }
      }
    });

    return () => {
      unsubscribe();
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  return { flights, penalty };
}

export const DRAW_FLIGHT_MS = FLIGHT_MS;
export const DRAW_STAGGER_MS = STAGGER_MS;
