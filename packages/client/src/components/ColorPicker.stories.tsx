import type { Meta, StoryObj } from '@storybook/react';
import { ColorPicker } from './ColorPicker.js';

const meta = {
  title: 'Mesa/ColorPicker',
  component: ColorPicker,
  args: { open: true, onPick: () => {} },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ColorPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Abierto: Story = { args: { open: true, onPick: () => {} } };
export const ConCancelar: Story = {
  args: { open: true, onPick: () => {}, onCancel: () => {} },
};
