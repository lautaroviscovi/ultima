import { motion } from 'framer-motion';

/**
 * Celebracion de fin de PARTIDA. Doce piezas con fisica manual.
 *
 * Sin libreria: Framer ya esta, y una dependencia de confeti son ~15KB para
 * doce divs que caen. La fisica es deliberadamente simple — caen, giran y se
 * desvanecen — porque lo que importa es que pase algo, no que sea realista.
 *
 * Respeta `prefers-reduced-motion` por el `MotionConfig` del arbol, igual que
 * el resto: con movimiento reducido las piezas aparecen y desaparecen sin
 * viajar, que es lo correcto para alguien con sensibilidad vestibular.
 */

/** Los mismos tonos de los avatares: es la misma paleta de "gente". */
const COLORS = ['#E8552F', '#4A9EE8', '#E8C04A', '#9B6BD6', '#3FBFA0', '#E86FA8'];

const PIECES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  // Repartidas por el ancho, no al azar: al azar se agrupan y deja huecos.
  left: `${6 + i * 8}%`,
  color: COLORS[i % COLORS.length]!,
  delay: (i % 4) * 0.08,
  drift: i % 2 === 0 ? 40 : -40,
  spin: i % 3 === 0 ? 360 : -280,
}));

export function Confetti(): JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {PIECES.map((piece) => (
        <motion.span
          key={piece.id}
          className="absolute top-0 block h-3 w-2 rounded-[1px]"
          style={{ left: piece.left, backgroundColor: piece.color }}
          initial={{ y: -20, opacity: 0, rotate: 0 }}
          animate={{
            y: ['-20px', '110%'],
            x: [0, piece.drift],
            rotate: [0, piece.spin],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: 2.4,
            delay: piece.delay,
            ease: 'easeIn',
            opacity: { times: [0, 0.1, 0.7, 1], duration: 2.4, delay: piece.delay },
          }}
        />
      ))}
    </div>
  );
}
