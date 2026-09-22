import { AnimatePresence, motion } from 'framer-motion';
import { DURATION, SPRING } from '../design/motion.js';
import { Draw2Glyph, ReverseGlyph, SkipGlyph } from './card/glyphs.js';

/**
 * Los momentos que merecen taparte la pantalla.
 *
 * La prioridad NO es decorativa: estos eventos **llegan juntos**, y no es un
 * caso raro sino algo que el engine garantiza. Cada +2 y cada +4 emiten
 * `CARDS_DRAWN` y `PLAYER_SKIPPED` en el mismo batch (`game.ts:556-561`), y en
 * una partida de 2 jugadores cada reverse emite ademas un salteo
 * (`game.ts:533-534`).
 *
 * Sin prioridad, un +4 recibido mostraria tres carteles centrados uno encima
 * del otro. Con ella, gana el mas informativo y el resto se descarta — no se
 * encola, porque hacer fila alarga el tiempo en que no podes jugar.
 */
export type AnnouncementKind = 'draw4' | 'draw2' | 'reverse' | 'skipped' | 'uno';

/** Mayor gana. El +4 le gana al salteo que viene en el mismo batch. */
export const ANNOUNCEMENT_PRIORITY: Record<AnnouncementKind, number> = {
  draw4: 5,
  draw2: 4,
  uno: 3,
  reverse: 2,
  skipped: 1,
};

export interface Announcement {
  kind: AnnouncementKind;
  /** Nombre de quien cantó ÚLTIMA. Solo para `uno`. */
  who?: string;
  /** Sentido nuevo. Solo para `reverse`. */
  direction?: 1 | -1;
  /**
   * Cartas del castigo. Solo para `draw2`/`draw4`.
   *
   * Existe por el apilado: antes el tipo de anuncio se deducia contando las
   * cartas robadas (`>= 4` era un +4), lo que con una cadena de +2/+4 mostraba
   * "+4" para un castigo de 8. El cartel tiene que decir lo que vas a robar.
   */
  amount?: number;
}

interface Look {
  text: string;
  /** El color de la CARTA que lo causó, no un token de intención. */
  tone: string;
  tint: string;
  glyph?: (props: { className?: string }) => JSX.Element;
}

function lookFor(a: Announcement): Look {
  switch (a.kind) {
    case 'draw4':
      return {
        text: `+${a.amount ?? 4}`,
        tone: 'text-white',
        tint: 'bg-white/10',
        glyph: Draw2Glyph,
      };
    case 'draw2':
      return {
        text: `+${a.amount ?? 2}`,
        tone: 'text-uno-red',
        tint: 'bg-uno-red/15',
        glyph: Draw2Glyph,
      };
    case 'reverse':
      return {
        text: 'CAMBIO DE SENTIDO',
        tone: 'text-uno-yellow',
        tint: 'bg-uno-yellow/15',
        glyph: ReverseGlyph,
      };
    case 'skipped':
      return {
        text: 'TE SALTEARON',
        tone: 'text-uno-blue',
        tint: 'bg-uno-blue/15',
        glyph: SkipGlyph,
      };
    case 'uno':
      return {
        text: a.who ? `¡${a.who} DIJO ÚLTIMA!` : '¡ÚLTIMA!',
        tone: 'text-brand-accent',
        tint: 'bg-brand-accent/15',
      };
  }
}

/**
 * Un anuncio a pantalla completa.
 *
 * Generaliza lo que antes era `ReverseFlash`: mismo tratamiento —tinte de
 * fondo, cartel centrado con `SPRING.pop`, `pointer-events-none`— pero con el
 * glifo de la carta que lo causó en vez de solo texto.
 *
 * Los colores salen del PIGMENTO de la carta, no de tokens de intención, y es
 * la misma excepción documentada en `ReverseFlash`: el anuncio es el eco de
 * una carta concreta. Si cambiara el rojo del mazo, el del +2 tiene que
 * cambiar con él.
 */
export function AnnouncementLayer({
  announcement,
}: {
  announcement: Announcement | null;
}): JSX.Element {
  const look = announcement ? lookFor(announcement) : null;
  const Glyph = look?.glyph;

  return (
    <AnimatePresence>
      {announcement && look && (
        <motion.div
          key={announcement.kind}
          className="pointer-events-none absolute inset-0 z-announcement flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.quick }}
        >
          <div className={`absolute inset-0 ${look.tint}`} />
          {/*
            Grande de verdad: un anuncio a pantalla completa que se lee como un
            chip no interrumpe nada, y el punto es que interrumpa.
          */}
          <motion.div
            className={`flex items-center gap-5 rounded-3xl bg-scrim px-12 py-7 font-display
                        text-display-xl font-black tracking-tight ${look.tone}`}
            initial={{ scale: 0.5, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={SPRING.pop}
          >
            {Glyph && <Glyph className="h-16 w-16 shrink-0" />}
            <span>{look.text}</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
