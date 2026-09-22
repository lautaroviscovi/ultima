/**
 * La superficie de la mesa, dibujada como un objeto.
 *
 * Hasta ahora la mesa era un COLOR DE FONDO (`bg-felt-dark bg-felt`) con
 * elementos posicionados encima. Eso explica las cuatro cosas que se sentian
 * mal a la vez, que en realidad eran una sola:
 *
 * - "Hay mucho espacio vacio" — el espacio entre asientos no era nada, porque
 *   no habia una superficie que lo hiciera ser algo.
 * - "El centro se ve chico y perdido" — el mazo flotaba sobre un fondo, sin
 *   una zona que lo contuviera.
 * - "Los asientos parecen etiquetas" — estaban sobre un fondo, no sentados a
 *   algo.
 *
 * Dibujar el ovalo convierte el vacio en MESA. Es el mismo pixelaje, pero
 * deja de ser ausencia de contenido y pasa a ser superficie.
 *
 * ## Por que estos numeros
 *
 * Este componente NO tiene numeros propios: los toma de `SURFACE`, que vive en
 * `seats.ts` junto al arco que tiene que seguir, medido y con tests.
 *
 * Que la geometria viva alla no es prolijidad. Mientras el paño se calculaba
 * aca, se desincronizo del arco DOS veces sin que nada fallara — los tests de
 * `seats.ts` seguian verdes porque no conocian la mesa. Ahora una sola
 * definicion alimenta al SVG y a `TableSurface.test.ts`, asi que tocar el arco
 * y olvidarse del paño rompe un test en vez de romper la pantalla.
 */
import { SURFACE } from './seats.js';

export function TableSurface(): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/*
        `preserveAspectRatio="none"` a proposito: la mesa tiene que deformarse
        con el contenedor EXACTAMENTE como se deforma el arco de asientos, que
        tambien usa porcentajes en los dos ejes. Una mesa que mantuviera su
        proporcion se despegaria de los asientos en pantallas anchas.
      */}
      <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          {/*
            La luz cae desde arriba, como una lampara sobre una mesa de juego.
            El degrade es MUY sutil (dos pasos de luminosidad) porque su trabajo
            es dar volumen, no llamar la atencion: lo que tiene que resaltar
            son las cartas.
          */}
          <radialGradient id="felt-light" cx="50%" cy="38%" r="70%">
            <stop offset="0%" stopColor="rgb(var(--felt-lit))" />
            <stop offset="100%" stopColor="rgb(var(--felt))" />
          </radialGradient>

          {/*
            El canto, con volumen.

            Un `stroke` de color plano se leia como una LINEA dibujada alrededor
            del ovalo — y en marron oscuro, como una linea roja. La madera
            necesita un degrade vertical: clara donde le pega la luz de arriba,
            oscura abajo. Eso es lo que la hace leerse como canto y no como
            contorno.
          */}
          <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--felt-rail-lit))" />
            <stop offset="55%" stopColor="rgb(var(--felt-rail))" />
            <stop offset="100%" stopColor="rgb(var(--felt-rail-dark))" />
          </linearGradient>
        </defs>

        {/* La sombra que apoya la mesa sobre el piso: sin esto el ovalo se lee
            como un dibujo plano, no como un objeto con canto. */}
        <ellipse
          cx={SURFACE.cx}
          cy={SURFACE.cy + 1.5}
          rx={SURFACE.rx}
          ry={SURFACE.ry}
          fill="rgb(0 0 0 / 0.35)"
        />

        <ellipse
          cx={SURFACE.cx}
          cy={SURFACE.cy}
          rx={SURFACE.rx}
          ry={SURFACE.ry}
          fill="url(#felt-light)"
          stroke="url(#rail)"
          strokeWidth="10"
          vectorEffect="non-scaling-stroke"
        />

        {/*
          El canto interior: una linea fina por dentro del borde, que es lo que
          en una mesa real hace la costura del fieltro contra la madera. Es el
          detalle que la vuelve mesa en vez de ovalo verde.
        */}
        <ellipse
          cx={SURFACE.cx}
          cy={SURFACE.cy}
          rx={SURFACE.rx - 1.3}
          ry={SURFACE.ry - 2}
          fill="none"
          stroke="rgb(255 255 255 / 0.07)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
