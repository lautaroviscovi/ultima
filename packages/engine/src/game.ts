import { buildShuffledDeck } from './deck.js';
import { createRng, type Rng } from './rng.js';
import { activePlayers, isPlayable, nextPlayerIndex, scoreRound } from './rules.js';
import { DEFAULT_OPTIONS, type GameOptions, type GameState, type Player } from './state.js';
import {
  GameError,
  type Command,
  type CommandContext,
  type GameEvent,
  type ReduceResult,
} from './commands.js';
import { COLORS, type Card, type Color, type PlayerId } from './types.js';

export const HAND_SIZE = 7;

export interface CreateGameInput {
  roomId: string;
  seed: string;
  players: Array<{ id: PlayerId; nickname: string }>;
  options?: Partial<GameOptions>;
  now?: number;
}

/**
 * El RNG vive fuera del estado serializable, indexado por partida. Un unico
 * stream por partida que avanzan TODOS los consumos, para que el replay
 * (seed, comandos) reproduzca la partida exacta.
 */
const rngs = new Map<string, Rng>();

function rngFor(state: GameState): Rng {
  const key = `${state.roomId}:${state.seed}`;
  let rng = rngs.get(key);
  if (!rng) {
    rng = createRng(state.seed);
    rngs.set(key, rng);
  }
  return rng;
}

/** Libera el stream de una partida terminada. El server lo llama al cerrar la sala. */
export function disposeGame(state: GameState): void {
  rngs.delete(`${state.roomId}:${state.seed}`);
}

export function createGame(input: CreateGameInput): ReduceResult {
  if (input.players.length < 2 || input.players.length > 10) {
    throw new GameError(
      'NOT_ENOUGH_PLAYERS',
      `Se necesitan entre 2 y 10 jugadores, hay ${input.players.length}`,
    );
  }

  const options = { ...DEFAULT_OPTIONS, ...input.options };
  const players: Player[] = input.players.map((p, seat) => ({
    id: p.id,
    nickname: p.nickname,
    seat,
    hand: [],
    connected: true,
    idle: false,
    abandoned: false,
    consecutiveTimeouts: 0,
    hasDeclaredUno: false,
    score: 0,
  }));

  const state: GameState = {
    roomId: input.roomId,
    seed: input.seed,
    round: 0,
    options,
    players,
    drawPile: [],
    discardPile: [],
    activeColor: 'red',
    currentPlayerIndex: 0,
    direction: 1,
    phase: 'lobby',
    pendingDraw: 0,
    drawnCardId: null,
    unoWindow: null,
    turnDeadline: 0,
    roundWinnerId: null,
    gameWinnerId: null,
    version: 0,
  };

  rngs.delete(`${state.roomId}:${state.seed}`);
  return startRound(state, input.now ?? 0);
}

/** Reparte y resuelve la carta inicial. Usado al empezar y entre rondas. */
function startRound(state: GameState, now: number): ReduceResult {
  const rng = rngFor(state);
  const events: GameEvent[] = [];

  const deck = buildShuffledDeck(rng, state.round);
  const players = state.players.map((p) => ({
    ...p,
    hand: [] as Card[],
    hasDeclaredUno: false,
    consecutiveTimeouts: 0,
    idle: false,
  }));

  // De a una carta por ronda en orden de asiento, no 7 de golpe por jugador:
  // asi el replay determinista coincide con la intuicion fisica del reparto.
  let cursor = 0;
  for (let i = 0; i < HAND_SIZE; i++) {
    for (const player of players) {
      if (player.abandoned) continue;
      player.hand.push(deck[cursor++]!);
    }
  }
  events.push({ type: 'CARDS_DEALT', perPlayer: HAND_SIZE });

  // Carta inicial. El wild4 vuelve al mazo y se re-baraja: ES el caso borde que
  // rompe implementaciones, y consume del RNG, asi que el test seedeado lo contempla.
  let remaining = deck.slice(cursor);
  let initial = remaining.shift()!;
  let reshuffles = 0;
  while (initial.kind === 'wild4') {
    remaining = rng.shuffle([...remaining, initial]);
    initial = remaining.shift()!;
    if (++reshuffles > 20) break; // imposible con un mazo legal, pero no colgamos
  }

  let next: GameState = {
    ...state,
    players,
    drawPile: remaining,
    discardPile: [initial],
    activeColor: initial.kind === 'wild' || initial.kind === 'wild4' ? 'red' : initial.color,
    currentPlayerIndex: 0,
    direction: 1,
    phase: 'awaiting_turn',
    pendingDraw: 0,
    drawnCardId: null,
    unoWindow: null,
    roundWinnerId: null,
    version: state.version + 1,
  };

  next = applyInitialCard(next, initial, events);
  next = { ...next, turnDeadline: now + next.options.turnTimeoutMs };
  events.push({ type: 'GAME_STARTED', round: next.round });
  events.push({ type: 'TURN_CHANGED', playerId: next.players[next.currentPlayerIndex]!.id });

  return { state: next, events };
}

/**
 * Efecto de la carta inicial volteada sobre el primer jugador.
 * Ojo con reverse: cambia QUIEN empieza, no solo la direccion. El error comun
 * es invertir la direccion y dejar que juegue el mismo jugador.
 */
function applyInitialCard(state: GameState, card: Card, events: GameEvent[]): GameState {
  switch (card.kind) {
    case 'skip': {
      const skipped = state.players[state.currentPlayerIndex]!;
      events.push({ type: 'PLAYER_SKIPPED', playerId: skipped.id });
      return { ...state, currentPlayerIndex: nextPlayerIndex(state, state.currentPlayerIndex) };
    }
    case 'reverse': {
      const reversed: GameState = { ...state, direction: -1 };
      events.push({ type: 'DIRECTION_REVERSED', direction: -1 });
      // Con la direccion invertida, empieza el ultimo en lugar del primero.
      return { ...reversed, currentPlayerIndex: nextPlayerIndex(reversed, 0) };
    }
    case 'draw2': {
      const target = state.players[state.currentPlayerIndex]!;
      const drawn = drawCards(state, target.id, 2);
      events.push({ type: 'CARDS_DRAWN', playerId: target.id, count: 2, cards: drawn.cards });
      events.push({ type: 'PLAYER_SKIPPED', playerId: target.id });
      return {
        ...drawn.state,
        currentPlayerIndex: nextPlayerIndex(drawn.state, drawn.state.currentPlayerIndex),
      };
    }
    case 'wild':
      // Regla oficial: el primer jugador elige color antes de jugar.
      return { ...state, phase: 'choosing_color' };
    case 'number':
    case 'wild4':
      return state;
  }
}

/** Roba n cartas, re-barajando el descarte si hace falta. */
function drawCards(
  state: GameState,
  playerId: PlayerId,
  n: number,
): { state: GameState; cards: Card[]; reshuffled: number } {
  const rng = rngFor(state);
  let drawPile = [...state.drawPile];
  let discardPile = [...state.discardPile];
  const drawn: Card[] = [];
  let reshuffled = 0;

  for (let i = 0; i < n; i++) {
    if (drawPile.length === 0) {
      // Se toma el descarte MENOS la carta superior.
      if (discardPile.length <= 1) break; // nada que barajar: se roba lo que haya
      const top = discardPile.at(-1)!;
      const rest = discardPile.slice(0, -1);
      // Los wilds vuelven sin color asignado: si el color elegido quedara
      // pegado a la instancia, el reshuffle filtraria informacion.
      const cleaned = rest.map((c) => (c.kind === 'wild' || c.kind === 'wild4' ? { ...c } : c));
      drawPile = rng.shuffle(cleaned);
      discardPile = [top];
      reshuffled = drawPile.length;
    }
    const card = drawPile.shift();
    if (!card) break;
    drawn.push(card);
  }

  const players = state.players.map((p) =>
    p.id === playerId
      ? {
          ...p,
          hand: [...p.hand, ...drawn],
          // El flag se resetea cada vez que el conteo sube por encima de 1.
          hasDeclaredUno: p.hand.length + drawn.length > 1 ? false : p.hasDeclaredUno,
        }
      : p,
  );

  return { state: { ...state, players, drawPile, discardPile }, cards: drawn, reshuffled };
}

function playerIndexById(state: GameState, id: PlayerId): number {
  const index = state.players.findIndex((p) => p.id === id);
  if (index < 0) throw new GameError('PLAYER_NOT_FOUND', `Jugador ${id} no encontrado`);
  return index;
}

function requireTurn(state: GameState, ctx: CommandContext): Player {
  const current = state.players[state.currentPlayerIndex];
  if (!current || !ctx.playerId || current.id !== ctx.playerId) {
    throw new GameError('NOT_YOUR_TURN', 'No es tu turno');
  }
  return current;
}

/**
 * Reducer puro. `reduce(state, command, ctx) -> { state, events }`.
 * Sin I/O, sin Date.now(), sin Math.random(): todo lo no-deterministico entra
 * por `ctx` o por el stream del seed.
 *
 * Una accion ilegal LANZA y no muta nada: el server la traduce a un ack de
 * error dirigido solo al emisor, nunca a un broadcast (seria un canal de
 * filtracion: revelaria que el jugador tiene esa carta).
 */
export function reduce(state: GameState, command: Command, ctx: CommandContext): ReduceResult {
  const events: GameEvent[] = [];
  let next = state;

  switch (command.type) {
    case 'PLAY_CARD': {
      if (next.phase !== 'awaiting_turn') {
        throw new GameError('WRONG_PHASE', `No se puede jugar en fase ${next.phase}`);
      }
      const player = requireTurn(next, ctx);
      const card = player.hand.find((c) => c.id === command.cardId);
      if (!card) throw new GameError('CARD_NOT_IN_HAND', 'Esa carta no esta en tu mano');

      const top = next.discardPile.at(-1) ?? null;
      if (!isPlayable(card, next.activeColor, top)) {
        throw new GameError('ILLEGAL_MOVE', 'Esa carta no es jugable');
      }
      next = playCard(next, player.id, card, command.chosenColor, command.declareUno, ctx, events);
      break;
    }

    case 'DRAW_CARD': {
      if (next.phase !== 'awaiting_turn') {
        throw new GameError('WRONG_PHASE', `No se puede robar en fase ${next.phase}`);
      }
      const player = requireTurn(next, ctx);
      const result = drawCards(next, player.id, 1);
      next = result.state;
      if (result.reshuffled > 0) {
        events.push({ type: 'DECK_RESHUFFLED', count: result.reshuffled });
      }
      events.push({
        type: 'CARDS_DRAWN',
        playerId: player.id,
        count: result.cards.length,
        cards: result.cards,
      });

      const drawn = result.cards[0];
      const top = next.discardPile.at(-1) ?? null;
      if (drawn && isPlayable(drawn, next.activeColor, top)) {
        // Puede jugarla o pasar. No se roba hasta encontrar jugable: eso es house rule.
        next = { ...next, phase: 'card_drawn', drawnCardId: drawn.id };
      } else {
        next = advanceTurn(next, ctx, events);
      }
      break;
    }

    case 'PLAY_DRAWN_CARD': {
      if (next.phase !== 'card_drawn') {
        throw new GameError('WRONG_PHASE', 'No hay una carta recien robada para jugar');
      }
      const player = requireTurn(next, ctx);
      const card = player.hand.find((c) => c.id === next.drawnCardId);
      if (!card) throw new GameError('CARD_NOT_IN_HAND', 'La carta robada ya no esta en tu mano');
      next = { ...next, phase: 'awaiting_turn', drawnCardId: null };
      next = playCard(next, player.id, card, command.chosenColor, command.declareUno, ctx, events);
      break;
    }

    case 'PASS': {
      if (next.phase !== 'card_drawn') {
        throw new GameError('WRONG_PHASE', 'Solo se puede pasar despues de robar');
      }
      requireTurn(next, ctx);
      next = advanceTurn({ ...next, phase: 'awaiting_turn', drawnCardId: null }, ctx, events);
      break;
    }

    case 'CHOOSE_COLOR': {
      if (next.phase !== 'choosing_color') {
        throw new GameError('WRONG_PHASE', 'No hay un color pendiente de elegir');
      }
      const player = requireTurn(next, ctx);
      events.push({ type: 'COLOR_CHOSEN', playerId: player.id, color: command.color });
      next = { ...next, activeColor: command.color, phase: 'awaiting_turn' };
      next = resolvePendingEffect(next, ctx, events);
      break;
    }

    case 'DECLARE_UNO': {
      if (!ctx.playerId) throw new GameError('PLAYER_NOT_FOUND', 'Falta el jugador');
      const index = playerIndexById(next, ctx.playerId);
      const players = [...next.players];
      players[index] = { ...players[index]!, hasDeclaredUno: true };
      events.push({ type: 'UNO_DECLARED', playerId: ctx.playerId });
      next = { ...next, players };
      break;
    }

    case 'CALL_OUT_UNO': {
      if (!ctx.playerId) throw new GameError('PLAYER_NOT_FOUND', 'Falta el jugador');
      const index = playerIndexById(next, command.targetId);
      const target = next.players[index]!;
      // Idempotente: dos acusaciones simultaneas dan UNA sola penalidad.
      const valid =
        target.hand.length === 1 &&
        !target.hasDeclaredUno &&
        next.unoWindow?.playerId === target.id;
      if (valid) {
        const result = drawCards(next, target.id, 2);
        next = { ...result.state, unoWindow: null };
        events.push({
          type: 'UNO_PENALTY',
          playerId: target.id,
          calledBy: ctx.playerId,
          cardsDrawn: result.cards.length,
        });
      }
      // Acusar mal no penaliza al acusador: penalizarlo genera toxicidad.
      break;
    }

    case 'CLOSE_UNO_WINDOW': {
      next = { ...next, unoWindow: null };
      break;
    }

    case 'TIMEOUT': {
      next = applyTimeout(next, ctx, events);
      break;
    }

    case 'DISCONNECT': {
      const index = playerIndexById(next, command.playerId);
      const players = [...next.players];
      players[index] = { ...players[index]!, connected: false };
      events.push({ type: 'PLAYER_CONNECTION', playerId: command.playerId, connected: false });
      // El timer NO se pausa: pausarlo deja que una conexion mala congele a 9.
      next = { ...next, players };
      break;
    }

    case 'RECONNECT': {
      const index = playerIndexById(next, command.playerId);
      const players = [...next.players];
      players[index] = {
        ...players[index]!,
        connected: true,
        idle: false,
        consecutiveTimeouts: 0,
      };
      events.push({ type: 'PLAYER_CONNECTION', playerId: command.playerId, connected: true });
      next = { ...next, players };
      break;
    }

    case 'ABANDON': {
      next = abandonPlayer(next, command.playerId, ctx, events);
      break;
    }

    case 'NEXT_ROUND': {
      if (next.phase !== 'round_over') {
        throw new GameError('WRONG_PHASE', 'La ronda no termino');
      }
      const result = startRound({ ...next, round: next.round + 1 }, ctx.now);
      return { state: { ...result.state, version: next.version + 1 }, events: result.events };
    }

    case 'START_GAME':
      throw new GameError('GAME_ALREADY_STARTED', 'La partida ya empezo');
  }

  return { state: { ...next, version: state.version + 1 }, events };
}

function playCard(
  state: GameState,
  playerId: PlayerId,
  card: Card,
  chosenColor: Color | undefined,
  declareUno: boolean | undefined,
  ctx: CommandContext,
  events: GameEvent[],
): GameState {
  const index = playerIndexById(state, playerId);
  const player = state.players[index]!;
  const hand = player.hand.filter((c) => c.id !== card.id);

  const players = [...state.players];
  players[index] = {
    ...player,
    hand,
    // declareUno viaja en el mismo comando que la jugada a proposito: elimina
    // la carrera de red donde declaras legitimamente pero el paquete llega
    // 40ms tarde. Con 10 jugadores y latencias dispares eso pasa siempre.
    hasDeclaredUno: declareUno === true ? true : player.hasDeclaredUno,
    consecutiveTimeouts: 0,
    idle: false,
  };

  let next: GameState = {
    ...state,
    players,
    discardPile: [...state.discardPile, card],
    drawnCardId: null,
  };

  events.push({ type: 'CARD_PLAYED', playerId, card, ...(chosenColor ? { chosenColor } : {}) });
  if (declareUno === true) events.push({ type: 'UNO_DECLARED', playerId });

  const isWild = card.kind === 'wild' || card.kind === 'wild4';
  const won = hand.length === 0;

  if (isWild) {
    if (won) {
      // Ya gano: no tiene sentido pedirle el color, y si se desconecta en ese
      // instante la partida quedaria colgada esperandolo.
      next = { ...next, activeColor: chosenColor ?? next.activeColor };
    } else if (chosenColor) {
      next = { ...next, activeColor: chosenColor, phase: 'awaiting_turn' };
      events.push({ type: 'COLOR_CHOSEN', playerId, color: chosenColor });
    } else {
      // Sin color: queda pendiente el efecto hasta que elija.
      return { ...next, phase: 'choosing_color' };
    }
  } else {
    next = { ...next, activeColor: card.color };
  }

  return applyCardEffect(next, card, ctx, events);
}

/**
 * ORDEN CRITICO: aplicar efecto -> chequear fin de ronda -> avanzar turno.
 *
 * Si P gana jugando un +2, el siguiente IGUAL roba 2, y esas cartas cuentan
 * para su puntaje. El bug clasico es chequear hand.length === 0 antes de
 * aplicar el efecto y perder esas 2 cartas del conteo.
 */
function applyCardEffect(
  state: GameState,
  card: Card,
  ctx: CommandContext,
  events: GameEvent[],
): GameState {
  let next = state;
  const currentId = next.players[next.currentPlayerIndex]!.id;

  switch (card.kind) {
    case 'reverse': {
      const direction = (next.direction * -1) as 1 | -1;
      next = { ...next, direction };
      events.push({ type: 'DIRECTION_REVERSED', direction });

      // CASO BORDE: con 2 jugadores activos el reverse actua como SKIP.
      // NO sale de la aritmetica: con n=2, avanzar una posicion lleva al otro
      // jugador cualquiera sea el signo de la direccion. Hay que saltear
      // explicitamente para que el que lo jugo vuelva a jugar.
      if (activePlayers(next).length === 2) {
        const skipped = nextPlayerIndex(next, next.currentPlayerIndex);
        events.push({ type: 'PLAYER_SKIPPED', playerId: next.players[skipped]!.id });
        next = { ...next, currentPlayerIndex: skipped };
      }
      break;
    }
    case 'skip': {
      const skipped = nextPlayerIndex(next, next.currentPlayerIndex);
      events.push({ type: 'PLAYER_SKIPPED', playerId: next.players[skipped]!.id });
      next = { ...next, currentPlayerIndex: skipped };
      break;
    }
    case 'draw2':
    case 'wild4': {
      const amount = card.kind === 'draw2' ? 2 : 4;
      const targetIndex = nextPlayerIndex(next, next.currentPlayerIndex);
      const target = next.players[targetIndex]!;
      const result = drawCards(next, target.id, amount);
      next = result.state;
      if (result.reshuffled > 0) {
        events.push({ type: 'DECK_RESHUFFLED', count: result.reshuffled });
      }
      events.push({
        type: 'CARDS_DRAWN',
        playerId: target.id,
        count: result.cards.length,
        cards: result.cards,
      });
      events.push({ type: 'PLAYER_SKIPPED', playerId: target.id });
      next = { ...next, currentPlayerIndex: targetIndex };
      break;
    }
    case 'number':
    case 'wild':
      break;
  }

  const winner = next.players.find((p) => p.id === currentId);
  if (winner && winner.hand.length === 0) {
    return endRound(next, winner.id, events);
  }

  next = openUnoWindowIfNeeded(next, currentId, ctx, events);
  return advanceTurn(next, ctx, events);
}

/** Efecto pendiente de un wild/wild4 al que le faltaba el color. */
function resolvePendingEffect(
  state: GameState,
  ctx: CommandContext,
  events: GameEvent[],
): GameState {
  const top = state.discardPile.at(-1);
  if (!top) return advanceTurn(state, ctx, events);
  if (top.kind === 'wild4') return applyCardEffect(state, top, ctx, events);
  if (top.kind === 'wild') {
    const currentId = state.players[state.currentPlayerIndex]!.id;
    const next = openUnoWindowIfNeeded(state, currentId, ctx, events);
    return advanceTurn(next, ctx, events);
  }
  return advanceTurn(state, ctx, events);
}

/**
 * Ventana de UNO NO bloqueante: el juego sigue avanzando mientras esta abierta.
 * Una fase que frena la partida esperando una acusacion arruina el ritmo con
 * 10 jugadores.
 */
function openUnoWindowIfNeeded(
  state: GameState,
  playerId: PlayerId,
  ctx: CommandContext,
  _events: GameEvent[],
): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.hand.length !== 1 || player.hasDeclaredUno) return state;
  return { ...state, unoWindow: { playerId, closesAt: ctx.now + state.options.unoWindowMs } };
}

function advanceTurn(state: GameState, ctx: CommandContext, events: GameEvent[]): GameState {
  const index = nextPlayerIndex(state, state.currentPlayerIndex);
  const next: GameState = {
    ...state,
    currentPlayerIndex: index,
    phase: 'awaiting_turn',
    drawnCardId: null,
    turnDeadline: ctx.now + state.options.turnTimeoutMs,
  };
  const player = next.players[index];
  if (player) events.push({ type: 'TURN_CHANGED', playerId: player.id });
  return next;
}

function endRound(state: GameState, winnerId: PlayerId, events: GameEvent[]): GameState {
  const points = scoreRound(state, winnerId);
  const players = state.players.map((p) =>
    p.id === winnerId ? { ...p, score: p.score + points } : p,
  );
  events.push({ type: 'ROUND_ENDED', winnerId, points });

  const winner = players.find((p) => p.id === winnerId)!;
  if (winner.score >= state.options.targetScore) {
    events.push({ type: 'GAME_ENDED', winnerId });
    return {
      ...state,
      players,
      phase: 'game_over',
      roundWinnerId: winnerId,
      gameWinnerId: winnerId,
      unoWindow: null,
    };
  }
  return { ...state, players, phase: 'round_over', roundWinnerId: winnerId, unoWindow: null };
}

/**
 * Al expirar el turno: AUTO-ROBAR, nunca auto-jugar. Jugar por alguien puede
 * arruinarle la mano; robar es la accion mas neutra.
 */
function applyTimeout(state: GameState, ctx: CommandContext, events: GameEvent[]): GameState {
  const player = state.players[state.currentPlayerIndex];
  if (!player) return state;
  events.push({ type: 'PLAYER_TIMED_OUT', playerId: player.id });

  const timeouts = player.consecutiveTimeouts + 1;
  const index = state.currentPlayerIndex;
  let next = state;

  if (next.phase === 'choosing_color') {
    // Color determinista del RNG. NO el mas frecuente en la mano: eso filtraria
    // informacion sobre las cartas del jugador.
    const color = rngFor(next).pick(COLORS);
    events.push({ type: 'COLOR_CHOSEN', playerId: player.id, color });
    next = { ...next, activeColor: color, phase: 'awaiting_turn' };
    next = resolvePendingEffect(next, ctx, events);
  } else if (next.phase === 'card_drawn') {
    next = advanceTurn({ ...next, phase: 'awaiting_turn', drawnCardId: null }, ctx, events);
  } else {
    const result = drawCards(next, player.id, 1);
    next = result.state;
    events.push({
      type: 'CARDS_DRAWN',
      playerId: player.id,
      count: result.cards.length,
      cards: result.cards,
    });
    next = advanceTurn(next, ctx, events);
  }

  const players = [...next.players];
  const updated = players[index]!;
  // Tres timeouts seguidos -> idle. Con 10 jugadores esto es esencial: sin
  // esto, una sola persona que se fue a buscar un cafe mata la partida.
  const idle = timeouts >= 3;
  players[index] = { ...updated, consecutiveTimeouts: timeouts, idle };
  if (idle && !updated.idle) events.push({ type: 'PLAYER_IDLE', playerId: player.id });

  return { ...next, players };
}

function abandonPlayer(
  state: GameState,
  playerId: PlayerId,
  ctx: CommandContext,
  events: GameEvent[],
): GameState {
  const index = playerIndexById(state, playerId);
  const player = state.players[index]!;
  if (player.abandoned) return state;

  // Las cartas vuelven barajadas al mazo, con el RNG del stream para no romper
  // el determinismo del replay.
  const rng = rngFor(state);
  const drawPile = rng.shuffle([...state.drawPile, ...player.hand]);

  const players = [...state.players];
  players[index] = { ...player, hand: [], abandoned: true, connected: false };
  events.push({ type: 'PLAYER_ABANDONED', playerId });

  let next: GameState = { ...state, players, drawPile };

  const remaining = activePlayers(next);
  if (remaining.length < 2) {
    const winner = remaining[0];
    if (winner) {
      events.push({ type: 'GAME_ENDED', winnerId: winner.id });
      return { ...next, phase: 'game_over', gameWinnerId: winner.id, unoWindow: null };
    }
    return { ...next, phase: 'game_over', unoWindow: null };
  }

  if (next.currentPlayerIndex === index && next.phase !== 'round_over') {
    next = advanceTurn(next, ctx, events);
  }
  return next;
}
