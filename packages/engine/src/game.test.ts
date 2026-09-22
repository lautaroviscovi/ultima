import { describe, expect, it } from 'vitest';
import { createGame, disposeGame, HAND_SIZE, reduce } from './game.js';
import { DECK_SIZE } from './deck.js';
import type { GameState } from './state.js';
import type { Command, GameEvent } from './commands.js';
import { GameError } from './commands.js';
import { makeState, num, colored, wild, wild4 } from './testing/fixtures.js';
import type { Card, PlayerId } from './types.js';

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nickname: `J${i}` }));
}

function newGame(n = 4, seed = 'test', opts = {}) {
  return createGame({ roomId: 'R', seed, players: players(n), options: opts, now: 0 });
}

function current(state: GameState) {
  return state.players[state.currentPlayerIndex]!;
}

function apply(state: GameState, command: Command, playerId: PlayerId | null = null, now = 0) {
  return reduce(state, command, { playerId, now });
}

/** Total de cartas en juego. Debe ser 108 SIEMPRE. */
function totalCards(state: GameState): number {
  return (
    state.drawPile.length +
    state.discardPile.length +
    state.players.reduce((s, p) => s + p.hand.length, 0)
  );
}

describe('createGame', () => {
  it('reparte 7 cartas a cada jugador', () => {
    const { state } = newGame(4);
    for (const p of state.players) expect(p.hand).toHaveLength(HAND_SIZE);
  });

  it('conserva las 108 cartas al repartir', () => {
    for (const n of [2, 4, 7, 10]) {
      const { state } = newGame(n, `seed-${n}`);
      expect(totalCards(state), `${n} jugadores`).toBe(DECK_SIZE);
    }
  });

  it('acepta de 2 a 10 jugadores', () => {
    expect(() => newGame(2)).not.toThrow();
    expect(() => newGame(10)).not.toThrow();
  });

  it('rechaza menos de 2 y mas de 10', () => {
    expect(() => newGame(1)).toThrow(GameError);
    expect(() => newGame(11)).toThrow(GameError);
  });

  it('es determinista: mismo seed, misma reparticion', () => {
    const a = newGame(4, 'igual').state;
    disposeGame(a);
    const b = newGame(4, 'igual').state;
    expect(a.players.map((p) => p.hand.map((c) => c.id))).toEqual(
      b.players.map((p) => p.hand.map((c) => c.id)),
    );
  });

  it('nunca deja un wild4 como carta inicial', () => {
    // El wild4 inicial vuelve al mazo y se re-baraja. Barremos muchos seeds
    // para atravesar el caso, que es el que rompe implementaciones.
    for (let i = 0; i < 300; i++) {
      const { state } = newGame(4, `seed-${i}`);
      expect(state.discardPile.at(-1)!.kind, `seed-${i}`).not.toBe('wild4');
      disposeGame(state);
    }
  });

  it('con carta inicial wild entra en choosing_color', () => {
    for (let i = 0; i < 400; i++) {
      const { state } = newGame(4, `w-${i}`);
      if (state.discardPile.at(-1)!.kind === 'wild') {
        expect(state.phase).toBe('choosing_color');
        return;
      }
      disposeGame(state);
    }
    throw new Error('ningun seed produjo un wild inicial');
  });
});

describe('carta inicial con efecto', () => {
  it('skip inicial saltea al primer jugador', () => {
    for (let i = 0; i < 400; i++) {
      const { state } = newGame(4, `s-${i}`);
      if (state.discardPile.at(-1)!.kind === 'skip') {
        expect(state.currentPlayerIndex).toBe(1);
        return;
      }
      disposeGame(state);
    }
    throw new Error('ningun seed produjo un skip inicial');
  });

  it('reverse inicial invierte la direccion Y cambia quien empieza', () => {
    for (let i = 0; i < 400; i++) {
      const { state } = newGame(4, `r-${i}`);
      if (state.discardPile.at(-1)!.kind === 'reverse') {
        expect(state.direction).toBe(-1);
        // El error comun es invertir la direccion pero dejar que empiece el 0.
        expect(state.currentPlayerIndex).toBe(3);
        return;
      }
      disposeGame(state);
    }
    throw new Error('ningun seed produjo un reverse inicial');
  });

  it('draw2 inicial hace robar 2 al primero y lo saltea', () => {
    for (let i = 0; i < 400; i++) {
      const { state } = newGame(4, `d-${i}`);
      if (state.discardPile.at(-1)!.kind === 'draw2') {
        expect(state.players[0]!.hand).toHaveLength(HAND_SIZE + 2);
        expect(state.currentPlayerIndex).toBe(1);
        expect(totalCards(state)).toBe(DECK_SIZE);
        return;
      }
      disposeGame(state);
    }
    throw new Error('ningun seed produjo un draw2 inicial');
  });
});

describe('jugar cartas', () => {
  function gameWith(hand: Card[], top: Card, playerCount = 4): GameState {
    const hands = Array.from({ length: playerCount }, (_, i) =>
      i === 0 ? hand : [num('blue', 1)],
    );
    // Mazo con cartas suficientes: sin esto un +2/+4 no tiene de donde robar
    // y el test pasaria por la rama de "mazo agotado" sin ejercitar el efecto.
    const drawPile = Array.from({ length: 20 }, () => num('green', 7));
    return makeState({ hands, drawPile, discardPile: [top], activeColor: 'red' });
  }

  it('mueve la carta de la mano al descarte', () => {
    const card = num('red', 5);
    const state = gameWith([card, num('blue', 9)], num('red', 3));
    const { state: next } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    expect(next.players[0]!.hand.map((c) => c.id)).not.toContain(card.id);
    expect(next.discardPile.at(-1)!.id).toBe(card.id);
  });

  it('rechaza jugar fuera de turno', () => {
    const card = num('red', 5);
    const state = gameWith([card], num('red', 3));
    expect(() => apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p1')).toThrow(
      /No es tu turno/,
    );
  });

  it('rechaza una carta que no esta en la mano', () => {
    const state = gameWith([num('red', 5)], num('red', 3));
    expect(() => apply(state, { type: 'PLAY_CARD', cardId: 'inexistente' }, 'p0')).toThrow(
      GameError,
    );
  });

  it('rechaza una carta no jugable', () => {
    const card = num('blue', 9);
    const state = gameWith([card], num('red', 3));
    expect(() => apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0')).toThrow(
      /no es jugable/,
    );
  });

  it('una accion ilegal no muta el estado', () => {
    const card = num('blue', 9);
    const state = gameWith([card], num('red', 3));
    const before = JSON.stringify(state);
    expect(() => apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0')).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });

  it('skip saltea al siguiente', () => {
    const card = colored('skip', 'red');
    const state = gameWith([card, num('red', 1)], num('red', 3));
    const { state: next } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    expect(current(next).id).toBe('p2');
  });

  it('draw2 hace robar 2 al siguiente y lo saltea', () => {
    const card = colored('draw2', 'red');
    const state = gameWith([card, num('red', 1)], num('red', 3));
    const before = state.players[1]!.hand.length;
    const { state: next } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    expect(next.players[1]!.hand).toHaveLength(before + 2);
    expect(current(next).id).toBe('p2');
  });

  it('wild4 hace robar 4 al siguiente y lo saltea', () => {
    const card = wild4();
    const state = gameWith([card, num('red', 1)], num('red', 3));
    const before = state.players[1]!.hand.length;
    const { state: next } = apply(
      state,
      { type: 'PLAY_CARD', cardId: card.id, chosenColor: 'green' },
      'p0',
    );
    expect(next.players[1]!.hand).toHaveLength(before + 4);
    expect(next.activeColor).toBe('green');
    expect(current(next).id).toBe('p2');
  });

  it('el wild sin color entra en choosing_color', () => {
    const card = wild();
    const state = gameWith([card, num('red', 1)], num('red', 3));
    const { state: next } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    expect(next.phase).toBe('choosing_color');
    expect(current(next).id).toBe('p0');
  });

  it('CHOOSE_COLOR fija el color y pasa el turno', () => {
    const card = wild();
    const state = gameWith([card, num('red', 1)], num('red', 3));
    const { state: mid } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    const { state: next } = apply(mid, { type: 'CHOOSE_COLOR', color: 'blue' }, 'p0');
    expect(next.activeColor).toBe('blue');
    expect(next.phase).toBe('awaiting_turn');
    expect(current(next).id).toBe('p1');
  });

  it('el +4 es jugable sobre cualquier cosa (v1 permisivo)', () => {
    const card = wild4();
    // Tiene el color activo en la mano y aun asi puede jugar el +4.
    const state = gameWith([card, num('red', 7)], num('red', 3));
    expect(() =>
      apply(state, { type: 'PLAY_CARD', cardId: card.id, chosenColor: 'blue' }, 'p0'),
    ).not.toThrow();
  });
});

describe('reverse', () => {
  it('invierte la direccion con 3+ jugadores', () => {
    const card = colored('reverse', 'red');
    const hands = [[card, num('red', 1)], [num('blue', 1)], [num('blue', 2)], [num('blue', 3)]];
    const state = makeState({ hands, discardPile: [num('red', 3)], activeColor: 'red' });
    const { state: next } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    expect(next.direction).toBe(-1);
    expect(current(next).id).toBe('p3');
  });

  it('CASO BORDE: con 2 jugadores actua como skip', () => {
    // Sale "por accidente" de la aritmetica de nextPlayerIndex. Este test existe
    // justamente porque es accidental y se romperia en silencio.
    const card = colored('reverse', 'red');
    const hands = [[card, num('red', 1)], [num('blue', 1)]];
    const state = makeState({ hands, discardPile: [num('red', 3)], activeColor: 'red' });
    const { state: next } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    expect(current(next).id).toBe('p0');
  });
});

describe('robar', () => {
  it('roba una sola carta', () => {
    const state = makeState({
      hands: [[num('blue', 9)], [num('blue', 1)]],
      drawPile: [num('green', 4), num('green', 5)],
      discardPile: [num('red', 3)],
    });
    const { state: next } = apply(state, { type: 'DRAW_CARD' }, 'p0');
    expect(next.players[0]!.hand).toHaveLength(2);
  });

  it('si la robada es jugable, entra en card_drawn', () => {
    const state = makeState({
      hands: [[num('blue', 9)], [num('blue', 1)]],
      drawPile: [num('red', 4)],
      discardPile: [num('red', 3)],
    });
    const { state: next } = apply(state, { type: 'DRAW_CARD' }, 'p0');
    expect(next.phase).toBe('card_drawn');
    expect(current(next).id).toBe('p0');
  });

  it('si no es jugable, pasa el turno solo', () => {
    const state = makeState({
      hands: [[num('blue', 9)], [num('blue', 1)]],
      drawPile: [num('green', 4)],
      discardPile: [num('red', 3)],
    });
    const { state: next } = apply(state, { type: 'DRAW_CARD' }, 'p0');
    expect(next.phase).toBe('awaiting_turn');
    expect(current(next).id).toBe('p1');
  });

  it('PASS despues de robar cede el turno', () => {
    const state = makeState({
      hands: [[num('blue', 9)], [num('blue', 1)]],
      drawPile: [num('red', 4)],
      discardPile: [num('red', 3)],
    });
    const { state: drawn } = apply(state, { type: 'DRAW_CARD' }, 'p0');
    const { state: next } = apply(drawn, { type: 'PASS' }, 'p0');
    expect(current(next).id).toBe('p1');
  });

  it('PLAY_DRAWN_CARD juega la carta recien robada', () => {
    const state = makeState({
      hands: [[num('blue', 9)], [num('blue', 1)]],
      drawPile: [num('red', 4)],
      discardPile: [num('red', 3)],
    });
    const { state: drawn } = apply(state, { type: 'DRAW_CARD' }, 'p0');
    const { state: next } = apply(drawn, { type: 'PLAY_DRAWN_CARD' }, 'p0');
    expect(next.discardPile.at(-1)!.kind).toBe('number');
    expect(next.players[0]!.hand).toHaveLength(1);
  });
});

describe('reshuffle del descarte', () => {
  it('re-baraja cuando el mazo se vacia', () => {
    const state = makeState({
      hands: [[num('blue', 9)], [num('blue', 1)]],
      drawPile: [],
      discardPile: [num('red', 1), num('red', 2), num('red', 3)],
    });
    const { state: next, events } = apply(state, { type: 'DRAW_CARD' }, 'p0');
    expect(next.players[0]!.hand).toHaveLength(2);
    // El tope se conserva, el resto vuelve al mazo (menos la que se robo).
    expect(next.discardPile).toHaveLength(1);
    expect(events.some((e: GameEvent) => e.type === 'DECK_RESHUFFLED')).toBe(true);
  });

  it('CASO BORDE: con descarte de 1 carta y mazo vacio no rompe', () => {
    const state = makeState({
      hands: [[num('blue', 9)], [num('blue', 1)]],
      drawPile: [],
      discardPile: [num('red', 3)],
    });
    const { state: next } = apply(state, { type: 'DRAW_CARD' }, 'p0');
    // No habia nada que barajar: no roba y pasa, sin lanzar.
    expect(next.players[0]!.hand).toHaveLength(1);
    expect(current(next).id).toBe('p1');
  });
});

describe('fin de ronda', () => {
  it('gana quien se queda sin cartas', () => {
    const card = num('red', 5);
    const state = makeState({ hands: [[card], [num('blue', 1)]], discardPile: [num('red', 3)] });
    const { state: next, events } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    expect(next.roundWinnerId).toBe('p0');
    expect(events.some((e) => e.type === 'ROUND_ENDED')).toBe(true);
  });

  it('CASO BORDE: ganar con +2 hace robar al siguiente ANTES de cerrar', () => {
    // Esas 2 cartas cuentan para el puntaje del perdedor. El bug clasico es
    // chequear hand.length === 0 antes de aplicar el efecto.
    const card = colored('draw2', 'red');
    const state = makeState({
      hands: [[card], [num('blue', 1)]],
      drawPile: [num('green', 7), num('green', 8)],
      discardPile: [num('red', 3)],
    });
    const { state: next } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    expect(next.players[1]!.hand).toHaveLength(3);
    expect(next.roundWinnerId).toBe('p0');
    // 1 + 7 + 8 = 16
    expect(next.players[0]!.score).toBe(16);
  });

  it('CASO BORDE: ganar con wild no pide color y cierra la ronda', () => {
    const card = wild();
    const state = makeState({ hands: [[card], [num('blue', 1)]], discardPile: [num('red', 3)] });
    const { state: next } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    expect(next.phase).not.toBe('choosing_color');
    expect(next.roundWinnerId).toBe('p0');
  });

  it('termina la partida al alcanzar el objetivo', () => {
    const card = num('red', 5);
    const state = makeState({
      hands: [[card], [wild4()]], // 50 puntos
      discardPile: [num('red', 3)],
      targetScore: 50,
    });
    const { state: next, events } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    expect(next.phase).toBe('game_over');
    expect(next.gameWinnerId).toBe('p0');
    expect(events.some((e) => e.type === 'GAME_ENDED')).toBe(true);
  });

  it('con el objetivo sin alcanzar queda en round_over', () => {
    const card = num('red', 5);
    const state = makeState({
      hands: [[card], [num('blue', 1)]],
      discardPile: [num('red', 3)],
      targetScore: 500,
    });
    const { state: next } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    expect(next.phase).toBe('round_over');
  });
});

describe('UNO', () => {
  it('abre la ventana al quedar en 1 carta sin declarar', () => {
    const card = num('red', 5);
    const state = makeState({
      hands: [[card, num('blue', 2)], [num('blue', 1)], [num('blue', 3)]],
      discardPile: [num('red', 3)],
    });
    const { state: next } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0', 1000);
    expect(next.unoWindow?.playerId).toBe('p0');
  });

  it('declarar en el mismo comando evita la ventana', () => {
    // Elimina la carrera de red: declaras y jugas en un solo paquete.
    const card = num('red', 5);
    const state = makeState({
      hands: [[card, num('blue', 2)], [num('blue', 1)], [num('blue', 3)]],
      discardPile: [num('red', 3)],
    });
    const { state: next } = apply(
      state,
      { type: 'PLAY_CARD', cardId: card.id, declareUno: true },
      'p0',
    );
    expect(next.unoWindow).toBeNull();
    expect(next.players[0]!.hasDeclaredUno).toBe(true);
  });

  /**
   * La ventana tiene `closesAt`, y hasta ahora NADIE lo respetaba: el comando
   * `CLOSE_UNO_WINDOW` existia y el unico que podia emitirlo —
   * `RoomManager.closeUnoWindow`— no lo llamaba nadie.
   *
   * No se notaba porque el cliente cantaba ÚLTIMA solo, asi que la ventana no
   * se abria jamas. Al sacar ese auto-canto, sin esto la ventana quedaria
   * abierta hasta el fin de la ronda: te podrian acusar cinco turnos despues.
   */
  it('EL BUG: la ventana se cierra y ya no se puede acusar', () => {
    const card = num('red', 5);
    const state = makeState({
      hands: [[card, num('blue', 2)], [num('blue', 1)], [num('blue', 3)]],
      discardPile: [num('red', 3)],
    });
    const { state: played } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0', 1000);
    expect(played.unoWindow?.playerId).toBe('p0');

    const { state: closed } = apply(played, { type: 'CLOSE_UNO_WINDOW' }, null, 5000);
    expect(closed.unoWindow).toBeNull();

    // Acusar despues de cerrada no hace nada: la mano sigue en 1.
    const { state: after } = apply(closed, { type: 'CALL_OUT_UNO', targetId: 'p0' }, 'p1', 6000);
    expect(after.players[0]!.hand).toHaveLength(1);
    expect(after.players[0]!.hasDeclaredUno).toBe(false);
  });

  it('acusar a quien no declaro le hace robar 2', () => {
    const card = num('red', 5);
    const state = makeState({
      hands: [[card, num('blue', 2)], [num('blue', 1)], [num('blue', 3)]],
      drawPile: [num('green', 1), num('green', 2)],
      discardPile: [num('red', 3)],
    });
    const { state: mid } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    const { state: next, events } = apply(mid, { type: 'CALL_OUT_UNO', targetId: 'p0' }, 'p1');
    expect(next.players[0]!.hand).toHaveLength(3);
    expect(events.some((e) => e.type === 'UNO_PENALTY')).toBe(true);
  });

  it('acusar a quien SI declaro no hace nada', () => {
    const card = num('red', 5);
    const state = makeState({
      hands: [[card, num('blue', 2)], [num('blue', 1)], [num('blue', 3)]],
      drawPile: [num('green', 1), num('green', 2)],
      discardPile: [num('red', 3)],
    });
    const { state: mid } = apply(
      state,
      { type: 'PLAY_CARD', cardId: card.id, declareUno: true },
      'p0',
    );
    const { state: next } = apply(mid, { type: 'CALL_OUT_UNO', targetId: 'p0' }, 'p1');
    expect(next.players[0]!.hand).toHaveLength(1);
  });

  it('dos acusaciones simultaneas dan UNA sola penalidad', () => {
    const card = num('red', 5);
    const state = makeState({
      hands: [[card, num('blue', 2)], [num('blue', 1)], [num('blue', 3)]],
      drawPile: [num('green', 1), num('green', 2), num('green', 3), num('green', 4)],
      discardPile: [num('red', 3)],
    });
    const { state: mid } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    const { state: once } = apply(mid, { type: 'CALL_OUT_UNO', targetId: 'p0' }, 'p1');
    const { state: twice } = apply(once, { type: 'CALL_OUT_UNO', targetId: 'p0' }, 'p2');
    expect(twice.players[0]!.hand).toHaveLength(3);
  });

  it('el flag se resetea al volver a tener mas de 1 carta', () => {
    const state = makeState({
      hands: [[num('blue', 9)], [num('blue', 1)]],
      drawPile: [num('green', 4), num('green', 5)],
      discardPile: [num('red', 3)],
    });
    const declared = { ...state };
    declared.players = [{ ...state.players[0]!, hasDeclaredUno: true }, state.players[1]!];
    const { state: next } = apply(declared, { type: 'DRAW_CARD' }, 'p0');
    expect(next.players[0]!.hasDeclaredUno).toBe(false);
  });
});

describe('timeouts', () => {
  it('auto-roba, nunca auto-juega', () => {
    const playable = num('red', 5);
    const state = makeState({
      hands: [[playable], [num('blue', 1)]],
      drawPile: [num('green', 4)],
      discardPile: [num('red', 3)],
    });
    const { state: next } = apply(state, { type: 'TIMEOUT' }, null);
    // La carta jugable sigue en la mano: no jugamos por el.
    expect(next.players[0]!.hand.map((c) => c.id)).toContain(playable.id);
    expect(next.players[0]!.hand).toHaveLength(2);
    expect(current(next).id).toBe('p1');
  });

  it('en card_drawn equivale a pasar', () => {
    const state = makeState({
      hands: [[num('blue', 9)], [num('blue', 1)]],
      drawPile: [num('red', 4)],
      discardPile: [num('red', 3)],
    });
    const { state: drawn } = apply(state, { type: 'DRAW_CARD' }, 'p0');
    const { state: next } = apply(drawn, { type: 'TIMEOUT' }, null);
    expect(current(next).id).toBe('p1');
  });

  it('en choosing_color elige un color determinista', () => {
    const card = wild();
    const state = makeState({
      hands: [[card, num('blue', 2)], [num('blue', 1)]],
      discardPile: [num('red', 3)],
    });
    const { state: mid } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    const { state: next } = apply(mid, { type: 'TIMEOUT' }, null);
    expect(next.phase).not.toBe('choosing_color');
    expect(['red', 'yellow', 'green', 'blue']).toContain(next.activeColor);
  });

  it('tres timeouts seguidos marcan al jugador como idle', () => {
    let state = makeState({
      hands: [[num('blue', 9)], [num('blue', 1)]],
      drawPile: Array.from({ length: 10 }, (_, i) => num('green', (i % 9) as 1)),
      discardPile: [num('red', 3)],
    });
    for (let i = 0; i < 3; i++) {
      // Cada vuelta le toca de nuevo a p0 (son 2 jugadores).
      state = apply(state, { type: 'TIMEOUT' }, null).state;
      if (current(state).id !== 'p0') state = apply(state, { type: 'TIMEOUT' }, null).state;
    }
    expect(state.players[0]!.idle).toBe(true);
  });

  it('jugar resetea el contador de timeouts', () => {
    const card = num('red', 5);
    const state = makeState({
      hands: [[card, num('blue', 2)], [num('blue', 1)]],
      discardPile: [num('red', 3)],
    });
    const withTimeouts = {
      ...state,
      players: [{ ...state.players[0]!, consecutiveTimeouts: 2 }, state.players[1]!],
    };
    const { state: next } = apply(withTimeouts, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    expect(next.players[0]!.consecutiveTimeouts).toBe(0);
  });
});

describe('desconexion y abandono', () => {
  it('desconectar conserva el asiento y la mano', () => {
    const state = makeState({ hands: [[num('red', 5)], [num('blue', 1)]] });
    const { state: next } = apply(state, { type: 'DISCONNECT', playerId: 'p0' }, null);
    expect(next.players[0]!.connected).toBe(false);
    expect(next.players[0]!.hand).toHaveLength(1);
    expect(next.players[0]!.abandoned).toBe(false);
  });

  it('reconectar restaura el estado y limpia idle', () => {
    const state = makeState({ hands: [[num('red', 5)], [num('blue', 1)]] });
    const { state: off } = apply(state, { type: 'DISCONNECT', playerId: 'p0' }, null);
    const { state: on } = apply(off, { type: 'RECONNECT', playerId: 'p0' }, null);
    expect(on.players[0]!.connected).toBe(true);
    expect(on.players[0]!.idle).toBe(false);
  });

  it('abandonar devuelve las cartas al mazo', () => {
    const state = makeState({
      hands: [[num('red', 5), num('red', 6)], [num('blue', 1)], [num('blue', 2)]],
      drawPile: [num('green', 1)],
      discardPile: [num('red', 3)],
    });
    const before = totalCards(state);
    const { state: next } = apply(state, { type: 'ABANDON', playerId: 'p0' }, null);
    expect(next.players[0]!.abandoned).toBe(true);
    expect(next.players[0]!.hand).toHaveLength(0);
    expect(next.drawPile).toHaveLength(3);
    expect(totalCards(next)).toBe(before);
  });

  it('saltea a los abandonados en el orden de turnos', () => {
    const state = makeState({
      hands: [[num('red', 5)], [num('blue', 1)], [num('blue', 2)]],
      discardPile: [num('red', 3)],
    });
    const { state: gone } = apply(state, { type: 'ABANDON', playerId: 'p1' }, null);
    const card = gone.players[0]!.hand[0]!;
    const { state: next } = apply(gone, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    expect(next.roundWinnerId).toBe('p0');
  });

  it('con menos de 2 jugadores activos termina la partida', () => {
    const state = makeState({ hands: [[num('red', 5)], [num('blue', 1)]] });
    const { state: next } = apply(state, { type: 'ABANDON', playerId: 'p0' }, null);
    expect(next.phase).toBe('game_over');
    expect(next.gameWinnerId).toBe('p1');
  });
});

describe('version', () => {
  it('se incrementa en cada comando', () => {
    const state = makeState({
      hands: [[num('blue', 9)], [num('blue', 1)]],
      drawPile: [num('green', 4)],
      discardPile: [num('red', 3)],
    });
    const { state: next } = apply(state, { type: 'DRAW_CARD' }, 'p0');
    expect(next.version).toBe(state.version + 1);
  });
});

describe('NEXT_ROUND', () => {
  it('reparte de nuevo conservando los puntajes', () => {
    const card = num('red', 5);
    const state = makeState({
      hands: [[card], [num('blue', 1)]],
      discardPile: [num('red', 3)],
      targetScore: 500,
    });
    const { state: over } = apply(state, { type: 'PLAY_CARD', cardId: card.id }, 'p0');
    const score = over.players[0]!.score;
    const { state: next } = apply(over, { type: 'NEXT_ROUND' }, null);
    expect(next.phase).not.toBe('round_over');
    expect(next.players[0]!.score).toBe(score);
    expect(next.players[0]!.hand).toHaveLength(HAND_SIZE);
    expect(next.round).toBe(1);
  });
});
