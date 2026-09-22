import { AnimatePresence, motion } from 'framer-motion';
import type { RedactedGameState } from '@uno/engine';
import { DURATION, SPRING } from '../design/motion.js';
import { useModalFocus } from '../hooks/useModalFocus.js';
import { Confetti } from './Confetti.js';
import { PlayerAvatar } from './PlayerAvatar.js';

export interface RoundOverlayProps {
  state: RedactedGameState;
  isHost: boolean;
  onNextRound?: () => void;
  onLeave?: () => void;
  /**
   * Cuanto sumo el ganador en esta ronda.
   *
   * Viene del evento `ROUND_ENDED`, no del estado — el estado sólo guarda el
   * acumulado. Es opcional porque tras una reconexion el evento ya paso y el
   * overlay tiene que dibujarse igual, sin el "+N".
   */
  roundPoints?: number | null;
}

/**
 * Fin de ronda o de partida.
 *
 * Es el momento que cierra 45 minutos de juego, y hasta la fase 10 aparecia de
 * golpe, sin una sola animacion — ni siquiera importaba framer-motion. Ganar y
 * perder se veian igual salvo dos palabras.
 *
 * Tres distinciones que ahora se ven:
 *
 * 1. **Ganar vs perder.** No es el mismo evento y no puede verse igual.
 * 2. **Fin de ronda vs fin de partida.** Una es un respiro, la otra es el
 *    final. Sólo la segunda lleva confeti: si celebrara cada ronda, para la
 *    tercera ya sería ruido.
 * 3. **El delta.** La tabla mostraba sólo el acumulado, y lo que la gente
 *    busca al terminar la mano es cuánto sumó.
 */
export function RoundOverlay({
  state,
  isHost,
  onNextRound,
  onLeave,
  roundPoints = null,
}: RoundOverlayProps): JSX.Element {
  const isGameOver = state.phase === 'game_over';
  const open = state.phase === 'round_over' || isGameOver;

  /**
   * Sin `onEscape`: este modal NO se cierra con teclado. No es un popup, es el
   * estado del juego — cerrarlo dejaría al jugador mirando una mesa muerta sin
   * forma de seguir. El ColorPicker sí lo pasa, porque ahí cancelar es válido.
   */
  const ref = useModalFocus(open);

  const winnerId = isGameOver ? state.gameWinnerId : state.roundWinnerId;
  const winner = state.players.find((p) => p.id === winnerId);
  const youWon = winnerId === state.you.id;
  const ranked = [...state.players].sort((a, b) => b.score - a.score);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-40 flex items-center justify-center bg-scrim p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.quick }}
        >
          {/* El confeti va FUERA de la tarjeta: cae sobre toda la pantalla. */}
          {isGameOver && youWon && <Confetti />}

          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby="round-overlay-title"
            className={`relative w-full max-w-md rounded-2xl bg-overlay p-6 shadow-modal
                        ${youWon ? 'ring-2 ring-brand-accent/50' : ''}`}
            initial={{ scale: 0.88, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            // `pop` es el único spring con rebote visible del sistema, y está
            // descrito como "celebración". Este es su lugar.
            transition={SPRING.pop}
          >
            <p className="text-center text-mini uppercase tracking-widest text-white/50">
              {isGameOver ? 'Fin de la partida' : `Fin de la ronda ${state.round + 1}`}
            </p>

            <h2
              id="round-overlay-title"
              className={`mb-1 text-center font-display font-black ${
                isGameOver ? 'text-display' : 'text-display-sm'
              } ${youWon ? 'text-brand-accent' : 'text-white'}`}
            >
              {youWon
                ? isGameOver
                  ? '¡Ganaste la partida!'
                  : '¡Ganaste la ronda!'
                : `Ganó ${winner?.nickname ?? '—'}`}
            </h2>

            {/* El delta: lo que la gente busca al cerrarse la mano. */}
            <p className="mb-5 text-center text-body text-white/50">
              {roundPoints !== null && roundPoints > 0
                ? `+${roundPoints} ${roundPoints === 1 ? 'punto' : 'puntos'} esta ronda`
                : `objetivo: ${state.options.targetScore} puntos`}
            </p>

            <ol className="mb-6 space-y-1">
              {ranked.map((player, i) => {
                const isYou = player.id === state.you.id;
                const isWinner = player.id === winnerId;
                return (
                  <motion.li
                    key={player.id}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                      isYou ? 'bg-raised-hover' : 'bg-raised'
                    } ${isWinner ? 'ring-1 ring-brand-accent/40' : ''}`}
                    // Escalonado: la tabla se arma de arriba a abajo en vez de
                    // aparecer entera, que es lo que hace que se lea el orden.
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.12 + i * 0.05, duration: DURATION.quick }}
                  >
                    <span className="w-4 text-center text-mini tabular-nums text-white/40">
                      {i + 1}
                    </span>
                    <PlayerAvatar nickname={player.nickname} seat={player.seat} size="sm" />
                    <span className="flex-1 truncate text-body text-white">{player.nickname}</span>
                    {isWinner && roundPoints !== null && roundPoints > 0 && (
                      <span className="text-mini font-bold tabular-nums text-intent-ok">
                        +{roundPoints}
                      </span>
                    )}
                    <span className="w-10 text-right font-bold tabular-nums text-white">
                      {player.score}
                    </span>
                  </motion.li>
                );
              })}
            </ol>

            <div className="flex gap-3">
              {isGameOver ? (
                <button
                  onClick={onLeave}
                  className="flex-1 rounded-lg bg-raised py-3 font-bold text-white hover:bg-active"
                >
                  Volver al inicio
                </button>
              ) : isHost ? (
                <button
                  onClick={onNextRound}
                  className="flex-1 rounded-lg bg-intent-ok py-3 font-bold text-brand-ink
                             hover:brightness-110"
                >
                  Siguiente ronda
                </button>
              ) : (
                <p className="flex-1 rounded-lg bg-raised py-3 text-center text-body text-white/60">
                  Esperando al anfitrión…
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
