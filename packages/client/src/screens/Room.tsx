import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { leaveRoom, resumeSession, startGame } from '../net/commands.js';
import { useGameStore } from '../stores/game.js';
import { useSessionStore } from '../stores/session.js';
import { useConnection } from '../hooks/useGame.js';
import { ConnectionBadge } from '../components/ConnectionBadge.js';

const TARGET_SCORES = [200, 300, 500] as const;

export function Room(): JSX.Element {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const roomId = code.toUpperCase();

  const room = useGameStore((s) => s.room);
  const state = useGameStore((s) => s.state);
  const lastError = useGameStore((s) => s.lastError);
  const connection = useConnection();
  const session = useSessionStore((s) => s.sessions[roomId]);

  const [targetScore, setTargetScore] = useState<number>(500);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  /**
   * Reclamo del asiento al montar. Cubre el refresh (la pestaña vuelve con el
   * token en localStorage) y la vuelta tras una caida de red.
   */
  useEffect(() => {
    if (!session) {
      navigate('/', { replace: true });
      return;
    }
    void resumeSession(roomId).then((res) => {
      if (res && !res.ok) navigate('/', { replace: true });
    });
  }, [roomId, session, navigate]);

  // La partida arranco: a la mesa (fase 5).
  useEffect(() => {
    if (state && state.phase !== 'lobby') navigate(`/room/${roomId}/play`, { replace: true });
  }, [state, roomId, navigate]);

  if (!room) {
    return (
      <main className="min-h-screen bg-felt-dark text-white flex items-center justify-center">
        <p className="text-white/60">Conectando…</p>
      </main>
    );
  }

  const isHost = room.hostId === session?.playerId;
  const canStart = isHost && room.players.length >= 2;

  async function handleStart(): Promise<void> {
    setStarting(true);
    await startGame({ targetScore });
    setStarting(false);
  }

  function copyCode(): void {
    void navigator.clipboard?.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="min-h-screen bg-felt-dark text-white p-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-sm text-white/60">Código de la sala</p>
            <button
              onClick={copyCode}
              title="Copiar"
              className="font-mono text-5xl font-black tracking-[0.2em] hover:text-uno-yellow"
            >
              {roomId}
            </button>
            <p className="text-sm text-white/50 h-5">
              {copied ? 'copiado' : 'tocá para copiar y dictarlo por la llamada'}
            </p>
          </div>
          <ConnectionBadge status={connection} />
        </div>

        <div className="rounded-xl bg-white/5 p-4 mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-bold">
              Jugadores{' '}
              <span className="text-white/50 font-normal">
                {room.players.length}/{room.maxPlayers}
              </span>
            </h2>
            {room.players.length < 2 && (
              <span className="text-sm text-white/50">faltan al menos 2</span>
            )}
          </div>

          <ul className="space-y-1">
            {room.players.map((player) => (
              <li
                key={player.id}
                className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    player.connected ? 'bg-uno-green' : 'bg-white/30'
                  }`}
                />
                <span className="flex-1">{player.nickname}</span>
                {player.id === room.hostId && (
                  <span className="text-xs text-uno-yellow">anfitrión</span>
                )}
                {player.id === session?.playerId && (
                  <span className="text-xs text-white/50">vos</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {isHost && (
          <div className="rounded-xl bg-white/5 p-4 mb-6">
            <p className="font-bold mb-1">Objetivo de puntaje</p>
            {/* Con 10 jugadores una ronda suma 9 manos: 500 puede ser largo. */}
            <p className="text-sm text-white/50 mb-3">
              Con muchos jugadores cada ronda suma bastante. 200 es una partida corta.
            </p>
            <div className="flex gap-2">
              {TARGET_SCORES.map((score) => (
                <button
                  key={score}
                  onClick={() => setTargetScore(score)}
                  className={`rounded-lg px-4 py-2 font-bold ${
                    targetScore === score ? 'bg-uno-yellow text-black' : 'bg-white/10'
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>
        )}

        {lastError && (
          <p role="alert" className="mb-4 rounded-lg bg-uno-red/20 px-4 py-2 text-sm">
            {lastError.message}
          </p>
        )}

        <div className="flex gap-3">
          {isHost ? (
            <button
              onClick={handleStart}
              disabled={!canStart || starting}
              className="flex-1 rounded-lg bg-uno-green py-3 text-lg font-bold
                         hover:brightness-110 disabled:opacity-40"
            >
              {starting ? 'Repartiendo…' : 'Empezar partida'}
            </button>
          ) : (
            <p className="flex-1 rounded-lg bg-white/5 py-3 text-center text-white/60">
              Esperando al anfitrión…
            </p>
          )}
          <button
            onClick={() => {
              void leaveRoom(roomId).then(() => navigate('/'));
            }}
            className="rounded-lg bg-white/10 px-5 py-3 hover:bg-white/20"
          >
            Salir
          </button>
        </div>
      </div>
    </main>
  );
}
