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
    return useGameStore.subscribe((store, prev) => {
      const enabled = useUIStore.getState().soundEnabled;
      if (!enabled || !store.state) return;

      const myTurn = store.state.currentPlayerId === store.state.you.id;
      if (myTurn && !wasMyTurn.current) playSound('turn', enabled);
      wasMyTurn.current = myTurn;

      // Los eventos nuevos de este patch.
      if (store.events === prev.events) return;
      const fresh = store.events.slice(prev.events.length);

      for (const event of fresh) {
        switch (event.type) {
          case 'CARD_PLAYED':
            playSound('play', enabled);
            break;
          case 'CARDS_DRAWN':
            playSound('draw', enabled);
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
