import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import type { Card as CardModel, CardId, Color, RedactedPlayer } from '@uno/engine';
import { DirectionIndicator } from './DirectionIndicator.js';
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
  selectedId?: CardId | null;
  inFlight?: Set<CardId>;
  currentPlayerId: string | null;
  myId: string;
  discardTop: CardModel | null;
  activeColor: Color;
  drawPileCount: number;
  direction: 1 | -1;
  turnProgress?: number;
  isMyTurn?: boolean;
  unoWindowFor?: string | null;
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
  selectedId,
  inFlight,
  currentPlayerId,
  myId,
  discardTop,
  activeColor,
  drawPileCount,
  direction,
  turnProgress = 1,
  isMyTurn = false,
  unoWindowFor = null,
  reverseFlash = false,
  onPlay,
  onDraw,
  onCallOut,
  onDeclareUno,
}: TableLayoutProps): JSX.Element {
  const positions = seatPositions(opponents.length);
  const variant = seatVariant(opponents.length);
  const aboutToWin = hand.length === 2;

  return (
    <LayoutGroup>
      <div className="flex h-full min-h-screen flex-col bg-felt-dark">
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
                    variant={variant}
                    canCallOut={unoWindowFor === player.id}
                    {...(onCallOut ? { onCallOut } : {})}
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
                      ${isMyTurn ? 'border-uno-yellow bg-black/40' : 'border-white/10 bg-black/25'}`}
        >
          {/* Cuando te toca cambia el marco entero: con gente en videollamada la
              atencion esta partida y no se puede asumir que miren la mesa. */}
          {isMyTurn && (
            <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_40px_rgba(232,176,0,0.35)]" />
          )}

          <div className="flex items-center justify-between px-6 pt-2">
            <span className={`text-sm font-bold ${isMyTurn ? 'text-uno-yellow' : 'text-white/50'}`}>
              {isMyTurn ? 'Te toca' : 'Tu mano'}
              <span className="ml-2 font-normal text-white/50">
                {hand.length} {hand.length === 1 ? 'carta' : 'cartas'}
              </span>
            </span>

            {/* El boton se ilumina ANTES de quedar en una: declarar junto con la
                jugada elimina la carrera de red que arruina la experiencia. */}
            <button
              type="button"
              onClick={onDeclareUno}
              disabled={!aboutToWin}
              className={`rounded-full px-5 py-1.5 text-sm font-black transition-all
                          ${
                            aboutToWin
                              ? 'bg-uno-yellow text-black animate-pulse'
                              : 'bg-white/10 text-white/30'
                          }`}
            >
              ¡UNO!
            </button>
          </div>

          <Hand
            cards={hand}
            {...(playable ? { playable } : {})}
            selectedId={selectedId ?? null}
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
