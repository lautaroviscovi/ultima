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

/**
 * Tu penultima carta es un comodin: hay que poder cantar ÚLTIMA desde ACA.
 *
 * Sin este boton, jugar un wild como penultima carta era una trampa: tocarlo
 * abre este modal —que ocupa la pantalla y atrapa el foco— asi que el
 * ¡ÚLTIMA! de la barra de mano quedaba inalcanzable, y te acusaban.
 */
export const ConUltima: Story = {
  args: { open: true, onPick: () => {}, aboutToWin: true, onDeclareUno: () => {} },
};

/** Ya cantaste: el comando que estas por mandar va a llevar `declareUno`. */
export const ConUltimaCantada: Story = {
  args: {
    open: true,
    onPick: () => {},
    aboutToWin: true,
    unoArmed: true,
    onDeclareUno: () => {},
  },
};
