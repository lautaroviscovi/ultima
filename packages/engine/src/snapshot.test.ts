import { describe, expect, it } from 'vitest';
import { createGame, disposeGame, exportRngPosition, reduce, restoreRngPosition } from './game.js';
import { getPlayableCards } from './rules.js';
import type { GameState } from './state.js';

/**
 * Serializar el GameState NO alcanza para reanudar una partida: el Rng vive
 * fuera del estado y volveria a la posicion 0. Estos tests fijan el contrato
 * del snapshot `{ state, rngConsumed }`, del que depende que un Durable Object
 * pueda dormirse a mitad de partida sin romper el replay.
 */

const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, nickname: `J${i}` }));

/** Juega `turns` movimientos legales cualesquiera. */
function play(state: GameState, turns: number, from = 0): GameState {
  let next = state;
  for (let t = 0; t < turns; t++) {
    const player = next.players[next.currentPlayerIndex]!;
    const ctx = { playerId: player.id, now: (from + t) * 1000 };
    if (next.phase === 'choosing_color') {
      next = reduce(next, { type: 'CHOOSE_COLOR', color: 'red' }, ctx).state;
      continue;
    }
    if (next.phase === 'card_drawn') {
      next = reduce(next, { type: 'PASS' }, ctx).state;
      continue;
    }
    if (next.phase !== 'awaiting_turn') break;
    const card = getPlayableCards(
      player.hand,
      next.activeColor,
      next.discardPile.at(-1) ?? null,
    )[0];
    next = reduce(
      next,
      card ? { type: 'PLAY_CARD', cardId: card.id, chosenColor: 'red' } : { type: 'DRAW_CARD' },
      ctx,
    ).state;
  }
  return next;
}

/** Simula guardar a disco y rehidratar en otra instancia. */
function roundTrip(state: GameState): GameState {
  const consumed = exportRngPosition(state);
  const json = JSON.stringify({ state, consumed });
  disposeGame(state); // el proceso muere

  const parsed = JSON.parse(json) as { state: GameState; consumed: number };
  restoreRngPosition(parsed.state, parsed.consumed);
  return parsed.state;
}

describe('snapshot de partida', () => {
  it('el estado sobrevive al round-trip por JSON', () => {
    const { state } = createGame({ roomId: 'R', seed: 'snap-1', players, now: 0 });
    const mid = play(state, 25);
    const before = JSON.stringify(mid);
    const after = roundTrip(mid);
    expect(JSON.stringify(after)).toBe(before);
    disposeGame(after);
  });

  it('LA CLAVE: seguir jugando tras restaurar da el mismo resultado que sin cortar', () => {
    // Sin restaurar la posicion del Rng, este test falla en cuanto haya un
    // reshuffle, un timeout con eleccion de color o un abandono.
    const a = play(createGame({ roomId: 'R', seed: 'snap-2', players, now: 0 }).state, 60);
    disposeGame(a);

    const b = play(createGame({ roomId: 'R', seed: 'snap-2', players, now: 0 }).state, 30);
    const restored = play(roundTrip(b), 30, 30);

    expect(restored.drawPile.map((c) => c.id)).toEqual(a.drawPile.map((c) => c.id));
    expect(restored.players.map((p) => p.hand.map((c) => c.id))).toEqual(
      a.players.map((p) => p.hand.map((c) => c.id)),
    );
    disposeGame(restored);
  });

  it('la posicion del Rng avanza al consumirse', () => {
    const { state } = createGame({ roomId: 'R', seed: 'snap-3', players, now: 0 });
    const initial = exportRngPosition(state);
    expect(initial).toBeGreaterThan(0); // repartir ya consumio

    const later = play(state, 40);
    expect(exportRngPosition(later)).toBeGreaterThanOrEqual(initial);
    disposeGame(later);
  });

  it('un timeout tras restaurar elige el MISMO color', () => {
    // El color por timeout sale del Rng: es el consumo mas facil de divergir.
    const make = () => {
      const { state } = createGame({ roomId: 'R', seed: 'snap-4', players, now: 0 });
      return play(state, 15);
    };
    const direct = reduce(make(), { type: 'TIMEOUT' }, { playerId: null, now: 99_000 });
    disposeGame(direct.state);

    const restored = reduce(
      roundTrip(make()),
      { type: 'TIMEOUT' },
      { playerId: null, now: 99_000 },
    );
    expect(restored.state.activeColor).toBe(direct.state.activeColor);
    expect(restored.state.players.map((p) => p.hand.length)).toEqual(
      direct.state.players.map((p) => p.hand.length),
    );
    disposeGame(restored.state);
  });

  it('rechaza una posicion invalida en vez de restaurar mal', () => {
    const { state } = createGame({ roomId: 'R', seed: 'snap-5', players, now: 0 });
    expect(() => restoreRngPosition(state, -1)).toThrow();
    expect(() => restoreRngPosition(state, 1.5)).toThrow();
    disposeGame(state);
  });
});
