import type { Card as CardModel, CardId } from '@uno/engine';
import { Card, CARD_WIDTH_PX } from './Card.js';

export interface HandProps {
  cards: CardModel[];
  playable?: Set<CardId>;
  inFlight?: Set<CardId>;
  onPlay?: (card: CardModel) => void;
  /** Ancho disponible en px. Solo para tests: en runtime lo da el contenedor. */
  availableWidth?: number;
}

/**
 * Ancho de una carta `lg` en px.
 *
 * Derivado del mapa de tamaños de Card y no un literal: eran dos declaraciones
 * del mismo numero, y la de aca era la que se olvidaba de actualizar. El
 * calculo del abanico depende de que coincida con el ancho REAL renderizado.
 */
export const CARD_WIDTH = CARD_WIDTH_PX.lg;
/** Cuanto debe asomar siempre de cada carta tapada, para poder distinguirla. */
const MIN_VISIBLE = 26;

/**
 * Solapamiento calculado desde el ancho disponible, no desde umbrales fijos.
 *
 * Con umbrales fijos, 25 cartas x (96 - 30) = 1650px desbordaban un viewport de
 * 1400 y las cartas de los extremos quedaban cortadas. Con +4s volando, manos
 * de 25 pasan, asi que el abanico tiene que entrar siempre.
 *
 * Devuelve un margen negativo (0 = sin solapar).
 */
export function overlapFor(count: number, availableWidth: number): number {
  if (count <= 1) return 0;

  // Lo que sobra si las ponemos una al lado de la otra.
  const natural = count * CARD_WIDTH;
  if (natural <= availableWidth) return 0;

  // Repartimos el exceso entre los (count - 1) huecos.
  const needed = (natural - availableWidth) / (count - 1);
  // Nunca tapamos tanto como para que no se distinga la carta.
  const maxOverlap = CARD_WIDTH - MIN_VISIBLE;
  return -Math.min(needed, maxOverlap);
}

export function Hand({
  cards,
  playable,
  inFlight,
  onPlay,
  availableWidth,
}: HandProps): JSX.Element {
  // Sin ancho medido usamos el minimo soportado del layout, que es el caso
  // peor: si entra ahi, entra en cualquier pantalla mas grande.
  const width = availableWidth ?? (typeof window !== 'undefined' ? window.innerWidth - 64 : 1036);
  const overlap = overlapFor(cards.length, width);

  return (
    <div className="flex items-end justify-center overflow-hidden px-4 pb-1 pt-6">
      {cards.map((card, i) => (
        <div
          key={card.id}
          style={{ marginLeft: i === 0 ? 0 : `${overlap}px` }}
          className="transition-[margin] duration-200 hover:z-20"
        >
          <Card
            card={card}
            size="lg"
            playable={playable?.has(card.id) ?? false}
            inFlight={inFlight?.has(card.id) ?? false}
            {...(onPlay ? { onClick: onPlay } : {})}
          />
        </div>
      ))}
    </div>
  );
}
