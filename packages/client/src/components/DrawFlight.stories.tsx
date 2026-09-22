import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { num, wild4 } from '@uno/engine/testing';
import { DrawFlightLayer } from './DrawFlight.js';
import type { DrawFlight } from '../hooks/useGameMoments.js';

/**
 * El vuelo aislado del juego.
 *
 * Verificar esto contra una partida real es lento y depende de que sea tu
 * turno; aca se dispara a voluntad y se puede mirar cuadro a cuadro con el
 * toolbar de movimiento.
 */
const meta = {
  title: 'Mesa/DrawFlight',
  component: DrawFlightLayer,
} satisfies Meta<typeof DrawFlightLayer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Relanza el vuelo en bucle para poder observarlo sin recargar. */
function Loop({ cards }: { cards: DrawFlight['card'][] }): JSX.Element {
  const [flights, setFlights] = useState<DrawFlight[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fire = (): void => {
      if (cancelled) return;
      const stamp = Date.now();
      setFlights(
        cards.map((card, index) => ({
          key: `draw-${card.id}-${stamp}`,
          card,
          index,
          total: cards.length,
        })),
      );
      setTimeout(() => !cancelled && setFlights([]), 900);
    };
    fire();
    const id = setInterval(fire, 1800);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [cards]);

  return (
    <div className="relative h-screen w-full bg-felt-dark">
      {/* Referencias para ver de donde sale y a donde llega. */}
      <div className="absolute left-1/2 top-[45%] h-[144px] w-[90px] -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-dashed border-white/30" />
      <div className="absolute left-1/2 top-[88%] h-[144px] w-[90px] -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-dashed border-brand-accent/50" />
      <DrawFlightLayer flights={flights} />
    </div>
  );
}

/** Robar por turno: una sola carta. */
export const UnaCarta: Story = {
  args: { flights: [] },
  render: () => <Loop cards={[num('red', 7)]} />,
};

/** Castigo +4: cuatro cartas escalonadas. */
export const CuatroCartas: Story = {
  args: { flights: [] },
  render: () => <Loop cards={[num('red', 7), num('blue', 2), wild4(), num('green', 9)]} />,
};
