import { create } from 'zustand';
import type { CardId } from '@uno/engine';

export type HandSortMode = 'draw' | 'color' | 'value';

/**
 * Estado puramente local. Muere con el refresh y el servidor ni se entera.
 *
 * Separado del store de juego porque los suscriptores son distintos: un asiento
 * no debe re-renderizar porque abriste el color picker.
 */
export interface UIState {
  /** Carta wild esperando que elijas color antes de mandarla. */
  pendingWildCardId: CardId | null;
  colorPickerOpen: boolean;
  /**
   * Optimismo VISUAL: la carta empieza a volar al hacer click. El estado
   * autoritativo no cambia hasta que llega el patch; si el server rechaza,
   * se saca de aca y la carta vuelve.
   */
  cardsInFlight: Set<CardId>;
  handSortMode: HandSortMode;
  soundEnabled: boolean;
  /**
   * Tocaste ¡ÚLTIMA! y todavia no jugaste.
   *
   * Existe porque cantar y jugar son DOS acciones del jugador que viajan en UN
   * solo comando: `declareUno` va junto con la jugada para que no haya una
   * carrera de red donde cantas legitimamente y el paquete llega tarde.
   *
   * Antes esto se derivaba de `hand.length === 2`, o sea que el cliente
   * cantaba SOLO. Como el engine solo abre la ventana de acusacion si NO
   * cantaste, esa ventana no se abria nunca y acusar era imposible.
   */
  unoArmed: boolean;

  openColorPicker(cardId: CardId): void;
  closeColorPicker(): void;
  markInFlight(cardId: CardId): void;
  unmarkInFlight(cardId: CardId): void;
  setSortMode(mode: HandSortMode): void;
  toggleSound(): void;
  armUno(): void;
  disarmUno(): void;
  reset(): void;
}

const initial = {
  pendingWildCardId: null,
  colorPickerOpen: false,
  cardsInFlight: new Set<CardId>(),
  handSortMode: 'draw' as HandSortMode,
  soundEnabled: true,
  unoArmed: false,
};

export const useUIStore = create<UIState>()((set) => ({
  ...initial,

  openColorPicker: (cardId) => set({ colorPickerOpen: true, pendingWildCardId: cardId }),
  closeColorPicker: () => set({ colorPickerOpen: false, pendingWildCardId: null }),

  markInFlight: (cardId) =>
    set((state) => ({ cardsInFlight: new Set(state.cardsInFlight).add(cardId) })),

  unmarkInFlight: (cardId) =>
    set((state) => {
      const next = new Set(state.cardsInFlight);
      next.delete(cardId);
      return { cardsInFlight: next };
    }),

  setSortMode: (handSortMode) => set({ handSortMode }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

  armUno: () => set({ unoArmed: true }),
  /** Se desarma al jugar (ya viajo) y al quedar fuera de la ventana. */
  disarmUno: () => set({ unoArmed: false }),

  reset: () => set({ ...initial, cardsInFlight: new Set() }),
}));
