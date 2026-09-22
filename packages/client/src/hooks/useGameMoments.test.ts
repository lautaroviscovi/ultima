import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Card, GameEvent, RedactedGameState } from '@uno/engine';
import { useGameStore } from '../stores/game.js';
import { useGameMoments } from './useGameMoments.js';

/**
 * Lo que estos tests protegen es EL RIESGO #1 del rediseño.
 *
 * La carta que vuela del mazo a la mano ya esta en la mano cuando empieza la
 * animacion. Si el nodo que vuela usara `card.id` como `layoutId`, habria dos
 * nodos montados con el mismo id y Framer los trataria como el mismo elemento:
 * el sintoma es una carta saltando desde la esquina superior izquierda.
 *
 * El `key` distinto es la mitigacion, asi que vale un test que falle si
 * alguien "simplifica" volviendo a usar el id de la carta.
 */

const card = (id: string): Card => ({ id, kind: 'number', color: 'red', value: 5 });

function stateWith(youId: string, version: number): RedactedGameState {
  return {
    version,
    round: 0,
    you: { id: youId, hand: [] },
    players: [],
    discardTop: null,
    activeColor: 'red',
    drawPileCount: 50,
    currentPlayerId: youId,
    direction: 1,
    phase: 'playing',
    pendingDraw: 0,
    drawnCardId: null,
    unoWindow: null,
    turnDeadline: null,
  } as unknown as RedactedGameState;
}

/**
 * Empuja un patch al store igual que lo haria el listener del socket.
 *
 * La version TIENE que crecer: `applyPatch` descarta a proposito los patches
 * cuya version no aumenta, porque tras una reconexion puede llegar uno viejo
 * que pisaria el sync fresco. Reusar la misma version hacia que el segundo
 * patch de un test se descartara en silencio.
 */
let version = 0;
function emit(youId: string, events: GameEvent[]): void {
  act(() => {
    useGameStore.getState().applyPatch(stateWith(youId, ++version), events);
  });
}

afterEach(() => {
  act(() => useGameStore.getState().reset());
  version = 0;
  vi.useRealTimers();
});

describe('useGameMoments', () => {
  it('EL RIESGO #1: la clave del vuelo NUNCA es el id de la carta', () => {
    const { result } = renderHook(() => useGameMoments());
    emit('me', [{ type: 'CARDS_DRAWN', playerId: 'me', count: 1, cards: [card('r5c1')] }]);

    expect(result.current.flights).toHaveLength(1);
    const flight = result.current.flights[0]!;
    // Si esto falla, la animacion va a saltar desde la esquina.
    expect(flight.key).not.toBe('r5c1');
    expect(flight.key).toContain('r5c1');
    // La carta SI es la real: se anima con datos, no con un placeholder.
    expect(flight.card.id).toBe('r5c1');
  });

  it('no anima lo que roba OTRO jugador', () => {
    const { result } = renderHook(() => useGameMoments());
    // El gateway ya borra `cards` para los demas, pero el hook no debe
    // depender solo de eso: filtra por playerId tambien.
    emit('me', [{ type: 'CARDS_DRAWN', playerId: 'rival', count: 1, cards: [card('r5c1')] }]);
    expect(result.current.flights).toHaveLength(0);
  });

  it('sin `cards` no inventa nada', () => {
    const { result } = renderHook(() => useGameMoments());
    emit('me', [{ type: 'CARDS_DRAWN', playerId: 'me', count: 2 }]);
    expect(result.current.flights).toHaveLength(0);
  });

  it('un +4 produce cuatro vuelos escalonados y con claves distintas', () => {
    const { result } = renderHook(() => useGameMoments());
    const cards = ['a', 'b', 'c', 'd'].map(card);
    emit('me', [{ type: 'CARDS_DRAWN', playerId: 'me', count: 4, cards }]);

    expect(result.current.flights).toHaveLength(4);
    const keys = new Set(result.current.flights.map((f) => f.key));
    expect(keys.size, 'claves duplicadas romperian AnimatePresence').toBe(4);
    expect(result.current.flights.map((f) => f.index)).toEqual([0, 1, 2, 3]);
  });

  it('marca castigo solo cuando roban MAS de una carta', () => {
    const { result } = renderHook(() => useGameMoments());

    emit('me', [{ type: 'CARDS_DRAWN', playerId: 'me', count: 1, cards: [card('x')] }]);
    expect(result.current.penalty, 'robar por turno no es castigo').toBe(0);

    emit('me', [{ type: 'CARDS_DRAWN', playerId: 'me', count: 2, cards: [card('y'), card('z')] }]);
    expect(result.current.penalty).toBe(2);
  });

  it('los vuelos se limpian solos: la lista no crece toda la partida', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameMoments());
    emit('me', [{ type: 'CARDS_DRAWN', playerId: 'me', count: 1, cards: [card('r5c1')] }]);
    expect(result.current.flights).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.flights).toHaveLength(0);
  });

  /**
   * LA CARRERA, que costo encontrar y era desconcertante: el SONIDO del robo
   * se oia perfectamente pero la carta NUNCA volaba.
   *
   * La causa: los tres consumidores (log, sonido, animaciones) compartian una
   * cola que el log vaciaba con `drainEvents()`. El que corriera despues veia
   * una cola vacia, y quien corriera primero lo decidia el orden en que los
   * hooks se llaman en el componente. Medido en el navegador: las 10
   * notificaciones llegaban con `events.length === 0`.
   *
   * Ahora cada consumidor lleva su marca contra `eventSeq`, que solo crece.
   * Este test simula un segundo consumidor leyendo primero.
   */
  it('EL BUG: dos consumidores independientes ven los MISMOS eventos', () => {
    const { result } = renderHook(() => useGameMoments());
    const visto: string[] = [];
    const otro = useGameStore.subscribe((s) => {
      for (const e of s.events) visto.push(e.type);
    });

    emit('me', [{ type: 'CARDS_DRAWN', playerId: 'me', count: 1, cards: [card('r5c1')] }]);
    otro();

    // Los dos vieron el evento: ninguno se lo comio al otro.
    expect(visto).toContain('CARDS_DRAWN');
    expect(result.current.flights).toHaveLength(1);
  });

  /**
   * Un `state:sync` (reconexion, F5) VACIA la cola: el estado nuevo es un punto
   * de partida, no un diff. Si un consumidor quedo con la marca atrasada, su
   * `pending` seria mayor que los eventos disponibles y terminaria leyendo
   * eventos VIEJOS de la ventana — animando un robo que ya paso.
   */
  it('un sync no hace reprocesar eventos viejos', () => {
    const { result } = renderHook(() => useGameMoments());

    emit('me', [{ type: 'CARDS_DRAWN', playerId: 'me', count: 1, cards: [card('viejo')] }]);
    expect(result.current.flights).toHaveLength(1);

    act(() => {
      // Reconexion: llega un sync que limpia la cola.
      useGameStore.getState().applySync(stateWith('me', ++version));
    });

    // Un patch posterior SIN robos no debe revivir el vuelo anterior.
    emit('me', [{ type: 'TURN_CHANGED', playerId: 'me' }]);
    const ids = result.current.flights.map((f) => f.card.id);
    expect(ids.filter((id) => id === 'viejo')).toHaveLength(1);
  });

  it('dos robos de la MISMA carta no colisionan de clave', () => {
    // Pasa tras un rebarajado: la carta vuelve al mazo y se roba otra vez.
    vi.useFakeTimers();
    const { result } = renderHook(() => useGameMoments());

    emit('me', [{ type: 'CARDS_DRAWN', playerId: 'me', count: 1, cards: [card('r5c1')] }]);
    const first = result.current.flights[0]!.key;

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    emit('me', [{ type: 'CARDS_DRAWN', playerId: 'me', count: 1, cards: [card('r5c1')] }]);

    expect(result.current.flights).toHaveLength(1);
    expect(result.current.flights[0]!.key).not.toBe(first);
  });
});
