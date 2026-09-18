import type { Card as CardModel, Color } from '@uno/engine';

export type CardSize = 'sm' | 'md' | 'lg';

export interface CardProps {
  card: CardModel;
  /** Dorso: para las manos ajenas y el mazo. Nunca revela la cara. */
  faceDown?: boolean;
  playable?: boolean;
  selected?: boolean;
  /** Volando hacia el descarte (optimismo visual). */
  inFlight?: boolean;
  size?: CardSize;
  onClick?: (card: CardModel) => void;
}

const SIZE: Record<CardSize, string> = {
  sm: 'w-10 h-[3.5rem] text-[0.65rem]',
  md: 'w-16 h-24 text-sm',
  lg: 'w-24 h-36 text-base',
};

const BG: Record<Color, string> = {
  red: 'bg-uno-red',
  yellow: 'bg-uno-yellow',
  green: 'bg-uno-green',
  blue: 'bg-uno-blue',
};

/** El amarillo con blanco encima no pasa contraste: texto negro. */
const FG: Record<Color, string> = {
  red: 'text-white',
  yellow: 'text-black',
  green: 'text-white',
  blue: 'text-white',
};

/** Glifo central. Los simbolos se dibujan, no se escriben con texto. */
function Face({ card, size }: { card: CardModel; size: CardSize }): JSX.Element {
  const big = size === 'lg' ? 'text-4xl' : size === 'md' ? 'text-2xl' : 'text-base';

  switch (card.kind) {
    case 'number':
      return <span className={`${big} font-black leading-none`}>{card.value}</span>;
    case 'skip':
      return (
        <span className={`${big} font-black leading-none`} aria-hidden>
          &#8416;
        </span>
      );
    case 'reverse':
      return (
        <span className={`${big} font-black leading-none`} aria-hidden>
          &#8646;
        </span>
      );
    case 'draw2':
      return <span className={`${big} font-black leading-none`}>+2</span>;
    case 'wild':
      // Cuatro cuadrantes: es el glifo que todos reconocen del wild.
      return (
        <span className="grid grid-cols-2 gap-[2px]" aria-hidden>
          <i className="block h-3 w-3 rounded-sm bg-uno-red" />
          <i className="block h-3 w-3 rounded-sm bg-uno-blue" />
          <i className="block h-3 w-3 rounded-sm bg-uno-yellow" />
          <i className="block h-3 w-3 rounded-sm bg-uno-green" />
        </span>
      );
    case 'wild4':
      return (
        <span className="flex flex-col items-center leading-none">
          <span className="grid grid-cols-2 gap-[2px]" aria-hidden>
            <i className="block h-2 w-2 rounded-sm bg-uno-red" />
            <i className="block h-2 w-2 rounded-sm bg-uno-blue" />
            <i className="block h-2 w-2 rounded-sm bg-uno-yellow" />
            <i className="block h-2 w-2 rounded-sm bg-uno-green" />
          </span>
          <span className={`${size === 'sm' ? 'text-[0.6rem]' : 'text-lg'} font-black mt-0.5`}>
            +4
          </span>
        </span>
      );
  }
}

/** Texto para lectores de pantalla y para los tests. */
export function cardAria(card: CardModel): string {
  switch (card.kind) {
    case 'number':
      return `${card.color} ${card.value}`;
    case 'skip':
      return `${card.color} bloqueo`;
    case 'reverse':
      return `${card.color} cambio de sentido`;
    case 'draw2':
      return `${card.color} roba dos`;
    case 'wild':
      return 'comodin';
    case 'wild4':
      return 'comodin roba cuatro';
  }
}

export function Card({
  card,
  faceDown = false,
  playable = false,
  selected = false,
  inFlight = false,
  size = 'md',
  onClick,
}: CardProps): JSX.Element {
  if (faceDown) {
    return (
      <div
        className={`${SIZE[size]} shrink-0 rounded-lg border-2 border-white/80 bg-neutral-900
                    shadow-md flex items-center justify-center`}
        aria-hidden
      >
        <span className="rotate-[-20deg] font-black italic text-uno-yellow text-[0.7em]">UNO</span>
      </div>
    );
  }

  const colored = 'color' in card;
  const base = colored ? `${BG[card.color]} ${FG[card.color]}` : 'bg-neutral-900 text-white';
  const interactive = Boolean(onClick);

  return (
    <button
      type="button"
      disabled={!interactive || !playable}
      onClick={() => onClick?.(card)}
      aria-label={cardAria(card)}
      aria-pressed={selected}
      className={`${SIZE[size]} ${base} shrink-0 rounded-lg border-2 border-white
                  shadow-md relative flex items-center justify-center
                  transition-transform duration-150
                  ${playable ? 'hover:-translate-y-2 cursor-pointer' : ''}
                  ${!playable && interactive ? 'opacity-45 saturate-50 cursor-not-allowed' : ''}
                  ${selected ? '-translate-y-3 ring-4 ring-white' : ''}
                  ${inFlight ? 'opacity-0' : ''}`}
    >
      {/* Elipse blanca de fondo, el rasgo visual que define a la carta de UNO. */}
      {colored && (
        <span
          className="absolute inset-[12%] rounded-[50%] bg-white/25 rotate-[-30deg]"
          aria-hidden
        />
      )}
      <span className="relative flex items-center justify-center">
        <Face card={card} size={size} />
      </span>
      {size !== 'sm' && (
        <>
          <span className="absolute top-1 left-1.5 text-[0.6em] font-bold leading-none" aria-hidden>
            <Face card={card} size="sm" />
          </span>
          <span
            className="absolute bottom-1 right-1.5 rotate-180 text-[0.6em] font-bold leading-none"
            aria-hidden
          >
            <Face card={card} size="sm" />
          </span>
        </>
      )}
    </button>
  );
}
