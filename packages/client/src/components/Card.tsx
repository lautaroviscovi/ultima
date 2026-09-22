import { motion } from 'framer-motion';
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
  /**
   * Habilita la transicion compartida mano <-> descarte.
   *
   * ESTA es la razon por la que las cartas tienen id unico por INSTANCIA: con
   * `layoutId`, Framer Motion reconoce que la carta que salio de tu mano es la
   * misma que aparecio en el descarte y la anima volando. Sin id por
   * instancia, al jugar una de tus dos `red-7` React no sabria cual
   * desaparecio y la animacion saltaria.
   *
   * Se desactiva en grillas (Storybook) donde la misma carta aparece repetida.
   */
  animateLayout?: boolean;
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

/**
 * Glifo central. Los simbolos se dibujan, no se escriben con texto.
 *
 * Las cifras van en `font-display` (Outfit) y con `tabular-nums`: dentro de un
 * ovalo lo que importa es que el numero se centre en su caja y que un "10" no
 * mida distinto que un "11", porque si no el abanico tiembla al cambiar la
 * mano. Los tamaños `figure-*` ya traen line-height 1 por eso mismo.
 */
function Face({ card, size }: { card: CardModel; size: CardSize }): JSX.Element {
  const big =
    size === 'lg' ? 'text-figure-lg' : size === 'md' ? 'text-figure-md' : 'text-figure-sm';
  const figure = `${big} font-display tabular-nums`;

  switch (card.kind) {
    case 'number':
      return <span className={`${figure} font-black`}>{card.value}</span>;
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
      return <span className={`${figure} font-black`}>+2</span>;
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
          <span
            className={`font-display font-black tabular-nums mt-0.5 ${
              size === 'sm' ? 'text-micro' : 'text-figure-sm'
            }`}
          >
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
  animateLayout = true,
}: CardProps): JSX.Element {
  if (faceDown) {
    return (
      <div
        className={`${SIZE[size]} shrink-0 rounded-lg border-2 border-white/80 bg-overlay
                    shadow-card flex items-center justify-center`}
        aria-hidden
      >
        <span className="rotate-[-20deg] font-black italic text-uno-yellow text-[0.7em]">UNO</span>
      </div>
    );
  }

  const colored = 'color' in card;
  const base = colored ? `${BG[card.color]} ${FG[card.color]}` : 'bg-overlay text-white';
  const interactive = Boolean(onClick);

  return (
    <motion.button
      {...(animateLayout ? { layoutId: card.id } : {})}
      layout={animateLayout}
      type="button"
      disabled={!interactive || !playable}
      onClick={() => onClick?.(card)}
      aria-label={cardAria(card)}
      aria-pressed={selected}
      // La carta jugable se eleva al pasar el mouse; la elevacion del
      // seleccionado va por `animate` para que no pelee con el layout.
      {...(playable ? { whileHover: { y: -10 }, whileTap: { scale: 0.96 } } : {})}
      animate={{ y: selected ? -12 : 0, opacity: inFlight ? 0 : 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
      className={`${SIZE[size]} ${base} shrink-0 rounded-lg border-2 border-white
                  shadow-card relative flex items-center justify-center
                  ${playable ? 'cursor-pointer' : ''}
                  ${!playable && interactive ? 'opacity-45 saturate-50 cursor-not-allowed' : ''}
                  ${selected ? 'ring-4 ring-white' : ''}`}
    >
      {/* Elipse blanca de fondo, el rasgo visual que define a la carta.
          Sigue siendo un div rotado semitransparente: la fase 3 lo reemplaza
          por un SVG, que es lo que arregla el escalado y el color sucio. */}
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
    </motion.button>
  );
}
