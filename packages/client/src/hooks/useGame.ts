import { useMemo } from 'react';
import { getPlayableCards, type Card, type CardId } from '@uno/engine';
import { useGameStore } from '../stores/game.js';
import { useUIStore, type HandSortMode } from '../stores/ui.js';

const EMPTY = new Set<CardId>();

/**
 * Selectores derivados. Los componentes NUNCA escriben una comparacion de
 * reglas: cada `card.color === activeColor` dentro de un .tsx es un bug
 * esperando a que el servidor discrepe.
 *
 * El memo va por `version`, no por identidad del objeto: el patch reemplaza el
 * estado entero, asi que memoizar por identidad recalcularia siempre.
 */
export function usePlayableCards(): Set<CardId> {
  const state = useGameStore((s) => s.state);
  const version = state?.version;

  return useMemo(() => {
    if (!state) return EMPTY;
    if (state.currentPlayerId !== state.you.id) return EMPTY;
    if (state.phase !== 'awaiting_turn' && state.phase !== 'card_drawn') return EMPTY;

    // En card_drawn solo se puede jugar la carta recien robada.
    if (state.phase === 'card_drawn') {
      return state.drawnCardId ? new Set([state.drawnCardId]) : EMPTY;
    }
    return new Set(
      getPlayableCards(state.you.hand, state.activeColor, state.discardTop).map((c) => c.id),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
}

export function useIsMyTurn(): boolean {
  return useGameStore((s) => s.state !== null && s.state.currentPlayerId === s.state.you.id);
}

export function useMe() {
  return useGameStore((s) =>
    s.state ? (s.state.players.find((p) => p.id === s.state!.you.id) ?? null) : null,
  );
}

/** Los otros jugadores, en orden de turno y empezando por el siguiente a vos. */
export function useOpponents() {
  const state = useGameStore((s) => s.state);
  const version = state?.version;

  return useMemo(() => {
    if (!state) return [];
    const players = [...state.players].sort((a, b) => a.seat - b.seat);
    const myIndex = players.findIndex((p) => p.id === state.you.id);
    if (myIndex < 0) return players;

    // Rotamos para que vos seas el origen: asi "el siguiente" es espacialmente
    // predecible y la direccion de juego se lee sin pensarla.
    const rotated = [...players.slice(myIndex + 1), ...players.slice(0, myIndex)];
    return state.direction === 1 ? rotated : rotated.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
}

/** Mano ordenada segun la preferencia local. Puramente visual. */
export function useSortedHand(): Card[] {
  const hand = useGameStore((s) => s.state?.you.hand);
  const mode = useUIStore((s) => s.handSortMode);

  return useMemo(() => {
    if (!hand) return [];
    if (mode === 'draw') return hand;

    const colorRank: Record<string, number> = { red: 0, yellow: 1, green: 2, blue: 3 };
    const kindRank: Record<string, number> = {
      number: 0,
      skip: 1,
      reverse: 2,
      draw2: 3,
      wild: 4,
      wild4: 5,
    };

    return [...hand].sort((a, b) => {
      const ac = 'color' in a ? colorRank[a.color]! : 9;
      const bc = 'color' in b ? colorRank[b.color]! : 9;
      const av = a.kind === 'number' ? a.value : 10 + kindRank[a.kind]!;
      const bv = b.kind === 'number' ? b.value : 10 + kindRank[b.kind]!;
      return mode === 'color' ? ac - bc || av - bv : av - bv || ac - bc;
    });
  }, [hand, mode]);
}

export function useSortMode(): [HandSortMode, (mode: HandSortMode) => void] {
  return [useUIStore((s) => s.handSortMode), useUIStore((s) => s.setSortMode)];
}

export function useConnection() {
  return useGameStore((s) => s.connection);
}
