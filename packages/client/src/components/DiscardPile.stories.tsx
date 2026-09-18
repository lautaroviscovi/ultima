import type { Meta, StoryObj } from '@storybook/react';
import { num, wild } from '@uno/engine/testing';
import { DiscardPile } from './DiscardPile.js';

const meta = {
  title: 'Mesa/DiscardPile',
  component: DiscardPile,
  args: { top: num('red', 7), activeColor: 'red', drawPileCount: 42, canDraw: true },
} satisfies Meta<typeof DiscardPile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {};

/**
 * Tras un wild, el color activo NO es el de la carta del tope. El halo es lo
 * unico que comunica a que se puede jugar.
 */
export const WildConColorAzul: Story = { args: { top: wild(), activeColor: 'blue' } };
export const WildConColorVerde: Story = { args: { top: wild(), activeColor: 'green' } };

export const MazoCasiVacio: Story = { args: { drawPileCount: 2 } };
export const NoPodesRobar: Story = { args: { canDraw: false } };
export const MesaVacia: Story = { args: { top: null } };
