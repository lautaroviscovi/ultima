import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import type { Card as CardModel, CardId, Color, RedactedPlayer } from '@uno/engine';
import { DirectionIndicator } from './DirectionIndicator.js';
import { HandActions } from './HandActions.js';
import { DiscardPile } from './DiscardPile.js';
import { Hand } from './Hand.js';
import { PlayerSeat } from './PlayerSeat.js';
import { ReverseFlash } from './ReverseFlash.js';
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
  reverseFlash?: boolean;
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
  reverseFlash = false,
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
      <div className="flex h-full min-h-screen flex-col bg-felt-dark bg-felt">
        {/* Mesa: los oponentes en el arco, el mazo y el descarte al centro. */}
        <div className="relative flex-1">
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

          <div className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2">
            <div className="flex flex-col items-center gap-2">
              <DirectionIndicator direction={direction} flash={reverseFlash} />
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

        {/*
          Tu mano NO es un asiento: es UI separada, fija abajo y a tamaño
          completo. Eso libera el borde inferior — el espacio mas valioso — y es
          lo que hace posible el layout de 10.
        */}
        <div
          className={`relative border-t-2 transition-colors duration-300
                      ${isMyTurn ? 'border-brand-accent bg-scrim' : 'border-subtle bg-sunken'}`}
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

        <ReverseFlash show={reverseFlash} direction={direction} />

        <span className="sr-only">Sos {myId}</span>
      </div>
    </LayoutGroup>
  );
}
