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
export const NoEsTuTurno: Story = {
  args: { ...propsFor(10, { currentSeat: 3 }), isMyTurn: false, playable: new Set<string>() },
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

/** Sentido antihorario tras un reverse, con el flash del cambio. */
export const SentidoInvertido: Story = {
  args: { ...propsFor(10, { direction: -1 }), reverseFlash: true },
};

/**
 * Movimiento reducido: las transiciones pasan a duracion 0 pero el estado
 * final es el mismo. Nada queda a medio camino.
 */
export const MovimientoReducido: Story = {
  args: { ...propsFor(10), reducedMotion: true, reverseFlash: true },
};
