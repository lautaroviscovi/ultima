import type { Meta, StoryObj } from '@storybook/react';
import { DirectionIndicator } from './DirectionIndicator.js';

const meta = {
  title: 'Mesa/DirectionIndicator',
  component: DirectionIndicator,
} satisfies Meta<typeof DirectionIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horario: Story = { args: { direction: 1 } };
export const Antihorario: Story = { args: { direction: -1 } };
/** El reverse merece la animacion mas grande del juego. */
export const FlashDeReverse: Story = { args: { direction: -1, flash: true } };
