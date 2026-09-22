import { useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, joinRoom } from '../net/commands.js';
import { useSessionStore } from '../stores/session.js';
import { useFitsTable } from '../hooks/useFitsTable.js';
import { MIN_HEIGHT, MIN_WIDTH } from '../components/TableLayout.js';

/**
 * El campo de texto de esta pantalla.
 *
 * Existe porque el bloque de clases estaba duplicado literal en los dos
 * inputs, y esa es la forma en que dos campos empiezan a divergir sin que
 * nadie lo decida.
 *
 * No lleva `focus:ring` propio: `index.css` ya define un `:focus-visible`
 * global con `--intent-focus`, y dos anillos compitiendo se ven como un bug.
 */
function Field({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return (
    <input
      {...props}
      className={`w-full rounded-lg bg-raised px-4 py-3 text-lead outline-none
                  ring-1 ring-subtle ${className}`}
    />
  );
}

export function Home(): JSX.Element {
  const navigate = useNavigate();
  const nickname = useSessionStore((s) => s.nickname);
  const setNickname = useSessionStore((s) => s.setNickname);
  const sessions = useSessionStore((s) => s.sessions);
  const fitsTable = useFitsTable();

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
        {/* La marca lleva tilde: acá es una palabra, no el logotipo del
            dorso, donde seis letras no entran con el acento. */}
        <h1 className="mb-1 text-center font-display text-display-xl font-black text-brand-accent">
          ÚLTIMA
        </h1>
        <p className="mb-8 text-center text-body text-white/60">hasta 10 jugadores</p>

        {/*
          El aviso va ACA y no en la mesa.
          
          El chequeo de ancho existia solo en `Table`, asi que desde el
          telefono se podia crear la sala, copiar el codigo e invitar gente —
          y el cartel aparecia recien al empezar la partida, cuando ya habia
          cinco personas esperando.

          Es una NOTA, no un bloqueo: crear una sala desde el telefono para que
          otros jueguen es legitimo, y el codigo se dicta por la llamada igual.
        */}
        {!fitsTable && (
          <p className="mb-6 rounded-lg bg-intent-warn/15 px-4 py-3 text-center text-body text-intent-warn">
            Esta pantalla es chica para la mesa, que necesita {MIN_WIDTH}×{MIN_HEIGHT}px. Podés
            crear la sala igual y pasar el código, pero para{' '}
            <strong className="font-bold">jugar</strong> vas a necesitar una ventana más grande.
          </p>
        )}

        <label className="block mb-6">
          <span className="text-body text-white/70">Tu nombre</span>
          <Field
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            placeholder="La dacha de Stalin"
            className="mt-1"
          />
        </label>

        <form onSubmit={handleCreate} className="mb-6">
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-accent py-3 font-display text-lead font-black
                       text-brand-ink hover:brightness-110 disabled:opacity-50"
          >
            Crear sala
          </button>
        </form>

        <div className="mb-6 flex items-center gap-3 text-body text-white/40">
          <div className="h-px flex-1 bg-active" />
          o unite a una
          <div className="h-px flex-1 bg-active" />
        </div>

        <form onSubmit={handleJoin} className="flex gap-2">
          <Field
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="CÓDIGO"
            className="flex-1 font-display uppercase tracking-[0.3em]"
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-lg bg-raised px-6 py-3 text-body font-bold
                       hover:bg-raised-hover disabled:opacity-50"
          >
            Entrar
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-intent-danger/20 px-4 py-2 text-body">
            {error}
          </p>
        )}

        {openRooms.length > 0 && (
          <div className="mt-8">
            <p className="mb-2 text-body text-white/50">Volver a una partida</p>
            {openRooms.map((roomId) => (
              <button
                key={roomId}
                onClick={() => navigate(`/room/${roomId}`)}
                className="mr-2 rounded-lg bg-raised px-4 py-2 font-display tracking-wider hover:bg-active"
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
