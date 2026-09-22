import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Identidad. El UNICO store que se persiste.
 *
 * El playerToken ES la credencial del asiento: no hay login. Guardarlo permite
 * reclamar el asiento tras un refresh o una caida de red.
 *
 * El estado de juego NO se persiste nunca: guardarlo en localStorage seria el
 * mismo error de confianza que mandarlo completo por el cable.
 */
export interface SessionState {
  nickname: string;
  /** Una sesion por sala: podes tener partidas distintas en pestañas distintas. */
  sessions: Record<string, { playerToken: string; playerId: string }>;

  setNickname(nickname: string): void;
  remember(roomId: string, playerToken: string, playerId: string): void;
  forget(roomId: string): void;
  sessionFor(roomId: string): { playerToken: string; playerId: string } | undefined;
  /** La última sala con sesión guardada, para ofrecer "volver a tu partida". */
  lastRoomId(): string | undefined;
}

const NICKNAME_KEY = 'uno:nickname';

function readNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      nickname: readNickname(),
      sessions: {},

      setNickname: (nickname) => {
        /**
         * NO se hace `trim()` aca, y esa es la correccion.
         *
         * `Home.tsx` llama a esto en CADA tecla sobre un input controlado, asi
         * que recortar al guardar borraba el espacio en el momento de
         * escribirlo: tipear "Juan Pérez" era imposible — la barra espaciadora
         * despues de "Juan" desaparecia y la segunda palabra nunca empezaba.
         *
         * El `trim()` correcto es al ENVIAR, y `Home.tsx` ya lo hace. Aca solo
         * se acota el largo.
         */
        const clean = nickname.slice(0, 20);
        // El nombre SI es una preferencia de persona, no de asiento: sobrevive
        // al cierre de la pestaña y se comparte entre pestañas.
        try {
          localStorage.setItem(NICKNAME_KEY, clean);
        } catch {
          // Modo privado o storage bloqueado: seguimos igual, solo se pierde
          // la comodidad de recordarlo.
        }
        set({ nickname: clean });
      },

      remember: (roomId, playerToken, playerId) =>
        set((state) => ({
          sessions: { ...state.sessions, [roomId]: { playerToken, playerId } },
        })),

      forget: (roomId) =>
        set((state) => {
          const { [roomId]: _gone, ...rest } = state.sessions;
          return { sessions: rest };
        }),

      sessionFor: (roomId) => get().sessions[roomId],

      lastRoomId: () => Object.keys(get().sessions).at(-1),
    }),
    {
      name: 'uno:session',
      /**
       * sessionStorage, NO localStorage: es por PESTAÑA.
       *
       * Con localStorage, dos pestañas del mismo navegador comparten la entrada
       * y la segunda pisa el token de la primera; al recargar, la primera
       * reclama el asiento de la segunda y ve su mano. El servidor responde
       * bien — le mandan el token de otro asiento —, el error es del cliente.
       *
       * Con sessionStorage cada pestaña tiene su identidad, y sigue
       * sobreviviendo al F5, que es lo que la reconexion necesita. El costo
       * asumido: cerrar la pestaña pierde la sesion. Es el trade-off correcto,
       * porque perder el asiento al cerrar es recuperable (te volves a unir) y
       * robarle el asiento a otro no lo es.
       */
      storage: createJSONStorage(() =>
        typeof sessionStorage !== 'undefined' ? sessionStorage : localStorage,
      ),
      // Solo los asientos van a sessionStorage. El nombre se lee de
      // localStorage al crear el store; si lo persistieramos aca tambien, la
      // rehidratacion lo pisaria con el de la pestaña.
      partialize: (state) => ({ sessions: state.sessions }),
    },
  ),
);
