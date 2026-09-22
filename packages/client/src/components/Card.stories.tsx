import type { Meta, StoryObj } from '@storybook/react';
import { COLORS, buildDeck, type Card as CardModel } from '@uno/engine';
import { Card } from './Card.js';

const meta = {
  title: 'Cartas/Card',
  component: Card,
  args: { size: 'md', playable: true, animateLayout: false },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

const deck = buildDeck();
const find = (fn: (c: CardModel) => boolean): CardModel => deck.find(fn)!;

export const Numero: Story = { args: { card: find((c) => c.kind === 'number') } };
export const Skip: Story = { args: { card: find((c) => c.kind === 'skip') } };
export const Reverse: Story = { args: { card: find((c) => c.kind === 'reverse') } };
export const DrawTwo: Story = { args: { card: find((c) => c.kind === 'draw2') } };
export const Wild: Story = { args: { card: find((c) => c.kind === 'wild') } };
export const WildDrawFour: Story = { args: { card: find((c) => c.kind === 'wild4') } };
export const Dorso: Story = { args: { card: deck[0]!, faceDown: true } };

/**
 * Las 54 caras de un vistazo. Revisarlas jugando es imposible: habria que
 * esperar a que salga cada una.
 */
export const TodasLasCaras: Story = {
  args: { card: deck[0]! },
  render: (args) => {
    const unique = new Map<string, CardModel>();
    for (const card of deck) {
      const key =
        card.kind === 'number'
          ? `${card.color}-${card.value}`
          : 'color' in card
            ? `${card.color}-${card.kind}`
            : card.kind;
      if (!unique.has(key)) unique.set(key, card);
    }
    return (
      <div className="p-6">
        {COLORS.map((color) => (
          <div key={color} className="mb-3 flex flex-wrap gap-2">
            {[...unique.values()]
              .filter((c) => 'color' in c && c.color === color)
              .map((card) => (
                <Card key={card.id} {...args} card={card} />
              ))}
          </div>
        ))}
        <div className="flex gap-2">
          {[...unique.values()]
            .filter((c) => !('color' in c))
            .map((card) => (
              <Card key={card.id} {...args} card={card} />
            ))}
        </div>
      </div>
    );
  },
};

/** Cada estado visual de una misma carta. */
export const Estados: Story = {
  args: { card: find((c) => c.kind === 'number') },
  render: (args) => (
    <div className="flex items-end gap-4 p-6">
      {(
        [
          ['jugable', { playable: true }],
          ['no jugable', { playable: false }],
          ['volando', { playable: true, inFlight: true }],
          ['dorso', { faceDown: true }],
        ] as const
      ).map(([label, props]) => (
        <figure key={label} className="text-center">
          <Card {...args} {...props} onClick={() => {}} />
          <figcaption className="mt-2 text-xs text-white/60">{label}</figcaption>
        </figure>
      ))}
    </div>
  ),
};

export const Tamanos: Story = {
  args: { card: find((c) => c.kind === 'draw2') },
  render: (args) => (
    <div className="flex items-end gap-4 p-6">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <Card key={size} {...args} size={size} />
      ))}
    </div>
  ),
};
