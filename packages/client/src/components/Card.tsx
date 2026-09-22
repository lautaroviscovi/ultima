import { motion } from 'framer-motion';
import type { Card as CardModel, Color } from '@uno/engine';
import { SPRING } from '../design/motion.js';
import { CardBack } from './card/CardBack.js';
import { CardOval } from './card/CardOval.js';
import { Draw2Glyph, ReverseGlyph, SkipGlyph, Wild4Glyph, WildGlyph } from './card/glyphs.js';

export type CardSize = 'sm' | 'md' | 'lg';

export interface CardProps {
  card: CardModel;
  /** Dorso: para las manos ajenas y el mazo. Nunca revela la cara. */
  faceDown?: boolean;
  playable?: boolean;
  /**
   * Si es TU turno.
   *
   * Sin esto la carta no puede distinguir dos situaciones muy distintas que
   * antes se veian igual: "no es tu momento" y "esta carta no sirve". Fuera de
   * turno `playable` es false para TODAS, asi que la mano entera quedaba
   * atenuada aunque no hubiera nada mal.
   */
  myTurn?: boolean;
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

/**
 * Ancho de cada tamaño. TODO lo demas se deriva de aca.
 *
 * Los tres tamaños comparten el ratio 5:8 (1.6). Antes `sm` tenia ratio 0.714
 * y `md`/`lg` 0.667, y ese es el motivo por el que el dorso del asiento se veia
 * "mas gordo" que la carta de tu mano: no eran la misma carta a otra escala,
 * eran cartas distintas.
 */
export const CARD_WIDTH_PX: Record<CardSize, number> = { sm: 40, md: 60, lg: 90 };

/**
 * Las proporciones internas salen de `--card-w` por calc.
 *
 * Con esto `sm` deja de ser un caso especial lleno de `text-[0.6rem]`, y los
 * cuadrantes del wild — que tenian `h-3 w-3` fijos y por eso no escalaban — se
 * arreglan solos.
 *
 * En `sm` el glifo central crece (0.6 en vez de 0.52) porque las miniaturas de
 * esquina se ocultan: siendo la unica informacion de la carta, merece el
 * espacio que dejan libre.
 */
function sizeVars(size: CardSize): Record<string, string> {
  const w = CARD_WIDTH_PX[size];
  return {
    '--card-w': `${w}px`,
    '--card-h': `${w * 1.6}px`,
    '--card-radius': `${w * 0.09}px`,
    '--card-figure': `${w * (size === 'sm' ? 0.6 : 0.52)}px`,
    '--card-corner': `${w * 0.2}px`,
  };
}

const BG: Record<Color, string> = {
  red: 'bg-uno-red',
  yellow: 'bg-uno-yellow',
  green: 'bg-uno-green',
  blue: 'bg-uno-blue',
};

/**
 * Color del glifo CENTRAL, que se dibuja sobre el ovalo blanco.
 *
 * Va en el color de la carta, no en blanco: el ovalo ya es blanco, asi que el
 * simbolo tiene que contrastar contra EL. Ademas esto hace que el amarillo
 * deje de ser el caso especial de contraste que era.
 */
const INK: Record<Color, string> = {
  red: 'text-uno-red',
  yellow: 'text-uno-yellow',
  green: 'text-uno-green',
  blue: 'text-uno-blue',
};

/**
 * Color de las miniaturas de ESQUINA, que van sobre el color pleno de la
 * carta y no sobre el ovalo. El amarillo con blanco encima no pasa contraste.
 */
const CORNER: Record<Color, string> = {
  red: 'text-white',
  yellow: 'text-black',
  green: 'text-white',
  blue: 'text-white',
};

/**
 * Glifo central, dibujado sobre el ovalo.
 *
 * Va en el color de la carta y no en blanco: el ovalo ya es blanco, asi que el
 * simbolo tiene que contrastar CONTRA el, no contra el fondo. Eso tambien hace
 * que el amarillo deje de ser un caso especial de contraste.
 */
function Face({ card, corner = false }: { card: CardModel; corner?: boolean }): JSX.Element {
  const box = corner
    ? 'h-[var(--card-corner)] w-[var(--card-corner)]'
    : 'h-[var(--card-figure)] w-[var(--card-figure)]';
  const text = corner
    ? 'text-[calc(var(--card-corner)*0.95)]'
    : 'text-[calc(var(--card-figure)*1.05)]';
  const figure = `${text} font-display font-black tabular-nums leading-none`;

  switch (card.kind) {
    case 'number':
      return <span className={figure}>{card.value}</span>;
    case 'skip':
      return <SkipGlyph className={box} />;
    case 'reverse':
      return <ReverseGlyph className={box} />;
    case 'draw2':
      // En la esquina no hay lugar para dibujar dos cartas: ahi si va el texto.
      return corner ? <span className={figure}>+2</span> : <Draw2Glyph className={box} />;
    case 'wild':
      // En la esquina el disco de 12px no se lee: mejor nada que un borron.
      return corner ? <span /> : <WildGlyph className={box} />;
    case 'wild4':
      /**
       * El disco va al 72% y el "+4" DEBAJO, no encima.
       *
       * A tamaño completo los dos juntos ocupaban el 63% de la altura de la
       * carta y el numero se montaba sobre los cuadrantes. El +4 es la
       * informacion mas importante de la carta mas poderosa del mazo: tiene
       * que leerse solo, no compitiendo con el disco.
       *
       * En la esquina va solo el "+4": el disco a 12px es un borron, y el
       * numero es lo unico que se necesita leer del abanico solapado.
       */
      return corner ? (
        <span className={figure}>+4</span>
      ) : (
        <span className="flex flex-col items-center gap-[calc(var(--card-figure)*0.04)] leading-none">
          <span
            className="block"
            style={{
              width: 'calc(var(--card-figure) * 0.72)',
              height: 'calc(var(--card-figure) * 0.72)',
            }}
          >
            <Wild4Glyph className="h-full w-full" />
          </span>
          <span className={figure}>+4</span>
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
  myTurn = false,
  inFlight = false,
  size = 'md',
  onClick,
  animateLayout = true,
}: CardProps): JSX.Element {
  const vars = sizeVars(size);
  const box = 'w-[var(--card-w)] h-[var(--card-h)]';

  if (faceDown) {
    return <CardBack className={`${box} shrink-0`} style={vars} />;
  }

  const colored = 'color' in card;
  const interactive = Boolean(onClick);
  /**
   * Gris SOLO en turno: ahi "no jugable" es informacion util. Fuera de turno
   * ninguna carta es jugable y atenuarlas seria ruido.
   */
  const dimmed = interactive && myTurn && !playable;

  return (
    <motion.button
      {...(animateLayout ? { layoutId: card.id } : {})}
      layout={animateLayout}
      type="button"
      style={vars}
      disabled={!interactive || !playable}
      onClick={() => onClick?.(card)}
      aria-label={cardAria(card)}
      {...(playable ? { whileHover: { y: -22 }, whileTap: { scale: 0.96 } } : {})}
      /**
       * TRES estados, no dos. Y el tercero es el que faltaba.
       *
       * | Situacion            | Como se ve                                  |
       * | -------------------- | ------------------------------------------- |
       * | Fuera de turno       | En reposo, NEUTRA. No hay nada mal          |
       * | En turno, jugable    | Elevada y con acento de marca               |
       * | En turno, invalida   | Gris de verdad: aca el gris SI dice "esta no" |
       *
       * Antes faltaba la primera: fuera de turno `playable` es false para
       * todas, asi que la mano entera se veia igual de apagada que una carta
       * invalida en tu turno. El gris no informaba nada — y por eso molestaba.
       *
       * Apagar esta bien CUANDO el gris informa. Ese es el matiz que corrige
       * la decision de la fase 3, que habia subido la opacidad para todos.
       */
      animate={{ y: playable ? -12 : 0, opacity: inFlight ? 0 : 1 }}
      transition={SPRING.snap}
      className={`${box} shrink-0 relative flex items-center justify-center overflow-hidden
                  rounded-[var(--card-radius)] border-2 border-white shadow-card
                  transition-[opacity,filter] duration-200
                  ${colored ? BG[card.color] : 'bg-overlay'}
                  ${playable ? 'cursor-pointer shadow-card-lift ring-2 ring-brand-accent/70' : ''}
                  ${dimmed ? 'opacity-40 saturate-[0.35] cursor-not-allowed' : ''}
                  ${!playable && !dimmed && interactive ? 'cursor-not-allowed' : ''}`}
    >
      {colored && <CardOval className="absolute inset-0 h-full w-full" />}

      <span
        className={`relative flex items-center justify-center ${
          colored ? INK[card.color] : 'text-white'
        }`}
      >
        <Face card={card} />
      </span>

      {size !== 'sm' && (
        <>
          <span
            className={`absolute left-[6%] top-[3%] ${colored ? CORNER[card.color] : 'text-white'}`}
            aria-hidden
          >
            <Face card={card} corner />
          </span>
          <span
            className={`absolute bottom-[3%] right-[6%] rotate-180 ${
              colored ? CORNER[card.color] : 'text-white'
            }`}
            aria-hidden
          >
            <Face card={card} corner />
          </span>
        </>
      )}
    </motion.button>
  );
}
