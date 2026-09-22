import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { isWild, type Card, type Color } from '@uno/engine';
import {
  callOutUno,
  chooseColor,
  declareUno,
  drawCard,
  leaveRoom,
  nextRound,
  playCard,
  playDrawnCard,
  resumeSession,
} from '../net/commands.js';
import { useGameStore } from '../stores/game.js';
import { useSessionStore } from '../stores/session.js';
import { useUIStore } from '../stores/ui.js';
import {
  useConnection,
  useIsMyTurn,
  useOpponents,
  usePlayableCards,
  useSortedHand,
  useSortMode,
} from '../hooks/useGame.js';
import { useTurnTimer } from '../hooks/useTurnTimer.js';
import { useEventLog } from '../hooks/useEventLog.js';
import { useGameSounds } from '../hooks/useGameSounds.js';
import { useGameMoments } from '../hooks/useGameMoments.js';
import { useFitsTable } from '../hooks/useFitsTable.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import { unlockAudio } from '../net/sound.js';
import { primeVoice, stopVoice } from '../net/voice.js';
import { ColorPicker } from '../components/ColorPicker.js';
import { ConnectionBadge } from '../components/ConnectionBadge.js';
import { ErrorToast } from '../components/ErrorToast.js';
import { EventLog } from '../components/EventLog.js';
import { RoundOverlay } from '../components/RoundOverlay.js';
import { MIN_WIDTH, TableLayout } from '../components/TableLayout.js';
import { DrawFlightLayer } from '../components/DrawFlight.js';

export function Table(): JSX.Element {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const roomId = code.toUpperCase();

  const state = useGameStore((s) => s.state);
  const room = useGameStore((s) => s.room);
  const lastError = useGameStore((s) => s.lastError);
  const setError = useGameStore((s) => s.setError);
  const session = useSessionStore((s) => s.sessions[roomId]);

  const hand = useSortedHand();
  const playable = usePlayableCards();
  const opponents = useOpponents();
  const isMyTurn = useIsMyTurn();
  const connection = useConnection();
  const timer = useTurnTimer();
  const log = useEventLog();
  const reducedMotion = useReducedMotion();
  const soundEnabled = useUIStore((s) => s.soundEnabled);
  const toggleSound = useUIStore((s) => s.toggleSound);
  const voiceEnabled = useUIStore((s) => s.voiceEnabled);
  const toggleVoice = useUIStore((s) => s.toggleVoice);
  const [sortMode, setSortMode] = useSortMode();
  useGameSounds();
  const { flights, penalty, roundScore } = useGameMoments();
  const fitsTable = useFitsTable();

  const colorPickerOpen = useUIStore((s) => s.colorPickerOpen);
  const pendingWildCardId = useUIStore((s) => s.pendingWildCardId);
  const cardsInFlight = useUIStore((s) => s.cardsInFlight);
  const openColorPicker = useUIStore((s) => s.openColorPicker);
  const closeColorPicker = useUIStore((s) => s.closeColorPicker);

  const [reverseFlash, setReverseFlash] = useState(false);
  const lastDirection = useRef<1 | -1 | null>(null);

  // Sin sesion no hay asiento que reclamar.
  useEffect(() => {
    if (!session) {
      navigate('/', { replace: true });
      return;
    }
    void resumeSession(roomId).then((res) => {
      if (res && !res.ok) navigate('/', { replace: true });
    });
  }, [roomId, session, navigate]);

  // Todavia en lobby: volvemos ahi.
  useEffect(() => {
    if (state?.phase === 'lobby') navigate(`/room/${roomId}`, { replace: true });
  }, [state?.phase, roomId, navigate]);

  // Los navegadores bloquean el audio hasta que hay un gesto del usuario: lo
  // desbloqueamos en el primer click para que el tick de turno ya suene.
  useEffect(() => {
    const unlock = (): void => {
      unlockAudio();
      // Resolver la voz tarda hasta un segundo: se hace acá y no en medio de
      // una jugada.
      primeVoice();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      // Al salir de la mesa no puede quedar una frase hablando sola.
      stopVoice();
    };
  }, []);

  /**
   * El reverse es la jugada que mas confunde en UNO online: cuando cambia la
   * direccion, lo marcamos explicitamente en vez de esperar que lo deduzcan
   * del orden de los turnos.
   */
  useEffect(() => {
    if (!state) return;
    if (lastDirection.current !== null && lastDirection.current !== state.direction) {
      setReverseFlash(true);
      const id = setTimeout(() => setReverseFlash(false), 900);
      return () => clearTimeout(id);
    }
    lastDirection.current = state.direction;
    return;
  }, [state?.direction, state]);

  /**
   * Jugar una carta. Un wild necesita color ANTES de mandarse: el comando
   * viaja con el color elegido en vez de dejar la partida en choosing_color,
   * que seria un round-trip extra.
   */
  const handlePlay = useCallback(
    (card: Card) => {
      if (!state) return;
      const fromDrawn = state.phase === 'card_drawn';

      if (isWild(card)) {
        openColorPicker(card.id);
        return;
      }

      // declareUno va en el MISMO comando que la jugada: eso elimina la carrera
      // de red donde declaras legitimamente pero el paquete llega tarde.
      const declaring = hand.length === 2;
      void (fromDrawn
        ? playDrawnCard({ declareUno: declaring })
        : playCard(card.id, { declareUno: declaring }));
    },
    [state, hand.length, openColorPicker],
  );

  const handleColorPick = useCallback(
    (color: Color) => {
      const cardId = pendingWildCardId;
      closeColorPicker();
      if (!state) return;

      /**
       * Sin carta pendiente, el color lo esta pidiendo el SERVIDOR: pasa cuando
       * la carta inicial volteada es un wild y el primer jugador tiene que
       * elegir antes de jugar. Ahi va el comando CHOOSE_COLOR suelto.
       */
      if (!cardId) {
        void chooseColor(color);
        return;
      }

      // Con carta pendiente, el color viaja EN el mismo comando que la jugada:
      // un round-trip menos y sin pasar por la fase choosing_color.
      const declaring = hand.length === 2;
      void (state.phase === 'card_drawn'
        ? playDrawnCard({ chosenColor: color, declareUno: declaring })
        : playCard(cardId, { chosenColor: color, declareUno: declaring }));
    },
    [pendingWildCardId, closeColorPicker, state, hand.length],
  );

  const handleDraw = useCallback(() => {
    void drawCard();
  }, []);

  const handleDeclareUno = useCallback(() => {
    void declareUno();
  }, []);

  const handleCallOut = useCallback((playerId: string) => {
    void callOutUno(playerId);
  }, []);

  const handleLeave = useCallback(() => {
    void leaveRoom(roomId).then(() => navigate('/'));
  }, [roomId, navigate]);

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-felt-dark text-white/60">
        Conectando…
      </main>
    );
  }

  // Desktop-only por decision de producto: aviso claro en vez de layout roto.
  if (!fitsTable) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-felt-dark p-8 text-center text-white">
        <p className="font-display text-display-sm font-bold">Necesitás una ventana más ancha</p>
        <p className="max-w-sm text-white/60">
          La mesa de hasta 10 jugadores necesita al menos {MIN_WIDTH}px para que se lea bien.
          Agrandá la ventana o pasá a una pantalla más grande.
        </p>
      </main>
    );
  }

  const isHost = room?.hostId === session?.playerId;
  const unoWindowFor =
    state.unoWindow && state.unoWindow.playerId !== state.you.id ? state.unoWindow.playerId : null;

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      <main className="relative min-h-screen bg-felt-dark">
        {/* Castigo (+2/+4): marco rojo, no un toast. Lo que comunica es "esto
            te pasa A VOS", y un borde perimetral se percibe sin leer nada —
            que es lo que hace falta con la atencion partida en una llamada. */}
        <AnimatePresence>
          {penalty > 0 && (
            <motion.div
              key="penalty-flash"
              className="pointer-events-none absolute inset-0 z-30 shadow-glow-inset"
              style={{ '--glow-color': 'var(--intent-urgent)' } as Record<string, string>}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, times: [0, 0.12, 0.7, 1] }}
            />
          )}
        </AnimatePresence>
        <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
          <ConnectionBadge status={connection} />
          <span className="rounded-full bg-sunken px-3 py-1 font-display text-mini tracking-wider text-white/60">
            {roomId}
          </span>
          {isMyTurn && timer.secondsLeft <= 15 && (
            <span
              className={`rounded-full px-3 py-1 text-mini font-bold tabular-nums ${
                timer.secondsLeft <= 5
                  ? 'bg-intent-urgent text-white'
                  : 'bg-intent-warn text-brand-ink'
              }`}
            >
              {timer.secondsLeft}s
            </span>
          )}
        </div>

        <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
          <button
            onClick={() =>
              setSortMode(sortMode === 'draw' ? 'color' : sortMode === 'color' ? 'value' : 'draw')
            }
            className="rounded-full bg-sunken px-3 py-1 text-mini text-white/70 hover:bg-scrim"
          >
            orden: {sortMode === 'draw' ? 'robo' : sortMode === 'color' ? 'color' : 'valor'}
          </button>
          <button
            onClick={toggleSound}
            aria-pressed={soundEnabled}
            title={soundEnabled ? 'Silenciar' : 'Activar sonido'}
            className="rounded-full bg-sunken px-3 py-1 text-mini text-white/70 hover:bg-scrim"
          >
            {soundEnabled ? 'sonido' : 'silencio'}
          </button>
          <button
            onClick={() => {
              toggleVoice();
              // Si la estás apagando, callá lo que esté diciendo ahora.
              if (voiceEnabled) stopVoice();
            }}
            aria-pressed={voiceEnabled}
            title={voiceEnabled ? 'Silenciar la voz' : 'Activar la voz'}
            className="rounded-full bg-sunken px-3 py-1 text-mini text-white/70 hover:bg-scrim"
          >
            voz: {voiceEnabled ? 'sí' : 'no'}
          </button>
          <button
            onClick={handleLeave}
            className="rounded-full bg-sunken px-3 py-1 text-mini text-white/70 hover:bg-scrim"
          >
            salir
          </button>
        </div>

        <TableLayout
          opponents={opponents}
          hand={hand}
          playable={playable}
          inFlight={cardsInFlight}
          currentPlayerId={state.currentPlayerId}
          myId={state.you.id}
          discardTop={state.discardTop}
          activeColor={state.activeColor}
          drawPileCount={state.drawPileCount}
          direction={state.direction}
          turnProgress={timer.progress}
          isMyTurn={isMyTurn}
          unoWindowFor={unoWindowFor}
          reverseFlash={reverseFlash}
          onPlay={handlePlay}
          onDraw={handleDraw}
          onCallOut={handleCallOut}
          onDeclareUno={handleDeclareUno}
        />

        <EventLog entries={log} />

        {/*
          Se abre por dos caminos: clickeaste un wild (pendingWildCardId), o el
          servidor esta en choosing_color y te toca a vos — que pasa cuando la
          carta inicial volteada es un wild. Sin el segundo, la partida quedaria
          colgada esperando un color que nadie puede mandar.
        */}
        <ColorPicker
          open={colorPickerOpen || (state.phase === 'choosing_color' && isMyTurn)}
          onPick={handleColorPick}
          {...(colorPickerOpen ? { onCancel: closeColorPicker } : {})}
        />

        <RoundOverlay
          state={state}
          roundPoints={roundScore?.points ?? null}
          isHost={Boolean(isHost)}
          onNextRound={() => void nextRound()}
          onLeave={handleLeave}
        />

        <ErrorToast error={lastError} onDismiss={() => setError(null)} />

        {/* Fuera del LayoutGroup de TableLayout a proposito: el vuelo es un
            nodo independiente y no debe compartir contexto de layout con las
            cartas de la mano. */}
        <DrawFlightLayer flights={flights} />
      </main>
    </MotionConfig>
  );
}
