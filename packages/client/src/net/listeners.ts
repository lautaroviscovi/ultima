import type { GameEvent, RedactedGameState } from '@uno/engine';
import type { ProtocolErrorCode, RedactedRoomState, ServerToClientEvents } from '@uno/protocol';
import { useGameStore } from '../stores/game.js';
import { useUIStore } from '../stores/ui.js';
import { getSocket } from './socket.js';

/**
 * Limpia el optimismo visual cuando llega la verdad del servidor.
 *
 * Una carta marcada in-flight se oculta para que parezca que ya volo al
 * descarte. Si la jugada fue aceptada, la carta ya no esta en la mano y el
 * marcador queda colgado: sin esto el Set crece con ids muertos para siempre.
 * Si fue rechazada, commands.ts ya la desmarco y la carta vuelve a aparecer.
 */
function syncInFlight(state: RedactedGameState): void {
  const ui = useUIStore.getState();
  if (ui.cardsInFlight.size === 0) return;

  const inHand = new Set(state.you.hand.map((c) => c.id));
  for (const cardId of ui.cardsInFlight) {
    if (!inHand.has(cardId)) ui.unmarkInFlight(cardId);
  }
}

/**
 * Enruta los pushes del servidor al store. Lo UNICO que hacen es llamar
 * acciones: cero logica. Si aparece una decision de juego aca, esta en el lugar
 * equivocado — pertenece al engine, que es autoritativo en el servidor.
 */
let registered = false;

export function registerListeners(): void {
  if (registered) return;
  registered = true;

  const store = useGameStore.getState();

  getSocket().setPushHandler((event: keyof ServerToClientEvents, data: unknown) => {
    switch (event) {
      case 'state:sync': {
        const state = data as RedactedGameState;
        store.applySync(state);
        syncInFlight(state);
        break;
      }
      case 'state:patch': {
        const patch = data as { state: RedactedGameState; events: GameEvent[] };
        store.applyPatch(patch.state, patch.events);
        syncInFlight(patch.state);
        break;
      }
      case 'room:updated':
        store.applyRoom(data as RedactedRoomState);
        break;
      case 'error:game':
        store.setError(data as { code: ProtocolErrorCode; message: string });
        break;
      case 'server:shutdown': {
        // Las salas viven en memoria: un redeploy mata las partidas en curso.
        const { message } = data as { message: string };
        store.setError({ code: 'INTERNAL_ERROR', message });
        break;
      }
      default:
        break;
    }
  });
}

// En dev, al reemplazarse este modulo el flag vuelve a false en la copia nueva
// pero el handler viejo sigue instalado en el socket singleton. Lo marcamos
// para que la copia nueva re-registre de verdad.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    registered = false;
  });
}
