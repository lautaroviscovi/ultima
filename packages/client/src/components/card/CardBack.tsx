import { TILT } from './glyphs.js';

/**
 * El dorso de la carta.
 *
 * Estaba DUPLICADO con markup distinto en `Card.tsx` (para las manos ajenas) y
 * en `DiscardPile.tsx` (para el mazo), asi que el mazo y las manos de los
 * demas eran dos dorsos parecidos pero no iguales.
 *
 * Reusa el mismo ovalo de la cara, con la misma inclinacion: un dorso que no
 * comparte geometria con la cara se ve de otro mazo. Es la pieza que ata la
 * identidad.
 *
 * El logotipo va SIN TILDE a proposito. "ÚLTIMA" son seis letras dentro de un
 * ovalo de 90px de ancho como maximo, y la tilde obliga a bajar el cuerpo para
 * dejarle aire arriba, con lo que la palabra pierde presencia justo en la
 * pieza que mas se repite en pantalla. En texto corrido la tilde esta (es lo
 * correcto en español); acá el logotipo es una marca, no una palabra.
 */
export function CardBack({
  className,
  style,
}: {
  className?: string;
  style?: Record<string, string>;
}): JSX.Element {
  return (
    <div
      style={style}
      className={`relative overflow-hidden rounded-[var(--card-radius)] border-2 border-white/80
                  bg-overlay shadow-card ${className ?? ''}`}
      aria-hidden
    >
      <svg
        viewBox="0 0 100 160"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        focusable="false"
      >
        <ellipse
          cx="50"
          cy="78"
          rx="38"
          ry="62"
          fill="rgb(var(--brand-accent))"
          transform={`rotate(${TILT} 50 78)`}
        />
        {/* El logotipo va dentro del SVG para que escale con la carta: en el
            asiento el dorso mide 40px y en el mazo 90, y con texto HTML
            haria falta una escala tipografica por tamaño. */}
        <text
          x="50"
          y="78"
          textAnchor="middle"
          dominantBaseline="central"
          transform={`rotate(${TILT} 50 78)`}
          fill="rgb(var(--brand-ink))"
          /**
           * 14 y no 19: el plan ya anticipaba que seis letras piden más ancho
           * que las cuatro de la palabra que reemplaza, y a 19 la palabra se
           * salía del óvalo por los dos lados. `textLength` la ata al ancho
           * disponible para que no pueda volver a pasar si se cambia la
           * tipografía.
           */
          fontSize="14"
          textLength="58"
          lengthAdjust="spacingAndGlyphs"
          fontWeight="800"
          letterSpacing="0.5"
          style={{ fontFamily: 'Outfit Variable, Outfit Fallback, system-ui, sans-serif' }}
        >
          ULTIMA
        </text>
      </svg>
    </div>
  );
}
