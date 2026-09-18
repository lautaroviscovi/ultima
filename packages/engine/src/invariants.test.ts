import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DECK_SIZE } from './deck.js';
import { createGame, disposeGame, reduce } from './game.js';
import { getPlayableCards } from './rules.js';
import type { GameState } from './state.js';
import type { Rng } from './rng.js';
import { createRng } from './rng.js';

/**
 * Invariantes sobre partidas aleatorias. Es donde aparecen los bugs que los
 * tests escritos a mano no encuentran, porque uno testea lo que se le ocurre.
 * Con el RNG seedeado, cualquier fallo es reproducible desde su seed.
 */

function totalCards(state: GameState): number {
  return (
    state.drawPile.length +
    state.discardPile.length +
    state.players.reduce((s, p) => s + p.hand.length, 0)
  );
}

function allCardIds(state: GameState): string[] {
  return [
    ...state.drawPile.map((c) => c.id),
    ...state.discardPile.map((c) => c.id),
    ...state.players.flatMap((p) => p.hand.map((c) => c.id)),
  ];
}

/** Un bot que juega legal al azar. */
function randomStep(state: GameState, rng: Rng, turn: number): GameState {
  const player = state.players[state.currentPlayerIndex];
  if (!player) return state;
  const ctx = { playerId: player.id, now: turn * 1000 };

  if (state.phase === 'choosing_color') {
    const colors = ['red', 'yellow', 'green', 'blue'] as const;
    return reduce(state, { type: 'CHOOSE_COLOR', color: rng.pick(colors) }, ctx).state;
  }
  if (state.phase === 'card_drawn') {
    const card = player.hand.find((c) => c.id === state.drawnCardId);
    const top = state.discardPile.at(-1) ?? null;
    if (card && rng.nextInt(2) === 0 && getPlayableCards([card], state.activeColor, top).length) {
      return reduce(state, { type: 'PLAY_DRAWN_CARD', chosenColor: 'red', declareUno: true }, ctx)
        .state;
    }
    return reduce(state, { type: 'PASS' }, ctx).state;
  }

  const top = state.discardPile.at(-1) ?? null;
  const playable = getPlayableCards(player.hand, state.activeColor, top);
  if (playable.length > 0) {
    const card = rng.pick(playable);
    return reduce(
      state,
      {
        type: 'PLAY_CARD',
        cardId: card.id,
        chosenColor: rng.pick(['red', 'blue'] as const),
        declareUno: true,
      },
      ctx,
    ).state;
  }
  return reduce(state, { type: 'DRAW_CARD' }, ctx).state;
}

interface SimResult {
  state: GameState;
  turns: number;
  finished: boolean;
}

function simulate(seed: string, playerCount: number, maxTurns = 3000): SimResult {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i}`,
    nickname: `J${i}`,
  }));
  let { state } = createGame({ roomId: 'R', seed, players, options: { targetScore: 500 }, now: 0 });
  const rng = createRng(`bot-${seed}`);

  let turns = 0;
  for (; turns < maxTurns; turns++) {
    if (state.phase === 'round_over' || state.phase === 'game_over') break;

    // Invariantes duras, chequeadas en CADA paso.
    expect(totalCards(state), `total de cartas en turno ${turns}`).toBe(DECK_SIZE);
    const ids = allCardIds(state);
    expect(new Set(ids).size, `ids duplicados en turno ${turns}`).toBe(ids.length);

    state = randomStep(state, rng, turns);
  }

  const finished = state.phase === 'round_over' || state.phase === 'game_over';
  return { state, turns, finished };
}

describe('invariantes sobre partidas aleatorias', () => {
  it('siempre hay exactamente 108 cartas, y ninguna duplicada', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 2, max: 10 }), (n, p) => {
        const { state } = simulate(`prop-${n}`, p);
        expect(totalCards(state)).toBe(DECK_SIZE);
        disposeGame(state);
      }),
      { numRuns: 60 },
    );
  });

  it('ninguna partida se cuelga: todas terminan la ronda', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 2, max: 10 }), (n, p) => {
        const { finished, turns, state } = simulate(`hang-${n}`, p);
        expect(finished, `seed=hang-${n} jugadores=${p} turnos=${turns}`).toBe(true);
        disposeGame(state);
      }),
      { numRuns: 60 },
    );
  });

  it('el jugador de turno siempre tiene una accion legal', () => {
    // Si no puede jugar, siempre puede robar; si el mazo se agoto, pasa.
    // Nunca debe quedar sin ninguna opcion.
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5_000 }), (n) => {
        const seed = `legal-${n}`;
        const players = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, nickname: `J${i}` }));
        let { state } = createGame({ roomId: 'R', seed, players, now: 0 });
        const rng = createRng(`bot-${seed}`);

        for (let t = 0; t < 300; t++) {
          if (state.phase === 'round_over' || state.phase === 'game_over') break;
          const player = state.players[state.currentPlayerIndex];
          expect(player, 'siempre hay un jugador de turno').toBeDefined();
          expect(player!.abandoned, 'el jugador de turno nunca esta abandonado').toBe(false);
          state = randomStep(state, rng, t);
        }
        disposeGame(state);
      }),
      { numRuns: 40 },
    );
  });

  it('los puntajes nunca son negativos y solo suben', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5_000 }), (n) => {
        const { state } = simulate(`score-${n}`, 5);
        for (const p of state.players) expect(p.score).toBeGreaterThanOrEqual(0);
        disposeGame(state);
      }),
      { numRuns: 40 },
    );
  });

  it('con 10 jugadores el reparto deja 108 - 70 - 1 en el mazo', () => {
    const { state } = createGame({
      roomId: 'R',
      seed: 'reparto-10',
      players: Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, nickname: `J${i}` })),
      now: 0,
    });
    // 70 repartidas + 1 en el descarte. El resto en el mazo, salvo que la
    // inicial haya sido un draw2 (que roba 2 mas).
    expect(state.drawPile.length + state.discardPile.length).toBe(
      DECK_SIZE - 70 - (state.players[0]!.hand.length - 7),
    );
    disposeGame(state);
  });
});
