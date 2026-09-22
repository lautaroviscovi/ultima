import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import type { Card as CardModel, Color } from '@uno/engine';
import { DURATION } from '../design/motion.js';
import { Card, CARD_WIDTH_PX } from './Card.js';
import { pileJitter } from './card/pile.js';

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

/** Cuantos dorsos se apilan para sugerir volumen sin costar nodos. */
const DECK_LAYERS = 3;
/**
 * Cuantos "fantasmas" se dibujan bajo el tope.
 *
 * NO son las cartas realmente jugadas: `redact()` no manda el historial del
 * descarte, y con razon — esa lista dice exactamente que salio del mazo, que
 * es informacion que ningun jugador deberia poder derivar mirando la mesa.
 *
 * Son bordes anonimos, sin cara. Alcanzan para que el descarte se lea como un
 * monton y no como una carta suelta, que es todo lo que se busca aca.
 */
const GHOSTS = 3;

/** Por debajo de esto el reshuffle es inminente y conviene avisar. */
const LOW_DECK = 5;

/**
 * El centro usa cartas `lg`, del mismo tamaño que las de tu mano.
 *
 * Que el descarte fuera mas chico era al reves de lo que conviene: la carta
 * del tope es el dato mas consultado de la mesa.
 */
const W = CARD_WIDTH_PX.lg;
const SIZE = { width: `${W}px`, height: `${W * 1.6}px`, borderRadius: `${W * 0.09}px` };

export function DiscardPile({
  top,
  activeColor,
  drawPileCount,
  canDraw = false,
  onDraw,
}: DiscardPileProps): JSX.Element {
  const lowDeck = drawPileCount <= LOW_DECK;

  return (
    <div className="flex items-start gap-6">
      {/* ---------------------------------------------------------------
          MAZO. Tres dorsos apilados: el conteo de arriba no dice nada del
          volumen, y "queda poco" tiene que verse antes de leerse.
          --------------------------------------------------------------- */}
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onDraw}
          disabled={!canDraw}
          aria-label={`Robar carta. Quedan ${drawPileCount} en el mazo`}
          className={`relative block ${
            canDraw ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default'
          } transition-transform`}
        >
          {Array.from({ length: DECK_LAYERS - 1 }, (_, i) => (
            <div
              key={i}
              aria-hidden
              className="absolute inset-0"
              style={{ transform: `translate(${(i + 1) * 2}px, ${(i + 1) * 2}px)` }}
            >
              <Card card={PLACEHOLDER} faceDown size="lg" />
            </div>
          ))}
          <div className="relative">
            <Card card={PLACEHOLDER} faceDown size="lg" />
          </div>
        </button>

        {/* Chip, no texto suelto a `-bottom-5`: aquello dependia de que nada
            lo tapara y se rompia al cambiar el alto del contenedor. */}
        <span
          className={`rounded-full px-2 py-0.5 text-micro tabular-nums ${
            lowDeck ? 'bg-intent-warn font-bold text-brand-ink' : 'bg-sunken text-white/70'
          }`}
          // El aviso importa: con el mazo por agotarse viene un rebarajado y
          // conviene saberlo ANTES, no cuando la mesa se congela un instante.
          title={lowDeck ? 'Quedan pocas: se va a rebarajar el descarte' : undefined}
        >
          {drawPileCount}
        </span>
      </div>

      {/* ---------------------------------------------------------------
          DESCARTE. El halo va ACA y no en el contenedor de ambos: el color
          activo describe a que se puede jugar, y eso lo dicta el descarte,
          no el mazo. Que antes envolviera a los dos era un error semantico
          ademas de visual.
          --------------------------------------------------------------- */}
      <div className="flex flex-col items-center gap-2">
        <div
          className="relative shadow-halo transition-[box-shadow]"
          style={
            {
              ...SIZE,
              '--glow-color': GLOW[activeColor],
              transitionDuration: `${DURATION.color}s`,
            } as CSSProperties
          }
        >
          {top ? (
            <>
              {/* Fantasmas: dorsos oscuros sin cara, girados de forma
                  reproducible a partir del id del tope. No llevan `layoutId`
                  — un id repetido entre la pila y la mano hace que Framer crea
                  que es la misma carta y la anime saltando desde la esquina. */}
              {Array.from({ length: GHOSTS }, (_, i) => {
                const j = pileJitter(top.id, i, GHOSTS);
                return (
                  <div
                    key={i}
                    aria-hidden
                    className="absolute inset-0 border-2 border-white/50 bg-overlay shadow-card"
                    style={{
                      borderRadius: SIZE.borderRadius,
                      transform: `translate(${j.x}px, ${j.y}px) rotate(${j.rotate}deg)`,
                      // Los de mas abajo, mas tenues: profundidad sin competir
                      // con la carta que efectivamente hay que leer. El borde
                      // claro es lo que los hace visibles contra el fieltro:
                      // un dorso oscuro sobre fondo oscuro no se distingue.
                      opacity: 0.9 - i * 0.18,
                    }}
                  />
                );
              })}

              {/* El tope SI lleva layoutId (el default): es el que recibe la
                  carta que viaja desde tu mano. */}
              <motion.div className="absolute inset-0" layout>
                <Card card={top} size="lg" />
              </motion.div>
            </>
          ) : (
            <div
              className="h-full w-full border-2 border-dashed border-white/30"
              style={{ borderRadius: SIZE.borderRadius }}
            />
          )}
        </div>

        {/* Alinea la base con el chip del mazo, para que las dos columnas
            terminen a la misma altura. */}
        <span className="h-[1.125rem]" aria-hidden />
      </div>
    </div>
  );
}
