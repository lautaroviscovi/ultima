import { useEffect, useRef } from 'react';
import { useGameStore } from '../stores/game.js';
import { useUIStore } from '../stores/ui.js';
import { playSound } from '../net/sound.js';

/**
 * Traduce eventos y cambios de turno a sonido.
 *
 * El tick de turno se dispara por transicion (no te tocaba -> te toca), no por
 * render: si no, sonaria en cada patch mientras es tu turno.
 */
export function useGameSounds(): void {
  const wasMyTurn = useRef(false);

  useEffect(() => {
    // Marca propia contra `eventSeq`: no depende de que otro consumidor haya
    // leido o vaciado la cola antes. Ver el comentario en el store.
    let seen = useGameStore.getState().eventSeq;

    return useGameStore.subscribe((store) => {
      const enabled = useUIStore.getState().soundEnabled;
      if (!enabled || !store.state) return;

      const myTurn = store.state.currentPlayerId === store.state.you.id;
      if (myTurn && !wasMyTurn.current) playSound('turn', enabled);
      wasMyTurn.current = myTurn;

      if (store.eventSeq === seen) return;
      const pending = store.eventSeq - seen;
      seen = store.eventSeq;
      const fresh = store.events.slice(Math.max(0, store.events.length - pending));

      for (const event of fresh) {
        switch (event.type) {
          case 'CARD_PLAYED':
            playSound('play', enabled);
            break;
          case 'CARDS_DRAWN':
            /**
             * Robar por turno saca exactamente UNA carta; mas de una es
             * siempre un castigo (+2/+4). Sonaban igual, que es perder la
             * distincion mas util del set: una es neutra y la otra no.
             *
             * Se escalona para que se oigan como N cartas y no como una sola
             * mas fuerte.
             */
            if (event.count > 1) {
              playSound('penalty', enabled);
              for (let i = 1; i < Math.min(event.count, 4); i++) {
                setTimeout(() => playSound('draw', enabled), i * 110);
              }
            } else {
              playSound('draw', enabled);
            }
            break;
          case 'DIRECTION_REVERSED':
            playSound('reverse', enabled);
            break;
          case 'UNO_DECLARED':
          case 'UNO_PENALTY':
            playSound('uno', enabled);
            break;
          case 'ROUND_ENDED':
          case 'GAME_ENDED':
            playSound('win', enabled);
            break;
          default:
            break;
        }
      }
    });
  }, []);
}
