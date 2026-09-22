import { create } from 'zustand';
import type { GameEvent, RedactedGameState } from '@uno/engine';
import type { ProtocolErrorCode, RedactedRoomState } from '@uno/protocol';
import { shouldShowError } from '../net/errorCopy.js';

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
  /**
   * Cola de eventos para animaciones y log de mesa.
   *
   * Hay VARIOS consumidores (log, sonido, animaciones) y ninguno la vacia:
   * antes el log la drenaba y el que corriera despues encontraba una cola
   * vacia. Para saber que te falta ver, compararse contra `eventSeq`.
   */
  events: GameEvent[];
  /**
   * Cuantos eventos se encolaron DESDE SIEMPRE.
   *
   * Es lo que permite que varios consumidores independientes sepan que les
   * falta ver sin pisarse: cada uno recuerda hasta que numero proceso. Sin
   * esto, el orden de registro de los hooks decide quien ve los eventos —
   * que es una carrera, y fue un bug real: el sonido de robo sonaba pero la
   * carta no volaba.
   */
  eventSeq: number;

  applySync(state: RedactedGameState): void;
  applyPatch(state: RedactedGameState, events: GameEvent[]): void;
  applyRoom(room: RedactedRoomState): void;
  setConnection(status: ConnectionStatus): void;
  setError(error: Omit<GameError, 'at'> | null): void;
  reset(): void;
}

/**
 * Cuantos eventos se guardan.
 *
 * Los consumidores leen en la misma notificacion en que llegan, asi que con
 * mucho menos alcanzaria; el margen cubre un patch grande (un +4 con
 * rebarajado y fin de ronda encadenados).
 */
const MAX_EVENTS = 200;

const initial = {
  state: null,
  room: null,
  connection: 'idle' as ConnectionStatus,
  lastError: null,
  events: [] as GameEvent[],
  eventSeq: 0,
};

export const useGameStore = create<GameStoreState>()((set) => ({
  ...initial,

  /**
   * Un sync es un punto de partida, no un diff: se descartan los eventos
   * pendientes. `eventSeq` NO se reinicia, asi los consumidores detectan el
   * corte comparando su marca en vez de reprocesar una cola que ya no
   * corresponde al estado nuevo.
   */
  applySync: (state) => set({ state, events: [] }),

  applyPatch: (state, events) =>
    set((prev) => {
      /**
       * Descarta patches viejos. Socket.IO garantiza orden sobre UNA conexion,
       * pero NO a traves de una reconexion — y ahi es exactamente donde llega
       * un patch atrasado que pisaria el sync fresco.
       */
      if (prev.state && state.version <= prev.state.version) return prev;
      return {
        state,
        // Ventana acotada: la cola ya no la vacia un consumidor (eso era una
        // carrera con los demas), asi que se limita por tamaño. MAX_EVENTS es
        // holgado — un patch trae unos pocos eventos y todos los consumidores
        // corren sincronicamente en la misma notificacion.
        events: [...prev.events, ...events].slice(-MAX_EVENTS),
        eventSeq: prev.eventSeq + events.length,
      };
    }),

  applyRoom: (room) => set({ room }),
  setConnection: (connection) => set({ connection }),
  /**
   * Guarda el error para mostrarlo, salvo los que no merecen alarmar.
   *
   * `STALE_COMMAND` es el caso concreto: el servidor lo detecta, **lo resuelve
   * solo** reenviando el estado fresco, y recien despues manda el ack fallido.
   * Un cartel rojo por algo que el sistema acaba de arreglar deja al jugador
   * viendo su mesa actualizarse y un error al mismo tiempo.
   *
   * El `message` del servidor NO se muestra —expone estado interno del motor—
   * pero sirve para depurar, asi que va a la consola.
   */
  setError: (error) => {
    if (!error) return set({ lastError: null });
    if (import.meta.env.DEV) console.warn(`[${error.code}]`, error.message);
    if (!shouldShowError(error.code)) return;
    set({ lastError: { ...error, at: Date.now() } });
  },

  reset: () => set({ ...initial }),
}));
