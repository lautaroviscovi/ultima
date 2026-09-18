import type { CardId, Color } from '@uno/engine';
import type { Ack, JoinResult, PlayerCommand, ResumeResult } from '@uno/protocol';
import { useGameStore } from '../stores/game.js';
import { useSessionStore } from '../stores/session.js';
import { useUIStore } from '../stores/ui.js';
import { connect, emitWithAck } from './socket.js';
import { registerListeners } from './listeners.js';

/** Monotonico por cliente: correlaciona ack con comando y descarta reintentos. */
let clientSeq = 0;

function ensureConnected(): void {
  connect();
  registerListeners();
}

export async function createRoom(
  nickname: string,
  options?: { targetScore?: number },
): Promise<Ack<JoinResult>> {
  ensureConnected();
  const res = await emitWithAck<Ack<JoinResult>>('room:create', { nickname, options });
  if (res.ok) {
    useSessionStore.getState().remember(res.roomId, res.playerToken, res.playerId);
    useGameStore.getState().applyRoom(res.room);
  } else {
    useGameStore.getState().setError(res);
  }
  return res;
}

export async function joinRoom(roomId: string, nickname: string): Promise<Ack<JoinResult>> {
  ensureConnected();
  const res = await emitWithAck<Ack<JoinResult>>('room:join', { roomId, nickname });
  if (res.ok) {
    useSessionStore.getState().remember(res.roomId, res.playerToken, res.playerId);
    useGameStore.getState().applyRoom(res.room);
  } else {
    useGameStore.getState().setError(res);
  }
  return res;
}

/**
 * Reclama el asiento con el token guardado. Se llama al entrar a /room/:code
 * si hay sesion: cubre el refresh y la vuelta tras una caida de red.
 */
export async function resumeSession(roomId: string): Promise<Ack<ResumeResult> | null> {
  const session = useSessionStore.getState().sessionFor(roomId);
  if (!session) return null;

  ensureConnected();
  const res = await emitWithAck<Ack<ResumeResult>>('session:resume', {
    roomId,
    playerToken: session.playerToken,
  });

  if (res.ok) {
    useGameStore.getState().applyRoom(res.room);
    if (res.state) useGameStore.getState().applySync(res.state);
  } else {
    // Sala muerta o token invalido: limpiamos y volvemos al home. Nada peor
    // que un cliente atascado reintentando contra una sala fantasma.
    useSessionStore.getState().forget(roomId);
    useGameStore.getState().setError(res);
  }
  return res;
}

export async function startGame(options?: { targetScore?: number }): Promise<Ack> {
  const res = await emitWithAck<Ack>('game:start', { options });
  if (!res.ok) useGameStore.getState().setError(res);
  return res;
}

export async function nextRound(): Promise<Ack> {
  const res = await emitWithAck<Ack>('game:nextRound');
  if (!res.ok) useGameStore.getState().setError(res);
  return res;
}

export async function leaveRoom(roomId: string): Promise<void> {
  await emitWithAck<Ack>('room:leave');
  useSessionStore.getState().forget(roomId);
  useGameStore.getState().reset();
  useUIStore.getState().reset();
}

/**
 * Manda un comando de juego.
 *
 * En el camino feliz NO tocamos el estado de juego: el state:patch que llega
 * despues es la verdad. Eso es la autoridad del servidor expresada en codigo.
 * Lo unico que hacemos localmente es el optimismo VISUAL (cardsInFlight).
 */
async function sendCommand(
  command: PlayerCommand,
  inFlight?: CardId,
): Promise<Ack<{ version: number; clientSeq: number }>> {
  const ui = useUIStore.getState();
  if (inFlight) ui.markInFlight(inFlight);

  const expectedVersion = useGameStore.getState().state?.version;
  const res = await emitWithAck<Ack<{ version: number; clientSeq: number }>>('game:command', {
    command,
    clientSeq: ++clientSeq,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  });

  if (!res.ok) {
    // Rechazado: la carta vuelve a la mano.
    if (inFlight) ui.unmarkInFlight(inFlight);
    useGameStore.getState().setError(res);
  }
  return res;
}

export function playCard(
  cardId: CardId,
  opts: { chosenColor?: Color; declareUno?: boolean } = {},
): Promise<Ack<{ version: number; clientSeq: number }>> {
  return sendCommand(
    {
      type: 'PLAY_CARD',
      cardId,
      ...(opts.chosenColor !== undefined ? { chosenColor: opts.chosenColor } : {}),
      ...(opts.declareUno !== undefined ? { declareUno: opts.declareUno } : {}),
    },
    cardId,
  );
}

export function playDrawnCard(
  opts: { chosenColor?: Color; declareUno?: boolean } = {},
): Promise<Ack<{ version: number; clientSeq: number }>> {
  return sendCommand({
    type: 'PLAY_DRAWN_CARD',
    ...(opts.chosenColor !== undefined ? { chosenColor: opts.chosenColor } : {}),
    ...(opts.declareUno !== undefined ? { declareUno: opts.declareUno } : {}),
  });
}

export const drawCard = () => sendCommand({ type: 'DRAW_CARD' });
export const pass = () => sendCommand({ type: 'PASS' });
export const chooseColor = (color: Color) => sendCommand({ type: 'CHOOSE_COLOR', color });
export const declareUno = () => sendCommand({ type: 'DECLARE_UNO' });
export const callOutUno = (targetId: string) => sendCommand({ type: 'CALL_OUT_UNO', targetId });
