import { AnimatePresence, motion } from 'framer-motion';
import type { RedactedPlayer } from '@uno/engine';

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

function urgencyColor(progress: number): string {
  if (progress > 0.33) return 'stroke-white';
  if (progress > 0.11) return 'stroke-uno-yellow';
  return 'stroke-uno-red';
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
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={`relative flex w-[7.5rem] flex-col items-center rounded-xl px-2 py-1.5
                  ${isCurrent ? 'bg-white/15 shadow-lg shadow-black/40' : 'bg-black/25'}`}
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

      <div className="flex w-full items-center gap-1">
        <span
          className={`truncate text-xs font-bold ${isCurrent ? 'text-white' : 'text-white/75'}`}
          title={player.nickname}
        >
          {player.nickname}
        </span>
        {player.cardCount === 1 && player.hasDeclaredUno && (
          <span className="rounded bg-uno-yellow px-1 text-[0.6rem] font-black text-black">
            UNO
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
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="block h-5 w-2.5 shrink-0 rounded-[2px] border border-white/70 bg-neutral-900"
              style={{ marginLeft: i === 0 ? 0 : '-3px' }}
            />
          ))}
        </AnimatePresence>
        {player.cardCount === 0 && <span className="text-[0.65rem] text-white/50">sin cartas</span>}
      </div>

      <div className="flex w-full items-baseline justify-between text-[0.65rem]">
        <span
          className={`font-bold ${
            player.cardCount === 1
              ? 'text-uno-red'
              : player.cardCount === 2
                ? 'text-uno-yellow'
                : 'text-white/80'
          }`}
        >
          {player.cardCount} {player.cardCount === 1 ? 'carta' : 'cartas'}
        </span>
        {!compact && <span className="text-white/50">{player.score} pts</span>}
      </div>

      {status && <span className="text-[0.6rem] text-white/50">{status}</span>}

      {/*
        La acusacion es un click sobre el jugador, que es donde tu atencion ya
        esta. Con 10 asientos, un boton en otro lado no se encuentra a tiempo.
      */}
      {canCallOut && unoUndeclared && (
        <button
          type="button"
          onClick={() => onCallOut?.(player.id)}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-0.5
                     rounded-xl bg-uno-red text-[0.7rem] font-black leading-none animate-pulse"
        >
          {/* Opaco, no semitransparente: con el nombre translucido detras el
              texto no se lee y el boton no se reconoce como accionable. */}
          <span className="text-[0.6rem] font-normal opacity-90">{player.nickname}</span>
          <span>¡No dijo UNO!</span>
        </button>
      )}
    </motion.div>
  );
}
