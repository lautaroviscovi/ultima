import { describe, expect, it } from 'vitest';
import { createGame, disposeGame, reduce } from './game.js';
import { redact } from './state.js';
import type { GameState } from './state.js';
import { getPlayableCards } from './rules.js';
import type { CardId } from './types.js';

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nickname: `J${i}` }));
}

/** Todos los CardId que aparecen en cualquier parte de un payload serializado. */
function cardIdsIn(payload: unknown): Set<CardId> {
  const found = new Set<CardId>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      if (typeof obj['id'] === 'string' && typeof obj['kind'] === 'string') {
        found.add(obj['id'] as CardId);
      }
      Object.values(obj).forEach(walk);
    }
  };
  walk(payload);
  return found;
}

describe('redact', () => {
  it('le da a cada jugador su propia mano completa', () => {
    const { state } = createGame({ roomId: 'R', seed: 's', players: players(4), now: 0 });
    for (const p of state.players) {
      const view = redact(state, p.id);
      expect(view.you.hand.map((c) => c.id)).toEqual(p.hand.map((c) => c.id));
    }
    disposeGame(state);
  });

  it('expone SOLO el conteo de las manos ajenas', () => {
    const { state } = createGame({ roomId: 'R', seed: 's2', players: players(4), now: 0 });
    const view = redact(state, 'p0');
    for (const p of view.players) {
      expect(p.cardCount).toBe(state.players.find((q) => q.id === p.id)!.hand.length);
      expect(p).not.toHaveProperty('hand');
    }
    disposeGame(state);
  });

  it('nunca expone el contenido ni el ORDEN del mazo', () => {
    // Mandar el orden del mazo es tan grave como mandar las manos: dice que va
    // a robar cada uno.
    const { state } = createGame({ roomId: 'R', seed: 's3', players: players(4), now: 0 });
    const view = redact(state, 'p0');
    expect(view.drawPileCount).toBe(state.drawPile.length);
    expect(view).not.toHaveProperty('drawPile');
    expect(JSON.stringify(view)).not.toContain(state.drawPile[0]!.id);
    disposeGame(state);
  });

  it('falla explicito si el espectador no esta en la partida', () => {
    const { state } = createGame({ roomId: 'R', seed: 's4', players: players(2), now: 0 });
    expect(() => redact(state, 'intruso')).toThrow();
    disposeGame(state);
  });

  /**
   * LA GUARDIA DE SEGURIDAD PERMANENTE.
   *
   * Simula partidas completas de 10 jugadores y verifica que ningun CardId
   * ajeno aparezca JAMAS en el payload que recibe cada jugador. Es barato y
   * cubre para siempre contra la regresion de "ah, agrego este campito".
   */
  it('en una partida completa de 10 jugadores nunca filtra una carta ajena', () => {
    for (const seed of ['leak-a', 'leak-b', 'leak-c']) {
      let { state } = createGame({ roomId: 'R', seed, players: players(10), now: 0 });

      for (let turn = 0; turn < 400; turn++) {
        // En cada paso, auditamos lo que ve CADA jugador.
        for (const viewer of state.players) {
          const view = redact(state, viewer.id);
          const visible = cardIdsIn(view);

          const own = new Set(viewer.hand.map((c) => c.id));
          const discard = new Set(state.discardPile.map((c) => c.id));

          for (const id of visible) {
            const legit = own.has(id) || discard.has(id);
            expect(legit, `seed=${seed} turno=${turn}: ${viewer.id} vio la carta ajena ${id}`).toBe(
              true,
            );
          }
        }

        if (state.phase === 'game_over' || state.phase === 'round_over') break;
        state = step(state, turn);
      }
      disposeGame(state);
    }
  });
});

/** Un movimiento legal cualquiera, para avanzar la simulacion. */
function step(state: GameState, turn: number): GameState {
  const player = state.players[state.currentPlayerIndex];
  if (!player) return state;
  const ctx = { playerId: player.id, now: turn * 1000 };

  if (state.phase === 'choosing_color') {
    return reduce(state, { type: 'CHOOSE_COLOR', color: 'red' }, ctx).state;
  }
  if (state.phase === 'card_drawn') {
    return reduce(state, { type: 'PASS' }, ctx).state;
  }

  const top = state.discardPile.at(-1) ?? null;
  const playable = getPlayableCards(player.hand, state.activeColor, top, state.pendingDraw);
  const card = playable[0];
  if (card) {
    return reduce(
      state,
      { type: 'PLAY_CARD', cardId: card.id, chosenColor: 'red', declareUno: true },
      ctx,
    ).state;
  }
  return reduce(state, { type: 'DRAW_CARD' }, ctx).state;
}
