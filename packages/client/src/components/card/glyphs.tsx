/**
 * Glifos de carta en SVG.
 *
 * Antes Skip y Reverse eran caracteres Unicode (`&#8416;`, `&#8646;`), y eso
 * significa que el simbolo mas importante de la carta lo elegia la fuente del
 * sistema: distinto en macOS, en Windows y en Linux, y en algunos casos
 * directamente un rectangulo vacio. Un juego de cartas no puede delegar sus
 * palos a la tipografia del que mira.
 *
 * Todos comparten viewBox 100x100 y usan `currentColor`, asi heredan el color
 * del texto de la carta y sirven igual en el EventLog, el ColorPicker o el HUD.
 */

/** El angulo del ovalo. Todo lo que se apoya en el lo comparte. */
export const TILT = -20;

export interface GlyphProps {
  className?: string;
}

/**
 * Bloqueo.
 *
 * La barra va a 45 grados y no horizontal: dentro de un ovalo inclinado -20,
 * una horizontal pelea con la inclinacion y se lee torcida. Los extremos
 * SOBRESALEN del circulo — eso es lo que lo hace leer como "prohibido" y no
 * como un cero tachado.
 */
export function SkipGlyph({ className }: GlyphProps): JSX.Element {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" aria-hidden>
      <circle cx="50" cy="50" r="36" stroke="currentColor" strokeWidth="11" />
      <line
        x1="21"
        y1="79"
        x2="79"
        y2="21"
        stroke="currentColor"
        strokeWidth="11"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Cambio de sentido.
 *
 * Dos flechas espejadas EN PUNTO (rotacion 180), no reflejadas: el gesto que
 * describe un reverse es una vuelta en U, y un reflejo daria dos flechas
 * paralelas, que es otra cosa.
 */
export function ReverseGlyph({ className }: GlyphProps): JSX.Element {
  /**
   * Dos flechas rectas apiladas, apuntando en sentidos opuestos.
   *
   * Se probaron dos versiones con flechas en "U" curvadas y las dos fallaron
   * por el mismo motivo: cada flecha necesitaba el ancho completo, asi que la
   * copia rotada 180 invadia el mismo espacio y ambas se fundian en un borron
   * con forma de "n". Verificado renderizando el glifo a 240px.
   *
   * Apiladas, cada una tiene su franja y la oposicion se lee de inmediato,
   * que es la unica informacion que el simbolo tiene que dar. A 24px en una
   * carta `sm` esto sigue siendo legible; la version curvada no lo era.
   */
  const arrow = (
    <>
      <rect x="26" y="30" width="44" height="11" rx="5" fill="currentColor" />
      <path d="M20 35.5 L38 22 L38 49 Z" fill="currentColor" />
    </>
  );
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      {arrow}
      <g transform="rotate(180 50 50)">{arrow}</g>
    </svg>
  );
}

/**
 * Roba dos.
 *
 * No es el texto "+2": son dos rectangulos de carta superpuestos. Dice "te
 * vienen dos cartas" mucho mejor que un string, que es la informacion que
 * importa cuando la ves del otro lado de la mesa. El "+2" en texto queda solo
 * en las miniaturas de esquina, donde no hay lugar para dibujar.
 */
export function Draw2Glyph({ className }: GlyphProps): JSX.Element {
  /**
   * La carta de atras va HUECA (contorno) y la de adelante llena.
   *
   * Un primer intento las diferenciaba solo por opacidad (0.55 vs 1) y a 64px
   * las dos se fundian en un bloque solido — el simbolo perdia justo la
   * informacion que lo justifica, que son DOS cartas. Verificado renderizando
   * el glifo aislado a 240 y 64px.
   *
   * El hueco tambien deja ver el ovalo blanco por detras, que ayuda a
   * separarlas.
   */
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <rect
        x="16"
        y="24"
        width="40"
        height="56"
        rx="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="9"
        transform="rotate(-12 36 52)"
      />
      <rect
        x="46"
        y="20"
        width="40"
        height="56"
        rx="8"
        fill="currentColor"
        transform="rotate(10 66 48)"
      />
    </svg>
  );
}

/** Los cuatro pigmentos, en el orden de siempre: rojo, azul, amarillo, verde. */
const QUADRANTS = [
  { d: 'M50 50 L50 4 A46 46 0 0 1 96 50 Z', color: 'var(--uno-red)' },
  { d: 'M50 50 L96 50 A46 46 0 0 1 50 96 Z', color: 'var(--uno-blue)' },
  { d: 'M50 50 L50 96 A46 46 0 0 1 4 50 Z', color: 'var(--uno-yellow)' },
  { d: 'M50 50 L4 50 A46 46 0 0 1 50 4 Z', color: 'var(--uno-green)' },
];

/**
 * Comodin: los cuatro colores en un disco partido en cuadrantes.
 *
 * El disco esta inclinado con el MISMO angulo que el ovalo de la carta. Que
 * compartan inclinacion es lo que hace que el comodin se lea como parte del
 * mismo mazo y no como un icono pegado encima.
 */
export function WildGlyph({ className }: GlyphProps): JSX.Element {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <g transform={`rotate(${TILT} 50 50)`}>
        {QUADRANTS.map((q) => (
          <path key={q.color} d={q.d} fill={`rgb(${q.color})`} />
        ))}
        <circle cx="50" cy="50" r="46" fill="none" stroke="#fff" strokeWidth="5" />
      </g>
    </svg>
  );
}

/**
 * Comodin roba cuatro. Es la carta mas poderosa y tiene que pesar mas.
 *
 * Lleva un stroke blanco de 3 unidades que el wild no tiene. Se descarto
 * agrandarlo con un `scale` permanente: rompia la alineacion con el resto del
 * abanico, y una carta que no se apoya en la misma linea se lee como un error
 * de layout, no como enfasis.
 */
export function Wild4Glyph({ className }: GlyphProps): JSX.Element {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <g transform={`rotate(${TILT} 50 50)`}>
        {QUADRANTS.map((q) => (
          <path key={q.color} d={q.d} fill={`rgb(${q.color})`} />
        ))}
        <circle cx="50" cy="50" r="46" fill="none" stroke="#fff" strokeWidth="8" />
      </g>
    </svg>
  );
}
