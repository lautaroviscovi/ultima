import type { Meta, StoryObj } from '@storybook/react';
import { makeRedactedPlayer } from '@uno/engine/testing';
import { PlayerSeat } from './PlayerSeat.js';

const meta = {
  title: 'Mesa/PlayerSeat',
  component: PlayerSeat,
  args: { player: makeRedactedPlayer({ seat: 0, nickname: 'Lautaro' }) },
} satisfies Meta<typeof PlayerSeat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnEspera: Story = {};
export const EnTurno: Story = { args: { isCurrent: true, turnProgress: 0.7 } };
export const TurnoUrgente: Story = { args: { isCurrent: true, turnProgress: 0.2 } };
export const TurnoPorExpirar: Story = { args: { isCurrent: true, turnProgress: 0.05 } };

export const Desconectado: Story = {
  args: { player: makeRedactedPlayer({ seat: 0, nickname: 'Sofia', connected: false }) },
};
export const Ausente: Story = {
  args: { player: makeRedactedPlayer({ seat: 0, nickname: 'Sofia', idle: true }) },
};
export const Abandono: Story = {
  args: {
    player: makeRedactedPlayer({ seat: 0, nickname: 'Sofia', abandoned: true, cardCount: 0 }),
  },
};

export const UnoDeclarado: Story = {
  args: {
    player: makeRedactedPlayer({ seat: 0, nickname: 'Sofia', cardCount: 1, hasDeclaredUno: true }),
  },
};

/** Sin declarar y con la ventana abierta: el asiento entero se vuelve boton. */
export const UnoSinDeclarar: Story = {
  args: {
    player: makeRedactedPlayer({ seat: 0, nickname: 'Sofia', cardCount: 1 }),
    canCallOut: true,
  },
};

/** El abanico corta en 7 dorsos; el numero sigue siendo exacto. */
export const Conteos: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3 p-6">
      {[1, 2, 3, 5, 7, 12, 25].map((count) => (
        <PlayerSeat
          key={count}
          player={makeRedactedPlayer({ seat: 0, nickname: `${count}`, cardCount: count })}
        />
      ))}
    </div>
  ),
};
