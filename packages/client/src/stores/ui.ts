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

  openColorPicker(cardId: CardId): void;
  closeColorPicker(): void;
  markInFlight(cardId: CardId): void;
  unmarkInFlight(cardId: CardId): void;
  setSortMode(mode: HandSortMode): void;
  toggleSound(): void;
  reset(): void;
}

const initial = {
  pendingWildCardId: null,
  colorPickerOpen: false,
  cardsInFlight: new Set<CardId>(),
  handSortMode: 'draw' as HandSortMode,
  soundEnabled: true,
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

  reset: () => set({ ...initial, cardsInFlight: new Set() }),
}));
