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
  /** Segundos que quedan. Solo se muestra en el asiento en turno. */
  secondsLeft?: number;
  variant?: 'full' | 'compact';
  /**
   * Abierta la ventana para acusarle el ÚLTIMA no cantado.
   *
   * Solo SEÑALA: el boton vive en la barra de mano. Por eso ya no recibe
   * `onCallOut` — el asiento dejo de ser accionable.
   */
  canCallOut?: boolean;
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
  secondsLeft,
  variant = 'full',
  canCallOut = false,
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
      /**
       * DOS señales, no seis.
       *
       * El asiento acumulaba escala + opacidad + fondo + sombra + anillo +
       * color del nombre, todas a la vez. Seis señales simultaneas no son seis
       * veces mas claras: compiten entre si y el ojo no sabe donde mirar.
       *
       * Quedan las dos que funcionan a distancia en una mesa de 10: la escala
       * (que algo CRECE se ve por el rabillo del ojo) y el anillo de progreso,
       * que ademas lleva el tiempo. El resto es ruido.
       */
      animate={{
        scale: isCurrent ? 1.08 : 1,
        opacity: player.abandoned ? 0.3 : 1,
      }}
      transition={SPRING.settle}
      /*
        Una PERSONA sentada, no un chip de UI.
      
        Antes era `w-[7.5rem]` + `rounded-xl` + `bg-sunken`: un rectangulo
        opaco con texto adentro, que es exactamente la forma de una etiqueta.
        Con diez de esos alrededor, la mesa se leia como un tablero de
        controles.
      
        Ahora la placa es una PASTILLA (`rounded-full`) apenas translucida que
        envuelve al avatar y al nombre — la forma de un jugador en una mesa,
        no de un boton. El fondo baja a /25 para que se vea el fieltro por
        debajo: la gente esta SOBRE la mesa, no tapandola.
      */
      className={`relative flex w-[7.5rem] flex-col items-center rounded-[1.75rem] px-2 py-1.5
                  backdrop-blur-[2px] transition-colors
                  ${isCurrent ? 'bg-black/40 ring-1 ring-white/15' : 'bg-black/25'}`}
    >
      {/*
        El foco del turno: UN solo nodo que viaja entre asientos.

        `layoutId` compartido hace que Framer lo mueva de un asiento al otro en
        vez de que cada uno aparezca y desaparezca por su cuenta. Es lo que
        convierte "leer quien tiene el turno" en "ver que el turno se movio".
      */}
      {isCurrent && (
        <motion.span
          layoutId="turn-focus"
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-[2rem] ring-2 ring-brand-accent"
          transition={SPRING.travel}
        />
      )}
      {/* Anillo de progreso: turno y urgencia en un solo elemento. */}
      {isCurrent && (
        <svg className="absolute -inset-1 h-[calc(100%+0.5rem)] w-[calc(100%+0.5rem)]" aria-hidden>
          <rect
            x="1"
            y="1"
            width="calc(100% - 2px)"
            height="calc(100% - 2px)"
            rx="30"
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
      {/*
        El tiempo, junto a quien juega.

        Vivia en el HUD, arriba a la izquierda — lejos de la mano Y del asiento
        activo. El tiempo pertenece a quien tiene el turno, asi que va con el.
      */}
      {isCurrent && secondsLeft !== undefined && secondsLeft <= 15 && (
        <span
          className={`absolute -top-2 right-1 rounded-full px-1.5 text-micro font-bold tabular-nums ${
            secondsLeft <= 5 ? 'bg-intent-urgent text-white' : 'bg-intent-warn text-brand-ink'
          }`}
        >
          {secondsLeft}s
        </span>
      )}

      <div className="flex w-full items-center gap-1">
        {/*
          El avatar manda. Con `size="sm"` competia de igual a igual con el
          nombre truncado, y el resultado era que no ganaba ninguno: habia que
          leer para identificar a alguien. Mas grande, el color se reconoce de
          un vistazo y el nombre pasa a ser confirmacion, no busqueda.
        */}
        <PlayerAvatar
          nickname={player.nickname}
          seat={player.seat}
          size="md"
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
        El asiento SEÑALA que a este jugador se le puede acusar, pero el boton
        vive en la barra de mano (`HandActions`).

        Antes el boton era este overlay, y era la peor ubicacion posible: tu
        atencion esta en tu mano —abajo— y la ventana para acusar dura
        segundos. Mirar arriba, encontrar el asiento y hacer click no entra en
        ese tiempo.

        La señal se queda: es donde mirás para saber A QUIEN.
      */}
      {canCallOut && unoUndeclared && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-[2rem] ring-2 ring-intent-urgent"
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </motion.div>
  );
}
