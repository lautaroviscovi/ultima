import type { ProtocolErrorCode } from '@uno/protocol';

/**
 * De codigo de error a frase de jugador.
 *
 * El `code` viaja desde el servidor hasta el cliente en cada ack fallido, y
 * **hasta ahora no se leia**: el toast mostraba `error.message` crudo. Eso hacia
 * que el jugador viera cosas como:
 *
 * - `"No se puede jugar en fase card_drawn"` — el nombre interno de la fase
 * - `"Jugador p_a3f9c210 no encontrado"` — un id interno
 * - `"Invalid discriminator value. Expected 'PLAY_CARD' | 'DRAW_CARD' | ..."` —
 *   la lista completa de comandos del protocolo, en ingles, cortesia de Zod
 * - `"el servidor no respondio"` — un string escrito como log, no como copy
 *
 * El campo `code` existe justamente para esto. El `message` del servidor sigue
 * siendo util para depurar, asi que va a la consola; a la pantalla, nunca.
 */
const COPY: Record<ProtocolErrorCode, string> = {
  // --- Reglas del juego: el jugador hizo algo que no corresponde ---
  NOT_YOUR_TURN: 'Todavía no es tu turno',
  ILLEGAL_MOVE: 'Esa carta no se puede jugar ahora',
  CARD_NOT_IN_HAND: 'Esa carta ya no está en tu mano',
  WRONG_PHASE: 'Ahora no se puede hacer eso',
  COLOR_REQUIRED: 'Elegí un color para el comodín',
  NOT_ENOUGH_PLAYERS: 'Hacen falta al menos 2 jugadores',
  GAME_ALREADY_STARTED: 'La partida ya había empezado',

  /**
   * `PLAYER_NOT_FOUND` es un estado imposible desde el punto de vista del
   * jugador: si pasa, algo se desincronizo. No tiene sentido explicarselo.
   */
  PLAYER_NOT_FOUND: 'Algo se desincronizó. Probá recargar',

  // --- Sala ---
  ROOM_NOT_FOUND: 'Esa sala no existe o ya se cerró',
  ROOM_FULL: 'La sala está llena',
  ROOM_IN_PROGRESS: 'Esa partida ya empezó',
  NICKNAME_TAKEN: 'Ya hay alguien con ese nombre en la sala',
  NOT_IN_ROOM: 'No estás en esta sala',
  NOT_HOST: 'Solo el anfitrión puede hacer eso',

  // --- Sesion ---
  INVALID_TOKEN: 'No pudimos recuperar tu asiento',
  SESSION_TAKEN_OVER: 'Abriste la partida en otra pestaña',

  // --- Tecnicos: el jugador no puede hacer nada con el detalle ---
  INVALID_PAYLOAD: 'Esa acción no se pudo procesar',
  RATE_LIMITED: 'Esperá un momento antes de seguir',
  INTERNAL_ERROR: 'Algo falló. Probá de nuevo',

  /**
   * `STALE_COMMAND` NO deberia llegar nunca a un toast — ver `shouldShow`.
   * La frase esta por completitud del tipo.
   */
  STALE_COMMAND: 'Se actualizó la mesa. Probá de nuevo',
};

/**
 * Los errores que NO merecen un toast.
 *
 * `STALE_COMMAND` es el caso de manual: el servidor lo detecta, **lo resuelve
 * solo** reenviando el estado fresco (`gateway.ts`, `syncOne`), y despues manda
 * el ack fallido igual. Mostrar una alerta roja por algo que el sistema acaba
 * de arreglar es alarmar sin motivo — el jugador ve su mesa actualizarse y un
 * cartel de error al mismo tiempo.
 */
const SILENT: ReadonlySet<string> = new Set<ProtocolErrorCode>(['STALE_COMMAND']);

export function shouldShowError(code: string | undefined): boolean {
  return !code || !SILENT.has(code);
}

/**
 * La frase para el jugador.
 *
 * Ante un codigo desconocido cae a la frase generica en vez de mostrar el
 * mensaje del servidor: si aparece un codigo nuevo, el peor caso es un texto
 * poco especifico — no una fuga de detalle interno.
 */
export function errorCopy(code: string | undefined): string {
  if (code && code in COPY) return COPY[code as ProtocolErrorCode];
  return COPY.INTERNAL_ERROR;
}
