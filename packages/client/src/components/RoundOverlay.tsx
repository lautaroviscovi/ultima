import type { RedactedGameState } from '@uno/engine';

export interface RoundOverlayProps {
  state: RedactedGameState;
  isHost: boolean;
  onNextRound?: () => void;
  onLeave?: () => void;
}

/** Fin de ronda o de partida, con la tabla de puntajes. */
export function RoundOverlay({
  state,
  isHost,
  onNextRound,
  onLeave,
}: RoundOverlayProps): JSX.Element | null {
  const isGameOver = state.phase === 'game_over';
  if (state.phase !== 'round_over' && !isGameOver) return null;

  const winnerId = isGameOver ? state.gameWinnerId : state.roundWinnerId;
  const winner = state.players.find((p) => p.id === winnerId);
  const youWon = winnerId === state.you.id;
  const ranked = [...state.players].sort((a, b) => b.score - a.score);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-scrim p-6">
      <div className="w-full max-w-md rounded-2xl bg-overlay p-6 shadow-modal">
        <p className="text-center text-sm uppercase tracking-widest text-white/50">
          {isGameOver ? 'Fin de la partida' : `Fin de la ronda ${state.round + 1}`}
        </p>
        <h2 className="mb-5 text-center text-3xl font-black text-white">
          {youWon ? '¡Ganaste!' : `Ganó ${winner?.nickname ?? '—'}`}
        </h2>

        <ol className="mb-6 space-y-1">
          {ranked.map((player, i) => (
            <li
              key={player.id}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                player.id === state.you.id ? 'bg-raised-hover' : 'bg-raised'
              }`}
            >
              <span className="w-5 text-center text-sm text-white/40">{i + 1}</span>
              <span className="flex-1 truncate text-white">{player.nickname}</span>
              <span className="font-bold text-white">{player.score}</span>
            </li>
          ))}
        </ol>

        <p className="mb-4 text-center text-xs text-white/40">
          objetivo: {state.options.targetScore} puntos
        </p>

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
              className="flex-1 rounded-lg bg-uno-green py-3 font-bold text-white
                         hover:brightness-110"
            >
              Siguiente ronda
            </button>
          ) : (
            <p className="flex-1 rounded-lg bg-raised py-3 text-center text-white/60">
              Esperando al anfitrión…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
