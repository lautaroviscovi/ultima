import { useEffect, useRef, useState } from 'react';
import { cardLabel, type GameEvent, type RedactedGameState } from '@uno/engine';
import { useGameStore } from '../stores/game.js';

export interface LogEntry {
  id: number;
  text: string;
  tone: 'normal' | 'alert' | 'good';
}

const MAX_ENTRIES = 40;

/** Nombre del jugador, o "vos" si sos vos. */
function who(state: RedactedGameState, playerId: string): string {
  if (playerId === state.you.id) return 'Vos';
  return state.players.find((p) => p.id === playerId)?.nickname ?? 'Alguien';
}

/**
 * Traduce un evento a una linea de log. Devuelve null para los eventos que no
 * aportan narracion (los que ya se ven en la mesa).
 */
function describe(event: GameEvent, state: RedactedGameState): Omit<LogEntry, 'id'> | null {
  switch (event.type) {
    case 'CARD_PLAYED': {
      const color = event.chosenColor ? ` y eligió ${event.chosenColor}` : '';
      return {
        text: `${who(state, event.playerId)} jugó ${cardLabel(event.card)}${color}`,
        tone: 'normal',
      };
    }
    case 'CARDS_DRAWN':
      return {
        text: `${who(state, event.playerId)} robó ${event.count} ${event.count === 1 ? 'carta' : 'cartas'}`,
        tone: 'normal',
      };
    case 'PLAYER_SKIPPED':
      return { text: `${who(state, event.playerId)} pierde el turno`, tone: 'normal' };
    case 'DIRECTION_REVERSED':
      return {
        text: `Cambio de sentido: ahora ${event.direction === 1 ? 'horario' : 'antihorario'}`,
        tone: 'alert',
      };
    case 'UNO_DECLARED':
      return { text: `${who(state, event.playerId)} cantó ¡UNO!`, tone: 'good' };
    case 'UNO_PENALTY':
      return {
        text: `${who(state, event.calledBy)} acusó a ${who(state, event.playerId)}: +${event.cardsDrawn}`,
        tone: 'alert',
      };
    case 'DECK_RESHUFFLED':
      return { text: `Se rebarajó el descarte (${event.count} cartas)`, tone: 'normal' };
    case 'PLAYER_TIMED_OUT':
      return { text: `A ${who(state, event.playerId)} se le acabó el tiempo`, tone: 'alert' };
    case 'PLAYER_IDLE':
      return { text: `${who(state, event.playerId)} está ausente, se lo saltea`, tone: 'alert' };
    case 'PLAYER_CONNECTION':
      return {
        text: `${who(state, event.playerId)} se ${event.connected ? 'reconectó' : 'desconectó'}`,
        tone: event.connected ? 'good' : 'alert',
      };
    case 'PLAYER_ABANDONED':
      return { text: `${who(state, event.playerId)} abandonó`, tone: 'alert' };
    case 'ROUND_ENDED':
      return {
        text: `${who(state, event.winnerId)} ganó la ronda: +${event.points}`,
        tone: 'good',
      };
    case 'GAME_ENDED':
      return { text: `${who(state, event.winnerId)} ganó la partida`, tone: 'good' };
    // Estos ya se ven en la mesa: narrarlos seria ruido.
    case 'TURN_CHANGED':
    case 'COLOR_CHOSEN':
    case 'GAME_STARTED':
    case 'CARDS_DEALT':
      return null;
  }
}

/**
 * Log de mesa. Con 9 oponentes las cosas pasan rapido y te perdes que acaba de
 * ocurrir; no es chat, es narracion del juego.
 */
export function useEventLog(): LogEntry[] {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    /**
     * Antes este hook VACIABA la cola con `drainEvents()`, y eso rompia a los
     * demas consumidores: el que corriera despues encontraba la cola vacia.
     * Ahora cada uno lleva su propia marca contra `eventSeq`, que solo crece.
     */
    let seen = useGameStore.getState().eventSeq;

    return useGameStore.subscribe((store) => {
      if (store.eventSeq === seen || !store.state) return;
      const pending = store.eventSeq - seen;
      seen = store.eventSeq;
      const state = store.state;

      const fresh = store.events
        .slice(Math.max(0, store.events.length - pending))
        .map((event) => describe(event, state))
        .filter((entry): entry is Omit<LogEntry, 'id'> => entry !== null)
        .map((entry) => ({ ...entry, id: nextId.current++ }));

      if (fresh.length === 0) return;
      setEntries((prevEntries) => [...prevEntries, ...fresh].slice(-MAX_ENTRIES));
    });
  }, []);

  return entries;
}
