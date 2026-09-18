import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../stores/game.js';
import { useIsMyTurn, useOpponents, usePlayableCards, useSortedHand } from '../hooks/useGame.js';
import { cardLabel } from '@uno/engine';

/**
 * Placeholder de la mesa. La mesa real (arco de asientos, animaciones) es la
 * fase 5; esto existe para verificar de punta a punta que el estado llega
 * redactado y que los selectores derivados funcionan.
 */
export function Table(): JSX.Element {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const state = useGameStore((s) => s.state);
  const hand = useSortedHand();
  const playable = usePlayableCards();
  const opponents = useOpponents();
  const myTurn = useIsMyTurn();

  if (!state) {
    return (
      <main className="min-h-screen bg-felt-dark text-white flex items-center justify-center">
        <button onClick={() => navigate(`/room/${code}`)} className="text-white/60 underline">
          Volver al lobby
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-felt-dark text-white p-6">
      <p className="mb-4 text-sm text-white/50">
        Mesa provisoria — la mesa real llega en la fase 5
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {opponents.map((p) => (
          <div
            key={p.id}
            className={`rounded-lg px-3 py-2 ${
              p.id === state.currentPlayerId ? 'bg-uno-yellow text-black' : 'bg-white/10'
            }`}
          >
            <div className="font-bold">{p.nickname}</div>
            <div className="text-sm">
              {p.cardCount} cartas · {p.score} pts
            </div>
          </div>
        ))}
      </div>

      <p className="mb-2">
        descarte: <b>{state.discardTop ? cardLabel(state.discardTop) : '—'}</b> · color activo:{' '}
        <b>{state.activeColor}</b> · mazo: {state.drawPileCount}
      </p>
      <p className="mb-4">
        fase: {state.phase} {myTurn && <b className="text-uno-green">· TE TOCA</b>}
      </p>

      <div className="flex flex-wrap gap-2">
        {hand.map((card) => (
          <span
            key={card.id}
            className={`rounded px-3 py-2 ${
              playable.has(card.id) ? 'bg-white text-black font-bold' : 'bg-white/10 text-white/40'
            }`}
          >
            {cardLabel(card)}
          </span>
        ))}
      </div>
    </main>
  );
}
