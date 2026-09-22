import { useCallback, useEffect } from 'react';
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
import { ColorPicker } from '../components/ColorPicker.js';
import { ConnectionBadge } from '../components/ConnectionBadge.js';
import { ErrorToast } from '../components/ErrorToast.js';
import { EventLog } from '../components/EventLog.js';
import { HudButton } from '../components/HudButton.js';
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
  const [sortMode, setSortMode] = useSortMode();
  useGameSounds();
  const { flights, penalty, roundScore, announcement } = useGameMoments();
  const fitsTable = useFitsTable();

  const colorPickerOpen = useUIStore((s) => s.colorPickerOpen);
  const pendingWildCardId = useUIStore((s) => s.pendingWildCardId);
  const cardsInFlight = useUIStore((s) => s.cardsInFlight);
  const openColorPicker = useUIStore((s) => s.openColorPicker);
  const closeColorPicker = useUIStore((s) => s.closeColorPicker);
  const unoArmed = useUIStore((s) => s.unoArmed);
  const armUno = useUIStore((s) => s.armUno);
  const disarmUno = useUIStore((s) => s.disarmUno);

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
    const unlock = (): void => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

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

      /**
       * `declareUno` sale de lo que el JUGADOR decidio, no de contar cartas.
       *
       * Antes era `hand.length === 2`, o sea que el cliente cantaba solo cada
       * vez que jugabas tu penultima carta. Nunca te podias olvidar — y como
       * el engine solo abre la ventana de acusacion si NO cantaste, esa
       * ventana no se abria jamas: acusar era imposible y el boton ¡ÚLTIMA!
       * era decorativo.
       *
       * Sigue viajando EN el mismo comando que la jugada, que es lo que evita
       * la carrera de red donde cantas y el paquete llega tarde.
       */
      const declaring = unoArmed;
      disarmUno();
      void (fromDrawn
        ? playDrawnCard({ declareUno: declaring })
        : playCard(card.id, { declareUno: declaring }));
    },
    [state, openColorPicker, unoArmed, disarmUno],
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
      const declaring = unoArmed;
      disarmUno();
      void (state.phase === 'card_drawn'
        ? playDrawnCard({ chosenColor: color, declareUno: declaring })
        : playCard(cardId, { chosenColor: color, declareUno: declaring }));
    },
    [pendingWildCardId, closeColorPicker, state, unoArmed, disarmUno],
  );

  const handleDraw = useCallback(() => {
    void drawCard();
  }, []);

  /**
   * Cantar ÚLTIMA.
   *
   * Hace las dos cosas: manda el comando suelto (por si cantas y tardas en
   * jugar) y arma la intencion para que la proxima jugada viaje con
   * `declareUno: true`. Mandar solo el comando dejaria una ventana entre
   * cantar y jugar; armar solo la intencion no cubriria al que canta y despues
   * se toma su tiempo.
   */
  const handleDeclareUno = useCallback(() => {
    armUno();
    void declareUno();
  }, [armUno]);

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
        {/*
          Identidad de la sala a la izquierda, controles a la derecha, los dos
          en una superficie propia.

          Antes eran dos grupos de pildoras sueltas flotando sobre el fieltro,
          y los cuatro botones compartian la clase EXACTA — o sea que "salir",
          la accion destructiva, se veia igual que los toggles.
        */}
        <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full bg-scrim px-2 py-1 backdrop-blur-sm">
          <ConnectionBadge status={connection} />
          <span className="pr-1 font-display text-mini tracking-[0.15em] text-white/50">
            {roomId}
          </span>
        </div>

        <div className="absolute right-4 top-4 z-20 flex items-center gap-1 rounded-full bg-scrim p-1 backdrop-blur-sm">
          <HudButton
            onClick={() =>
              setSortMode(sortMode === 'draw' ? 'color' : sortMode === 'color' ? 'value' : 'draw')
            }
            title="Cambiar el orden de tu mano"
          >
            {sortMode === 'draw' ? 'por robo' : sortMode === 'color' ? 'por color' : 'por valor'}
          </HudButton>

          <HudButton
            onClick={toggleSound}
            pressed={soundEnabled}
            title={soundEnabled ? 'Silenciar' : 'Activar sonido'}
          >
            {soundEnabled ? 'sonido' : 'silencio'}
          </HudButton>

          {/* Separador: lo que sigue NO es un toggle. */}
          <span className="mx-0.5 h-4 w-px bg-white/15" aria-hidden />

          <HudButton onClick={handleLeave} danger title="Salir de la partida">
            salir
          </HudButton>
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
          secondsLeft={timer.secondsLeft}
          isMyTurn={isMyTurn}
          unoWindowFor={unoWindowFor}
          unoArmed={unoArmed}
          announcement={announcement}
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
