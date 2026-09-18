import { describe, expect, it } from 'vitest';
import { getPlayableCards, isPlayable, scoreRound } from './rules.js';
import type { Card, Color, NumberValue } from './types.js';
import { makeState, num, wild, wild4, colored } from './testing/fixtures.js';

describe('isPlayable', () => {
  describe('por color activo', () => {
    it('acepta cualquier carta del color activo', () => {
      const top = num('red', 5);
      for (const card of [num('blue', 9), colored('skip', 'blue'), colored('draw2', 'blue')]) {
        expect(isPlayable(card, 'blue', top), JSON.stringify(card)).toBe(true);
      }
    });

    it('rechaza otro color que no coincide ni en numero ni en simbolo', () => {
      expect(isPlayable(num('blue', 9), 'red', num('red', 5))).toBe(false);
    });
  });

  describe('por numero', () => {
    it('acepta el mismo numero aunque cambie el color', () => {
      expect(isPlayable(num('blue', 5), 'red', num('red', 5))).toBe(true);
    });

    it('rechaza numero distinto y color distinto', () => {
      expect(isPlayable(num('blue', 6), 'red', num('red', 5))).toBe(false);
    });

    it('trata el 0 como cualquier otro numero', () => {
      expect(isPlayable(num('green', 0), 'red', num('red', 0))).toBe(true);
      expect(isPlayable(num('green', 0), 'red', num('red', 7))).toBe(false);
    });
  });

  describe('por simbolo', () => {
    it.each(['skip', 'reverse', 'draw2'] as const)('acepta %s sobre %s de otro color', (kind) => {
      expect(isPlayable(colored(kind, 'blue'), 'red', colored(kind, 'red'))).toBe(true);
    });

    it('no confunde simbolos distintos', () => {
      expect(isPlayable(colored('skip', 'blue'), 'red', colored('reverse', 'red'))).toBe(false);
      expect(isPlayable(colored('draw2', 'blue'), 'red', colored('skip', 'red'))).toBe(false);
    });

    it('no mezcla numero con simbolo', () => {
      expect(isPlayable(num('blue', 2), 'red', colored('draw2', 'red'))).toBe(false);
      expect(isPlayable(colored('draw2', 'blue'), 'red', num('red', 2))).toBe(false);
    });
  });

  describe('wilds', () => {
    it('el wild es jugable siempre', () => {
      expect(isPlayable(wild(), 'red', num('red', 5))).toBe(true);
      expect(isPlayable(wild(), 'blue', colored('skip', 'green'))).toBe(true);
    });

    it('el +4 es jugable siempre: v1 es PERMISIVO por decision de producto', () => {
      // Decision explicita: sin validacion de "no tenes el color activo" y sin
      // desafio. Si esto se vuelve estricto en fase 2, este test debe cambiar
      // a proposito, no por accidente.
      expect(isPlayable(wild4(), 'red', num('red', 5))).toBe(true);
      expect(isPlayable(wild4(), 'blue', wild())).toBe(true);
    });

    it('sobre un wild jugado, manda el color elegido y no la carta', () => {
      const top = wild();
      expect(isPlayable(num('green', 3), 'green', top)).toBe(true);
      expect(isPlayable(num('red', 3), 'green', top)).toBe(false);
    });
  });

  describe('sin tope de descarte', () => {
    it('solo deja jugar por color activo o wilds', () => {
      expect(isPlayable(num('red', 5), 'red', null)).toBe(true);
      expect(isPlayable(num('blue', 5), 'red', null)).toBe(false);
      expect(isPlayable(wild(), 'red', null)).toBe(true);
    });
  });

  describe('matriz exhaustiva', () => {
    it('toda carta del color activo es jugable, para todo tope', () => {
      const colors: Color[] = ['red', 'yellow', 'green', 'blue'];
      const tops: Card[] = [num('red', 0), colored('skip', 'yellow'), wild(), wild4()];
      for (const active of colors) {
        for (const top of tops) {
          for (let v = 0; v <= 9; v++) {
            const card = num(active, v as NumberValue);
            expect(isPlayable(card, active, top), `${active} ${v} sobre ${top.kind}`).toBe(true);
          }
        }
      }
    });
  });
});

describe('getPlayableCards', () => {
  it('filtra solo las jugables y conserva el orden de la mano', () => {
    // Sobre un tope rojo-3 con color activo rojo:
    //   rojo-5  -> si, por color
    //   azul-9  -> no, ni color ni numero
    //   wild    -> si, siempre
    //   azul-3  -> si, por numero
    const hand = [num('red', 5), num('blue', 9), wild(), num('blue', 3)];
    const playable = getPlayableCards(hand, 'red', num('red', 3));
    expect(playable.map((c) => c.id)).toEqual([hand[0]!.id, hand[2]!.id, hand[3]!.id]);
  });

  it('con una mano sin jugables devuelve vacio', () => {
    expect(getPlayableCards([num('blue', 9)], 'red', num('red', 3))).toEqual([]);
  });

  it('con mano vacia devuelve vacio', () => {
    expect(getPlayableCards([], 'red', num('red', 3))).toEqual([]);
  });
});

describe('scoreRound', () => {
  it('suma las manos de todos MENOS el ganador', () => {
    const state = makeState({
      hands: [
        [num('red', 5)], // ganador (mano irrelevante)
        [num('red', 9), colored('skip', 'blue')], // 9 + 20 = 29
        [wild4()], // 50
      ],
    });
    expect(scoreRound(state, state.players[0]!.id)).toBe(79);
  });

  it('da 0 si todos los demas se quedaron sin cartas', () => {
    const state = makeState({ hands: [[num('red', 5)], [], []] });
    expect(scoreRound(state, state.players[0]!.id)).toBe(0);
  });
});
