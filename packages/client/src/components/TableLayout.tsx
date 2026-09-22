import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import type { Card as CardModel, CardId, Color, RedactedPlayer } from '@uno/engine';
import { DirectionIndicator } from './DirectionIndicator.js';
import { HandActions } from './HandActions.js';
import { DiscardPile } from './DiscardPile.js';
import { Hand } from './Hand.js';
import { PlayerSeat } from './PlayerSeat.js';
import { AnnouncementLayer, type Announcement } from './Announcement.js';
import { TableSurface } from './TableSurface.js';
import { seatPositions, seatVariant } from './seats.js';

export interface TableLayoutProps {
  /** Oponentes YA rotados: vos sos el origen del arco. */
  opponents: RedactedPlayer[];
  hand: CardModel[];
  playable?: Set<CardId>;
  inFlight?: Set<CardId>;
  currentPlayerId: string | null;
  myId: string;
  discardTop: CardModel | null;
  activeColor: Color;
  drawPileCount: number;
  direction: 1 | -1;
  turnProgress?: number;
  /** Segundos restantes del turno actual. Lo muestra el asiento activo. */
  secondsLeft?: number;
  isMyTurn?: boolean;
  unoWindowFor?: string | null;
  /** Ya cantaste ÚLTIMA y todavia no jugaste. */
  unoArmed?: boolean;
  announcement?: Announcement | null;
  onPlay?: (card: CardModel) => void;
  onDraw?: () => void;
  onCallOut?: (playerId: string) => void;
  onDeclareUno?: () => void;
}

/** Ancho minimo del layout de 10. Por debajo, la mesa no es legible. */
export const MIN_WIDTH = 1100;

export function TableLayout({
  opponents,
  hand,
  playable,
  inFlight,
  currentPlayerId,
  myId,
  discardTop,
  activeColor,
  drawPileCount,
  direction,
  turnProgress = 1,
  secondsLeft,
  isMyTurn = false,
  unoWindowFor = null,
  unoArmed = false,
  announcement = null,
  onPlay,
  onDraw,
  onCallOut,
  onDeclareUno,
}: TableLayoutProps): JSX.Element {
  const positions = seatPositions(opponents.length);
  const variant = seatVariant(opponents.length);
  const aboutToWin = hand.length === 2;

  /**
   * A quien se le puede acusar, con su nombre.
   *
   * El asiento sigue resaltandose —es donde mirás para saber a quién— pero el
   * BOTON baja a la mano. La ventana dura segundos y tu atencion esta abajo.
   */
  const accused = opponents.find((p) => p.id === unoWindowFor && p.cardCount === 1);
  const callOut = accused ? { playerId: accused.id, nickname: accused.nickname } : null;

  return (
    <LayoutGroup>
      <div className="flex h-full min-h-screen flex-col bg-felt-dark">
        {/* Mesa: los oponentes en el arco, el mazo y el descarte al centro. */}
        {/*
          El area del arco NO ocupa toda la pantalla.

          `seats.ts` posiciona en porcentajes del contenedor, asi que achicar
          este div achica la mesa ENTERA —pano y asientos juntos— sin tocar una
          sola constante de la geometria.

          Hace falta porque una mesa que llega a los cuatro bordes vuelve a
          leerse como fondo: para que se lea como un OBJETO tiene que haber
          piso visible alrededor. El padding lateral es mayor que el vertical
          porque el arco es ancho y bajo.
        */}
        <div className="relative flex-1">
          {/*
            `absolute inset-…` y no padding sobre el flex.

            Con padding sobre el contenedor flex, el hijo interior no resolvia
            su altura —`h-full` dentro de un flex sin alto explicito colapsa— y
            los porcentajes de `seats.ts` se calculaban contra casi cero: los
            diez asientos se apilaban arriba, superpuestos.

            Posicionado absoluto contra el padre relative, el area tiene alto
            real y los porcentajes vuelven a significar lo que dicen.
          */}
          <div className="absolute inset-x-[6%] inset-y-[2%]">
            {/*
              La mesa se dibuja ANTES que todo lo demas: es la superficie sobre
              la que se apoyan los asientos y el centro, no una capa encima.
            */}
            <TableSurface />

            <AnimatePresence>
              {opponents.map((player, i) => {
                const pos = positions[i];
                if (!pos) return null;
                return (
                  <motion.div
                    key={player.id}
                    layout
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    animate={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  >
                    <PlayerSeat
                      player={player}
                      isCurrent={player.id === currentPlayerId}
                      turnProgress={turnProgress}
                      {...(secondsLeft !== undefined ? { secondsLeft } : {})}
                      variant={variant}
                      canCallOut={unoWindowFor === player.id}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/*
            El centro va en el centro EXACTO del ovalo (45%, el mismo
            `TABLE_CENTER_Y` que usan los asientos y la superficie), y se apoya
            en una zona marcada del pano.

            Sin la zona, el mazo y el descarte eran dos cartas flotando en un
            area de casi 700px de alto: por eso se leian chicos y perdidos. Lo
            que cambia no es su tamano sino que ahora hay algo DEBAJO que los
            contiene.
          */}
            <div className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2">
              <div className="relative flex flex-col items-center gap-2 rounded-[2.5rem] px-10 py-6">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[2.5rem] bg-black/15
                           shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] ring-1 ring-white/5"
                />
                <DirectionIndicator
                  direction={direction}
                  flash={announcement?.kind === 'reverse'}
                />
                <DiscardPile
                  top={discardTop}
                  activeColor={activeColor}
                  drawPileCount={drawPileCount}
                  canDraw={isMyTurn}
                  {...(onDraw ? { onDraw } : {})}
                />
              </div>
            </div>
          </div>
        </div>

        {/*
          Tu mano NO es un asiento: es UI separada, fija abajo y a tamaño
          completo. Eso libera el borde inferior — el espacio mas valioso — y es
          lo que hace posible el layout de 10.
        */}
        <div
          /*
            Tu LUGAR en la mesa, no un panel aparte.

            El `border-t-2` de lado a lado era una linea que PARTIA la pantalla
            en dos: mesa arriba, UI abajo. Por eso la mano se sentia "lejos y
            desprendida" — visualmente pertenecia a otra cosa.

            Ahora no hay linea. El degrade sube desde el borde inferior y se
            desvanece contra el fieltro, asi que tu sector es el mismo
            continuo que la mesa: es donde estas sentado vos.
          */
          className={`relative -mt-6 bg-gradient-to-t transition-colors duration-300
                      ${
                        isMyTurn
                          ? 'from-black/70 via-black/45 to-transparent'
                          : 'from-black/55 via-black/30 to-transparent'
                      }`}
        >
          {/* Cuando te toca cambia el marco entero: con gente en videollamada la
              atencion esta partida y no se puede asumir que miren la mesa. */}
          {isMyTurn && <div className="pointer-events-none absolute inset-0 shadow-glow-inset" />}

          {/*
            El conteo va al costado y las ACCIONES al centro, sobre las cartas.

            Antes esta fila usaba `justify-between`, que con un minimo de
            1100px dejaba el boton pegado al borde derecho mientras la mano
            esta centrada: cientos de pixeles entre la accion y las cartas.
          */}
          <div className="relative flex items-center justify-center px-6 pt-2">
            <span
              className={`absolute left-6 text-body font-bold ${
                isMyTurn ? 'text-brand-accent' : 'text-white/50'
              }`}
            >
              {isMyTurn ? 'Te toca' : 'Tu mano'}
              <span className="ml-2 font-normal text-white/50">
                {hand.length} {hand.length === 1 ? 'carta' : 'cartas'}
              </span>
            </span>

            <HandActions
              aboutToWin={aboutToWin}
              armed={unoArmed}
              {...(onDeclareUno ? { onDeclareUno } : {})}
              {...(callOut ? { callOut } : {})}
              {...(onCallOut ? { onCallOut } : {})}
            />
          </div>

          <Hand
            cards={hand}
            myTurn={isMyTurn}
            {...(playable ? { playable } : {})}
            {...(inFlight ? { inFlight } : {})}
            {...(onPlay ? { onPlay } : {})}
          />
        </div>

        <AnnouncementLayer announcement={announcement} />

        <span className="sr-only">Sos {myId}</span>
      </div>
    </LayoutGroup>
  );
}
