import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { leaveRoom, resumeSession, startGame } from '../net/commands.js';
import { useGameStore } from '../stores/game.js';
import { useSessionStore } from '../stores/session.js';
import { useConnection } from '../hooks/useGame.js';
import { ConnectionBadge } from '../components/ConnectionBadge.js';
import { PlayerAvatar } from '../components/PlayerAvatar.js';
import { errorCopy } from '../net/errorCopy.js';

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
   * token en sessionStorage) y la vuelta tras una caida de red.
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
            <p className="text-body text-white/60">Código de la sala</p>
            <button
              onClick={copyCode}
              title="Copiar"
              className="font-display text-display-xl font-black tabular-nums tracking-[0.2em]
                         hover:text-brand-accent"
            >
              {roomId}
            </button>
            <p className="h-5 text-body text-white/50">
              {copied ? 'copiado' : 'tocá para copiar y dictarlo por la llamada'}
            </p>
          </div>
          <ConnectionBadge status={connection} />
        </div>

        <div className="mb-6 rounded-xl bg-sunken p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-bold">
              Jugadores{' '}
              <span className="text-white/50 font-normal">
                {room.players.length}/{room.maxPlayers}
              </span>
            </h2>
            {room.players.length < 2 && (
              <span className="text-body text-white/50">faltan al menos 2</span>
            )}
          </div>

          <ul className="space-y-1">
            {room.players.map((player) => (
              <li
                key={player.id}
                className="flex items-center gap-3 rounded-lg bg-raised px-3 py-2"
              >
                {/* El avatar es el MISMO componente que usa la mesa: el color
                    de una persona no puede cambiar entre el lobby y la
                    partida, o se lee como si fueran dos jugadores. */}
                <div className="relative">
                  <PlayerAvatar
                    nickname={player.nickname}
                    seat={player.seat}
                    dimmed={!player.connected}
                  />
                  {/* El dot va SOBRE el avatar, no al lado: es un atributo de
                      esa persona, no un item mas de la fila. */}
                  <span
                    title={player.connected ? 'en línea' : 'sin conexión'}
                    // El anillo recorta el dot contra la fila. Va como
                    // `border` con el color de la superficie de atras:
                    // `ring-sunken` no existe (no hay `ringColor` en la
                    // config) y habria quedado sin recorte, en silencio.
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full
                                border-2 border-[#16301f] ${
                                  player.connected ? 'bg-intent-ok' : 'bg-white/40'
                                }`}
                  />
                </div>
                <span className="flex-1 truncate text-body">{player.nickname}</span>
                {player.id === room.hostId && (
                  <span className="text-mini text-brand-accent">anfitrión</span>
                )}
                {player.id === session?.playerId && (
                  <span className="text-mini text-white/50">vos</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {isHost && (
          <div className="mb-6 rounded-xl bg-sunken p-4">
            <p className="mb-1 font-bold">Objetivo de puntaje</p>
            {/* Con 10 jugadores una ronda suma 9 manos: 500 puede ser largo. */}
            <p className="mb-3 text-body text-white/50">
              Con muchos jugadores cada ronda suma bastante. 200 es una partida corta.
            </p>
            <div className="flex gap-2">
              {TARGET_SCORES.map((score) => (
                <button
                  key={score}
                  onClick={() => setTargetScore(score)}
                  className={`rounded-lg px-4 py-2 font-bold ${
                    targetScore === score
                      ? 'bg-brand-accent text-brand-ink'
                      : 'bg-raised hover:bg-raised-hover'
                  }`}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>
        )}

        {lastError && (
          <p role="alert" className="mb-4 rounded-lg bg-intent-danger/20 px-4 py-2 text-body">
            {errorCopy(lastError.code)}
          </p>
        )}

        <div className="flex gap-3">
          {isHost ? (
            <button
              onClick={handleStart}
              disabled={!canStart || starting}
              className="flex-1 rounded-lg bg-intent-ok py-3 font-display text-lead font-black
                         text-brand-ink hover:brightness-110 disabled:opacity-40"
            >
              {starting ? 'Repartiendo…' : 'Empezar partida'}
            </button>
          ) : (
            <p className="flex-1 rounded-lg bg-raised py-3 text-center text-body text-white/60">
              Esperando al anfitrión…
            </p>
          )}
          <button
            onClick={() => {
              void leaveRoom(roomId).then(() => navigate('/'));
            }}
            className="rounded-lg bg-raised px-5 py-3 text-body hover:bg-raised-hover"
          >
            Salir
          </button>
        </div>
      </div>
    </main>
  );
}
