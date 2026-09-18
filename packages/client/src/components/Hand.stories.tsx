import type { Meta, StoryObj } from '@storybook/react';
import { buildShuffledDeck, createRng } from '@uno/engine';
import { Hand } from './Hand.js';

const meta = {
  title: 'Mesa/Hand',
  component: Hand,
} satisfies Meta<typeof Hand>;

export default meta;
type Story = StoryObj<typeof meta>;

const deck = buildShuffledDeck(createRng('stories'));
const take = (n: number) => deck.slice(0, n);

/**
 * El abanico con distinta cantidad de cartas. Llegar a 25 en una partida real
 * es una tortura; aca es un arg.
 */
function handOf(n: number): StoryObj<typeof meta> {
  const cards = take(n);
  return {
    args: {
      cards,
      // Marcamos algunas jugables para ver el contraste.
      playable: new Set(cards.filter((_, i) => i % 3 === 0).map((c) => c.id)),
    },
  };
}

export const UnaCarta: Story = handOf(1);
export const Tres: Story = handOf(3);
export const Siete: Story = handOf(7);
export const Quince: Story = handOf(15);
/** Con +4s volando, manos de 25 pasan. El solapamiento tiene que aguantar. */
export const VeinticincoCartas: Story = handOf(25);
