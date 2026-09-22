import { TILT } from './glyphs.js';

/**
 * El ovalo blanco: el rasgo que define visualmente a la carta.
 *
 * Antes era `absolute inset-[12%] rounded-[50%] bg-white/25 rotate-[-30deg]`,
 * con tres problemas:
 *
 * 1. Semitransparente al 25%, asi que dejaba pasar el color de la cara y se
 *    veia sucio en vez de blanco.
 * 2. `inset-%` mas el ratio de la carta hacian que su proporcion cambiara
 *    entre tamaños: el ovalo del dorso chico no era el mismo ovalo.
 * 3. Opticamente descentrado.
 *
 * En SVG las tres se resuelven de una: el viewBox fija la proporcion
 * independientemente del tamaño renderizado, que es el mismo motivo por el que
 * arregla los cuadrantes del wild.
 *
 * Detalles de dibujo:
 * - `-20` y no `-30`: a 30 las puntas se acercan demasiado a las esquinas y se
 *   comen el espacio de las miniaturas.
 * - `cy=78` y no 80: la rotacion negativa corre la masa visual hacia
 *   abajo-derecha, y subir el centro dos unidades lo compensa.
 * - Opacidad 0.92, no 0.25: blanco casi opaco. El leve pasaje de color es lo
 *   que evita que se vea como una etiqueta pegada.
 */
export function CardOval({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      viewBox="0 0 100 160"
      className={className}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <ellipse
        cx="50"
        cy="78"
        rx="38"
        ry="62"
        fill="#fff"
        opacity="0.92"
        transform={`rotate(${TILT} 50 78)`}
      />
    </svg>
  );
}
