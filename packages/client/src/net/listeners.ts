import type { RedactedGameState } from '@uno/engine';
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
 * Registra los handlers del servidor. Lo UNICO que hacen es llamar acciones
 * del store: cero logica. Si aparece una decision de juego aca, esta en el
 * lugar equivocado — pertenece al engine, que es autoritativo en el servidor.
 */
let registered = false;

export function registerListeners(): void {
  if (registered) return;
  registered = true;

  const socket = getSocket();
  const store = useGameStore.getState();

  /**
   * Desregistramos antes de registrar.
   *
   * El socket es un singleton de modulo, pero en dev Vite reemplaza este
   * modulo en caliente: los handlers viejos siguen colgados del MISMO socket y
   * apuntan a funciones que ya no existen. El sintoma es un
   * "X is not defined" en cada patch, con el codigo fuente correcto.
   *
   * En produccion esto no pasa, pero limpiar es correcto igual: registrar dos
   * veces duplicaria cada evento.
   */
  for (const event of [
    'state:sync',
    'state:patch',
    'room:updated',
    'error:game',
    'server:shutdown',
  ] as const) {
    socket.off(event);
  }

  socket.on('state:sync', (state) => {
    store.applySync(state);
    syncInFlight(state);
  });

  socket.on('state:patch', ({ state, events }) => {
    store.applyPatch(state, events);
    syncInFlight(state);
  });

  socket.on('room:updated', (room) => {
    store.applyRoom(room);
  });

  socket.on('error:game', (error) => {
    store.setError(error);
  });

  socket.on('server:shutdown', ({ message }) => {
    // Las salas viven en memoria: un redeploy mata las partidas en curso.
    store.setError({ code: 'INTERNAL_ERROR', message });
  });
}

// En dev, al reemplazarse este modulo el flag vuelve a false en la copia nueva
// pero los handlers viejos siguen vivos. Lo marcamos explicitamente para que
// la copia nueva sepa que tiene que re-registrar (y limpiar) de verdad.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    registered = false;
  });
}
