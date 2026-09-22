import { AnimatePresence, motion } from 'framer-motion';
import type { RedactedPlayer } from '@uno/engine';
import { SPRING } from '../design/motion.js';
import { PlayerAvatar } from './PlayerAvatar.js';
import { TILT } from './card/glyphs.js';

export interface PlayerSeatProps {
  player: RedactedPlayer;
  isCurrent?: boolean;
  /** Fraccion restante del turno, 0..1. Alimenta el anillo de progreso. */
  turnProgress?: number;
  variant?: 'full' | 'compact';
  /** Abierta la ventana para acusarle el UNO no declarado. */
  canCallOut?: boolean;
  onCallOut?: (playerId: string) => void;
}

/** Hasta 7 dorsos: la longitud del abanico se lee sin contar numeros. */
const MAX_FAN = 7;

/**
 * El anillo del turno comunica URGENCIA, no un color al que se pueda jugar.
 *
 * Usaba `stroke-uno-yellow` / `stroke-uno-red`, que son pigmentos de carta:
 * elegidos para leerse sobre el blanco del ovalo, no sobre el fieltro, y
 * atados al mazo. Si algun dia se cambia el rojo de las cartas, el timer no
 * deberia cambiar con el.
 */
function urgencyColor(progress: number): string {
  if (progress > 0.33) return 'stroke-white';
  if (progress > 0.11) return 'stroke-intent-warn';
  return 'stroke-intent-urgent';
}

export function PlayerSeat({
  player,
  isCurrent = false,
  turnProgress = 1,
  variant = 'full',
  canCallOut = false,
  onCallOut,
}: PlayerSeatProps): JSX.Element {
  const compact = variant === 'compact';
  const unoUndeclared = player.cardCount === 1 && !player.hasDeclaredUno;
  const declaredUno = player.cardCount === 1 && player.hasDeclaredUno;
  const fan = Math.min(player.cardCount, MAX_FAN);

  const status = player.abandoned
    ? 'abandonó'
    : !player.connected
      ? 'desconectado'
      : player.idle
        ? 'ausente'
        : null;

  return (
    <motion.div
      // El movimiento del indicador de un asiento a otro ES en si mismo la
      // señal de que cambio el turno: mas efectivo que cualquier estado
      // estatico con 10 asientos en pantalla.
      animate={{
        scale: isCurrent ? 1.1 : 1,
        opacity: player.abandoned ? 0.3 : isCurrent ? 1 : 0.8,
      }}
      transition={SPRING.settle}
      className={`relative flex w-[7.5rem] flex-col items-center rounded-xl px-2 py-1.5
                  ${isCurrent ? 'bg-raised-hover shadow-lg shadow-black/40' : 'bg-sunken'}`}
    >
      {/* Anillo de progreso: turno y urgencia en un solo elemento. */}
      {isCurrent && (
        <svg className="absolute -inset-1 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)]" aria-hidden>
          <rect
            x="1"
            y="1"
            width="calc(100% - 2px)"
            height="calc(100% - 2px)"
            rx="14"
            fill="none"
            strokeWidth="2"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - turnProgress}
            className={`${urgencyColor(turnProgress)} transition-all duration-1000 ease-linear`}
          />
        </svg>
      )}

      {/*
        El avatar hace el trabajo que el nombre truncado no podia: con 10
        asientos, encontrar a alguien exigia LEER diez nombres. Un color se
        reconoce sin leer.

        Va el MISMO componente que el lobby y la tabla de puntajes: el color de
        una persona no puede cambiar entre pantallas.
      */}
      <div className="flex w-full items-center gap-1">
        <PlayerAvatar
          nickname={player.nickname}
          seat={player.seat}
          size="sm"
          dimmed={player.abandoned || !player.connected}
        />
        {declaredUno ? (
          /*
            Con ÚLTIMA cantado el nombre se va, y no es por falta de espacio:
            medido, quedarian 30px para el nombre — ilegible igual. Lo urgente
            es que a ese jugador le queda UNA carta, y quien es ya lo dice el
            avatar al lado.

            El asiento no se agranda: se quita informacion. Es la regla que el
            plan fijo para este caso exacto.
          */
          <span className="flex-1 truncate rounded bg-brand-accent px-1 text-center font-display text-micro font-black text-brand-ink">
            ÚLTIMA
          </span>
        ) : (
          <span
            className={`truncate text-mini font-bold ${isCurrent ? 'text-white' : 'text-white/75'}`}
            title={player.nickname}
          >
            {player.nickname}
          </span>
        )}
      </div>

      {/* Abanico de dorsos: se lee preatentivamente, sin leer el numero. */}
      <div className="flex h-5 items-center" aria-hidden>
        <AnimatePresence mode="popLayout" initial={false}>
          {Array.from({ length: fan }, (_, i) => (
            <motion.i
              key={i}
              layout
              initial={{ scaleY: 0.4, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              exit={{ scaleY: 0.4, opacity: 0 }}
              transition={SPRING.settle}
              className="block h-5 w-2.5 shrink-0 overflow-hidden rounded-[2px] border
                         border-white/70 bg-overlay"
              style={{ marginLeft: i === 0 ? 0 : '-3px' }}
            >
              {/*
                El ovalo de marca, no el `CardBack` completo.

                Reusar `CardBack` tal cual seria lo natural, pero su logotipo
                va a fontSize 14 sobre un viewBox de 100 de ancho: a los 10px
                que mide este dorso, eso escala a 1.4px — un borron.

                El ovalo si escala, porque es una forma y no texto. Alcanza
                para que el abanico se lea como cartas del MISMO mazo, que es
                todo lo que se le pide a 10px.
              */}
              <svg viewBox="0 0 100 160" className="h-full w-full" preserveAspectRatio="none">
                <ellipse
                  cx="50"
                  cy="78"
                  rx="38"
                  ry="62"
                  fill="rgb(var(--brand-accent))"
                  transform={`rotate(${TILT} 50 78)`}
                />
              </svg>
            </motion.i>
          ))}
        </AnimatePresence>
        {player.cardCount === 0 && <span className="text-micro text-white/50">sin cartas</span>}
      </div>

      <div className="flex w-full items-baseline justify-between text-micro">
        <span
          className={`font-bold ${
            player.cardCount === 1
              ? 'text-intent-urgent'
              : player.cardCount === 2
                ? 'text-intent-warn'
                : 'text-white/80'
          }`}
        >
          {player.cardCount} {player.cardCount === 1 ? 'carta' : 'cartas'}
        </span>
        {!compact && <span className="text-white/50">{player.score} pts</span>}
      </div>

      {status && <span className="text-micro text-white/50">{status}</span>}

      {/*
        La acusacion es un click sobre el jugador, que es donde tu atencion ya
        esta. Con 10 asientos, un boton en otro lado no se encuentra a tiempo.
      */}
      {canCallOut && unoUndeclared && (
        <button
          type="button"
          onClick={() => onCallOut?.(player.id)}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-0.5
                     rounded-xl bg-intent-urgent text-mini font-black leading-none animate-pulse"
        >
          {/* Opaco, no semitransparente: con el nombre translucido detras el
              texto no se lee y el boton no se reconoce como accionable. */}
          <span className="text-micro font-normal opacity-90">{player.nickname}</span>
          <span>¡No dijo ÚLTIMA!</span>
        </button>
      )}
    </motion.div>
  );
}
