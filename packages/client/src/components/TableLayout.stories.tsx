import type { Meta, StoryObj } from '@storybook/react';
import { makeRedactedState, num, wild } from '@uno/engine/testing';
import { getPlayableCards } from '@uno/engine';
import { TableLayout } from './TableLayout.js';

/**
 * ESTA es la story que justifica Storybook por si sola.
 *
 * El control de `playerCount` de 2 a 10 deja ver los nueve layouts de un
 * vistazo. Sin esto, validar la mesa de 10 requiere juntar a diez personas.
 */
const meta = {
  title: 'Mesa/TableLayout',
  component: TableLayout,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TableLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Arma los props desde la vista redactada, igual que hara la mesa real. */
function propsFor(playerCount: number, overrides: Parameters<typeof makeRedactedState>[0] = {}) {
  const state = makeRedactedState({ playerCount, ...overrides });
  const opponents = state.players.filter((p) => p.id !== state.you.id);
  const playable = new Set(
    getPlayableCards(state.you.hand, state.activeColor, state.discardTop).map((c) => c.id),
  );

  return {
    opponents,
    hand: state.you.hand,
    playable,
    currentPlayerId: state.currentPlayerId,
    myId: state.you.id,
    discardTop: state.discardTop,
    activeColor: state.activeColor,
    drawPileCount: state.drawPileCount,
    direction: state.direction,
    turnProgress: 0.7,
    isMyTurn: state.currentPlayerId === state.you.id,
    /**
     * `onPlay` no es decorativo en las stories: `Card` solo trata una carta
     * como accionable si recibe un handler, y de eso depende que se vean los
     * estados de jugable/invalida. Sin esto, las stories muestran una mano
     * inerte que no se parece a la del juego.
     */
    onPlay: () => {},
  };
}

export const DosJugadores: Story = { args: propsFor(2) };
export const CuatroJugadores: Story = { args: propsFor(4) };
export const SeisJugadores: Story = { args: propsFor(6) };
export const OchoJugadores: Story = { args: propsFor(8) };

/** El caso que ninguna plataforma existente resuelve. */
export const DiezJugadores: Story = { args: propsFor(10) };

/**
 * Los nueve layouts juntos. Si el de 10 no funciona, se ve aca y no despues de
 * cablear toda la mesa.
 */
export const TodosLosLayouts: Story = {
  args: propsFor(10),
  render: () => (
    <div className="space-y-6 p-4">
      {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <div key={n}>
          <p className="mb-1 text-sm font-bold text-white/70">{n} jugadores</p>
          <div className="h-[28rem] overflow-hidden rounded-xl ring-1 ring-white/10">
            <TableLayout {...propsFor(n)} />
          </div>
        </div>
      ))}
    </div>
  ),
};

/** No es tu turno: el marco inferior se apaga y las cartas se atenuan. */
/**
 * Fuera de turno la mano queda NEUTRA, no apagada.
 *
 * Antes se veia igual que una carta invalida en tu turno: `playable` es un set
 * vacio fuera de turno, asi que todas quedaban atenuadas. El gris no informaba
 * nada — comparar con `TuTurnoConInvalidas`.
 */
export const NoEsTuTurno: Story = {
  args: { ...propsFor(10, { currentSeat: 3 }), isMyTurn: false, playable: new Set<string>() },
};

/**
 * En TU turno, con cartas que no se pueden jugar.
 *
 * Aca el gris SI informa: dice "esta no". Las dos o tres jugables se levantan
 * y el resto se apaga de verdad, que es la diferencia con la story de arriba.
 */
export const TuTurnoConInvalidas: Story = {
  args: { ...propsFor(10, { currentSeat: 0 }), isMyTurn: true },
};

/** El color activo difiere del tope: el halo es lo unico que lo comunica. */
export const WildConColorElegido: Story = {
  args: propsFor(10, { discardTop: wild(), activeColor: 'blue' }),
};

/** Alguien quedo en una carta y no declaro: el asiento se vuelve acusable. */
export const VentanaDeUno: Story = {
  args: {
    ...propsFor(10, { cardCounts: [7, 1, 5, 3, 7, 2, 6, 4, 8, 5] }),
    unoWindowFor: 'p1',
  },
};

/** Estas por quedar en una: el boton UNO se ilumina ANTES de jugar. */
export const PorCantarUno: Story = {
  args: propsFor(10, { yourHand: [num('red', 5), num('blue', 9)] }),
};

/** Mano grande: el abanico se solapa en vez de desbordar. */
export const ManoGrande: Story = {
  args: propsFor(10, {
    yourHand: Array.from({ length: 22 }, (_, i) =>
      num((['red', 'blue', 'green', 'yellow'] as const)[i % 4]!, (i % 10) as 0),
    ),
  }),
};

/** Desconectados, ausentes y abandonos conviviendo en la misma mesa. */
export const EstadosDeJugador: Story = {
  args: (() => {
    const base = propsFor(10);
    const opponents = base.opponents.map((p, i) => {
      if (i === 0) return { ...p, connected: false };
      if (i === 1) return { ...p, idle: true };
      if (i === 2) return { ...p, abandoned: true, cardCount: 0 };
      if (i === 3) return { ...p, cardCount: 1, hasDeclaredUno: true };
      if (i === 4) return { ...p, cardCount: 2 };
      return p;
    });
    return { ...base, opponents };
  })(),
};

/** Sentido antihorario tras un reverse, con el anuncio del cambio. */
export const SentidoInvertido: Story = {
  args: {
    ...propsFor(10, { direction: -1 }),
    announcement: { kind: 'reverse' as const, direction: -1 as const },
  },
};

/**
 * Los otros anuncios.
 *
 * Existen como stories separadas porque en el juego NUNCA se ven dos a la vez:
 * el hook elige uno por prioridad. Aca se pueden mirar de a uno.
 */
export const AnuncioMasCuatro: Story = {
  args: { ...propsFor(10), announcement: { kind: 'draw4' as const } },
};

export const AnuncioMasDos: Story = {
  args: { ...propsFor(10), announcement: { kind: 'draw2' as const } },
};

export const AnuncioTeSaltearon: Story = {
  args: { ...propsFor(10), announcement: { kind: 'skipped' as const } },
};

/** El ÚLTIMA ajeno: el único anuncio que NO es sobre vos. */
export const AnuncioUltima: Story = {
  args: { ...propsFor(10), announcement: { kind: 'uno' as const, who: 'Jugador 4' } },
};

/**
 * Movimiento reducido: las transiciones pasan a duracion ~0 pero el estado
 * final es el mismo. Nada queda a medio camino.
 *
 * Ya no se pasa por prop — la preferencia vive en el MotionConfig del arbol
 * (en la app, leida del sistema; aca, del toolbar "Movimiento"). Esta story
 * fija ese global para que el caso quede documentado sin depender de que
 * alguien mueva el toolbar.
 */
export const MovimientoReducido: Story = {
  args: {
    ...propsFor(10),
    announcement: { kind: 'reverse' as const, direction: 1 as const },
  },
  globals: { motion: 'reduced' },
};
