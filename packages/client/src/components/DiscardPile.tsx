import type { Card as CardModel, Color } from '@uno/engine';
import { Card } from './Card.js';

export interface DiscardPileProps {
  top: CardModel | null;
  activeColor: Color;
  drawPileCount: number;
  canDraw?: boolean;
  onDraw?: () => void;
}

const RING: Record<Color, string> = {
  red: 'shadow-[0_0_60px_18px_rgba(215,38,0,0.55)]',
  yellow: 'shadow-[0_0_60px_18px_rgba(232,176,0,0.55)]',
  green: 'shadow-[0_0_60px_18px_rgba(0,166,81,0.55)]',
  blue: 'shadow-[0_0_60px_18px_rgba(0,130,206,0.55)]',
};

/**
 * El halo de color comunica el color ACTIVO, que puede diferir de la carta del
 * tope cuando se jugo un wild. Sin esto, un wild deja la mesa sin indicar a que
 * se puede jugar.
 */
export function DiscardPile({
  top,
  activeColor,
  drawPileCount,
  canDraw = false,
  onDraw,
}: DiscardPileProps): JSX.Element {
  return (
    <div className={`flex items-center gap-5 rounded-2xl p-4 ${RING[activeColor]}`}>
      <button
        type="button"
        onClick={onDraw}
        disabled={!canDraw}
        aria-label={`Robar carta. Quedan ${drawPileCount} en el mazo`}
        className={`relative ${canDraw ? 'hover:-translate-y-1 cursor-pointer' : 'cursor-default'}
                    transition-transform`}
      >
        <div
          className="h-24 w-16 rounded-lg border-2 border-white/80 bg-neutral-900 shadow-md
                        flex items-center justify-center"
        >
          <span className="rotate-[-20deg] font-black italic text-uno-yellow text-xs">UNO</span>
        </div>
        <span className="absolute -bottom-5 left-0 right-0 text-center text-[0.65rem] text-white/60">
          {drawPileCount}
        </span>
      </button>

      <div className="relative h-24 w-16">
        {top ? (
          <Card card={top} size="md" />
        ) : (
          <div className="h-24 w-16 rounded-lg border-2 border-dashed border-white/30" />
        )}
      </div>
    </div>
  );
}
