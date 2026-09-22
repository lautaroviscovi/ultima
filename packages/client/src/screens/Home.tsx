import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, joinRoom } from '../net/commands.js';
import { useSessionStore } from '../stores/session.js';

export function Home(): JSX.Element {
  const navigate = useNavigate();
  const nickname = useSessionStore((s) => s.nickname);
  const setNickname = useSessionStore((s) => s.setNickname);
  const sessions = useSessionStore((s) => s.sessions);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openRooms = Object.keys(sessions);

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!nickname.trim()) return setError('Poné tu nombre primero');
    setBusy(true);
    setError(null);
    const res = await createRoom(nickname.trim());
    setBusy(false);
    if (res.ok) navigate(`/room/${res.roomId}`);
    else setError(res.message);
  }

  async function handleJoin(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!nickname.trim()) return setError('Poné tu nombre primero');
    if (code.trim().length < 4) return setError('El código tiene 4 caracteres');
    setBusy(true);
    setError(null);
    const res = await joinRoom(code.trim().toUpperCase(), nickname.trim());
    setBusy(false);
    if (res.ok) navigate(`/room/${res.roomId}`);
    else setError(res.message);
  }

  return (
    <main className="min-h-screen bg-felt-dark text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-5xl font-black tracking-tight text-center mb-1">UNO</h1>
        <p className="text-center text-white/60 mb-8">hasta 10 jugadores</p>

        <label className="block mb-6">
          <span className="text-sm text-white/70">Tu nombre</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="Lautaro"
            className="mt-1 w-full rounded-lg bg-raised px-4 py-3 text-lg outline-none
                       ring-1 ring-white/20 focus:ring-2 focus:ring-uno-yellow"
          />
        </label>

        <form onSubmit={handleCreate} className="mb-6">
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-uno-red py-3 text-lg font-bold
                       hover:brightness-110 disabled:opacity-50"
          >
            Crear sala
          </button>
        </form>

        <div className="flex items-center gap-3 mb-6 text-white/40 text-sm">
          <div className="h-px flex-1 bg-active" />
          o unite a una
          <div className="h-px flex-1 bg-active" />
        </div>

        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="CÓDIGO"
            className="flex-1 rounded-lg bg-raised px-4 py-3 text-lg font-mono tracking-[0.3em]
                       uppercase outline-none ring-1 ring-white/20 focus:ring-2 focus:ring-uno-yellow"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-uno-blue px-6 py-3 font-bold hover:brightness-110
                       disabled:opacity-50"
          >
            Entrar
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-uno-red/20 px-4 py-2 text-sm">
            {error}
          </p>
        )}

        {openRooms.length > 0 && (
          <div className="mt-8">
            <p className="text-sm text-white/50 mb-2">Volver a una partida</p>
            {openRooms.map((roomId) => (
              <button
                key={roomId}
                onClick={() => navigate(`/room/${roomId}`)}
                className="mr-2 rounded-lg bg-raised px-4 py-2 font-mono hover:bg-active"
              >
                {roomId}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
