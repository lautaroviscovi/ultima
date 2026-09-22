import type { CSSProperties } from 'react';
import type { Card as CardModel, Color } from '@uno/engine';
import { DURATION } from '../design/motion.js';
import { Card } from './Card.js';

export interface DiscardPileProps {
  top: CardModel | null;
  activeColor: Color;
  drawPileCount: number;
  canDraw?: boolean;
  onDraw?: () => void;
}

/**
 * El halo es UNA sombra parametrizada por color, no cuatro sombras.
 *
 * Antes eran cuatro `shadow-[0_0_60px_18px_rgba(215,38,0,0.55)]` con los
 * canales de cada pigmento reescritos a mano — o sea, el mismo color
 * declarado en dos lugares, y el literal era el que se olvidaba de
 * actualizar. Ahora el color sale del token y lo unico que cambia es a cual
 * apunta `--glow-color`.
 */
const GLOW: Record<Color, string> = {
  red: 'var(--uno-red)',
  yellow: 'var(--uno-yellow)',
  green: 'var(--uno-green)',
  blue: 'var(--uno-blue)',
};

/**
 * El mazo se dibuja con `Card faceDown`, que no mira la carta — un dorso que
 * dependiera de su contenido filtraria informacion. Esta constante existe solo
 * para satisfacer el tipo, y es deliberadamente una carta imposible de jugar
 * para que se note si alguna vez se renderizara de frente por error.
 */
const PLACEHOLDER: CardModel = { id: 'deck-back', kind: 'wild' };

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
    <div
      className="flex items-center gap-5 rounded-2xl p-4 shadow-halo transition-[box-shadow]"
      // El color activo cambia al jugarse un wild: transicionado, no de golpe,
      // porque es informacion nueva sobre a que se puede jugar.
      style={
        {
          '--glow-color': GLOW[activeColor],
          transitionDuration: `${DURATION.color}s`,
        } as CSSProperties
      }
    >
      <button
        type="button"
        onClick={onDraw}
        disabled={!canDraw}
        aria-label={`Robar carta. Quedan ${drawPileCount} en el mazo`}
        className={`relative ${canDraw ? 'hover:-translate-y-1 cursor-pointer' : 'cursor-default'}
                    transition-transform`}
      >
        {/* El dorso estaba duplicado acá con markup propio, distinto al de
            Card. Ahora es el MISMO componente, así que el mazo y las manos
            ajenas no pueden volver a divergir. */}
        <Card card={PLACEHOLDER} faceDown size="md" />
        <span className="absolute -bottom-5 left-0 right-0 text-center text-micro text-white/60">
          {drawPileCount}
        </span>
      </button>

      <div className="relative h-[96px] w-[60px]">
        {top ? (
          <Card card={top} size="md" />
        ) : (
          <div className="h-full w-full rounded-lg border-2 border-dashed border-white/30" />
        )}
      </div>
    </div>
  );
}
