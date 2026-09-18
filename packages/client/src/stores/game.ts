import { create } from 'zustand';
import type { GameEvent, RedactedGameState } from '@uno/engine';
import type { ProtocolErrorCode, RedactedRoomState } from '@uno/protocol';

export type ConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface GameError {
  code: ProtocolErrorCode;
  message: string;
  at: number;
}

/**
 * Espejo del servidor. SOLO se escribe desde la capa net/.
 *
 * Los componentes leen de aca pero nunca escriben: el estado autoritativo
 * cambia unicamente cuando llega un patch. Separado del store de UI porque el
 * estado del servidor se REEMPLAZA entero en cada patch; si el estado local
 * viviera mezclado habria que escribir un merge fragil.
 */
export interface GameStoreState {
  state: RedactedGameState | null;
  room: RedactedRoomState | null;
  connection: ConnectionStatus;
  lastError: GameError | null;
  /** Cola de eventos para animaciones y log de mesa. Se consume y se limpia. */
  events: GameEvent[];

  applySync(state: RedactedGameState): void;
  applyPatch(state: RedactedGameState, events: GameEvent[]): void;
  applyRoom(room: RedactedRoomState): void;
  setConnection(status: ConnectionStatus): void;
  setError(error: Omit<GameError, 'at'> | null): void;
  drainEvents(): GameEvent[];
  reset(): void;
}

const initial = {
  state: null,
  room: null,
  connection: 'idle' as ConnectionStatus,
  lastError: null,
  events: [] as GameEvent[],
};

export const useGameStore = create<GameStoreState>()((set, get) => ({
  ...initial,

  applySync: (state) => set({ state, events: [] }),

  applyPatch: (state, events) =>
    set((prev) => {
      /**
       * Descarta patches viejos. Socket.IO garantiza orden sobre UNA conexion,
       * pero NO a traves de una reconexion — y ahi es exactamente donde llega
       * un patch atrasado que pisaria el sync fresco.
       */
      if (prev.state && state.version <= prev.state.version) return prev;
      return { state, events: [...prev.events, ...events] };
    }),

  applyRoom: (room) => set({ room }),
  setConnection: (connection) => set({ connection }),
  setError: (error) => set({ lastError: error ? { ...error, at: Date.now() } : null }),

  drainEvents: () => {
    const events = get().events;
    if (events.length) set({ events: [] });
    return events;
  },

  reset: () => set({ ...initial }),
}));
