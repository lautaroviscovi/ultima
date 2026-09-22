import type { Meta, StoryObj } from '@storybook/react';
import { makeRedactedState } from '@uno/engine/testing';
import { RoundOverlay } from './RoundOverlay.js';

/**
 * El momento que cierra la partida.
 *
 * Los cuatro estados de abajo son el criterio de la fase: ganar y perder no
 * pueden verse igual, y fin de ronda no puede verse igual que fin de partida.
 * Con el toolbar "Movimiento" en reducido se comprueba que nada quede a medio
 * camino.
 */
const meta = {
  title: 'Mesa/RoundOverlay',
  component: RoundOverlay,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof RoundOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * El overlay se posiciona en `absolute`, asi que necesita un contenedor
 * `relative` con alto. Va por story y no como decorator del meta: un decorator
 * rompe la inferencia de tipos de `satisfies Meta<...>` (TS2742).
 */
function onFelt(args: React.ComponentProps<typeof RoundOverlay>): JSX.Element {
  return (
    <div className="relative h-screen w-full bg-felt-dark">
      <RoundOverlay {...args} />
    </div>
  );
}

/**
 * Puntajes repartidos, para que el orden de la tabla se note.
 *
 * En `game_over` el ganador tiene que estar PRIMERO: la partida termina cuando
 * alguien alcanza el objetivo, asi que un ganador tercero en la tabla seria un
 * estado imposible. La primera version de esta story lo tenia mal y se veia
 * raro sin que el componente tuviera nada que ver.
 */
function scored(phase: 'round_over' | 'game_over', winnerSeat: number) {
  const state = makeRedactedState({ playerCount: 5, phase });
  const base = [180, 240, 95, 210, 40];
  // Sólo en game_over se fuerza al ganador al tope: en round_over la partida
  // sigue y el ganador de la mano bien puede ir ultimo en el acumulado.
  const scores = phase === 'game_over' ? base.map((s, i) => (i === winnerSeat ? 500 : s)) : base;
  return {
    ...state,
    round: 2,
    options: { ...state.options, targetScore: 500 },
    players: state.players.map((p, i) => ({ ...p, score: scores[i]! })),
    ...(phase === 'game_over'
      ? { gameWinnerId: `p${winnerSeat}`, roundWinnerId: `p${winnerSeat}` }
      : { roundWinnerId: `p${winnerSeat}` }),
  };
}

/** Ganaste la ronda: hay respiro, pero la partida sigue. */
export const GanasteLaRonda: Story = {
  render: onFelt,
  args: { state: scored('round_over', 0), isHost: true, roundPoints: 34 },
};

/** Perdiste la ronda. Mismo layout, sin realce ni acento de marca. */
export const PerdisteLaRonda: Story = {
  render: onFelt,
  args: { state: scored('round_over', 3), isHost: true, roundPoints: 34 },
};

/** El clímax: lo único que lleva confeti. */
export const GanasteLaPartida: Story = {
  render: onFelt,
  args: { state: scored('game_over', 0), isHost: true, roundPoints: 52 },
};

/** Perdiste la partida: sin celebración, y el botón es volver al inicio. */
export const PerdisteLaPartida: Story = {
  render: onFelt,
  args: { state: scored('game_over', 3), isHost: false, roundPoints: 52 },
};

/**
 * No sos el anfitrión: no podés arrancar la ronda siguiente.
 */
export const EsperandoAlAnfitrion: Story = {
  render: onFelt,
  args: { state: scored('round_over', 1), isHost: false, roundPoints: 18 },
};

/**
 * Tras una reconexión el evento `ROUND_ENDED` ya pasó, así que no hay delta.
 * El overlay tiene que dibujarse igual: cae al objetivo de puntaje.
 */
export const SinDelta: Story = {
  render: onFelt,
  args: { state: scored('round_over', 2), isHost: true, roundPoints: null },
};
