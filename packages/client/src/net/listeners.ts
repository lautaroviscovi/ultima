import { useGameStore } from '../stores/game.js';
import { getSocket } from './socket.js';

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

  socket.on('state:sync', (state) => {
    store.applySync(state);
  });

  socket.on('state:patch', ({ state, events }) => {
    store.applyPatch(state, events);
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
