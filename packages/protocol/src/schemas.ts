import { z } from 'zod';

/**
 * Schemas zod para TODO lo que entra por el borde de la red.
 *
 * El engine asume entrada bien formada; garantizarlo es trabajo de esta capa.
 * Los tipos TS se infieren desde los schemas (z.infer), no se declaran aparte:
 * una sola fuente, para que no puedan desincronizarse.
 */

export const colorSchema = z.enum(['red', 'yellow', 'green', 'blue']);

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, 'El nombre no puede estar vacio')
  .max(20, 'El nombre no puede superar los 20 caracteres');

/** Codigo de sala: mayusculas sin caracteres ambiguos. Se dicta por voz en la videollamada. */
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4,6}$/, 'Codigo de sala invalido');

export const playerTokenSchema = z.string().min(16).max(64);
export const cardIdSchema = z.string().min(1).max(32);

export const gameOptionsSchema = z.object({
  // 100 como minimo: con 10 jugadores una sola ronda puede pasar los 200 puntos.
  targetScore: z.number().int().min(100).max(2000),
  turnTimeoutMs: z.number().int().min(10_000).max(300_000),
  unoWindowMs: z.number().int().min(1_000).max(15_000),
});

/**
 * SOLO los comandos que un jugador puede originar.
 *
 * Deliberadamente NO incluye TIMEOUT, DISCONNECT, RECONNECT, ABANDON,
 * CLOSE_UNO_WINDOW ni NEXT_ROUND: esos los emite el servidor. Un cliente que
 * pudiera mandar ABANDON con el playerId de otro tendria un vector de griefing
 * trivial, y uno que pudiera mandar TIMEOUT saltearia turnos ajenos.
 *
 * El playerId NUNCA viaja en el comando: el servidor lo deriva del socket
 * autenticado. Si viniera del cliente seria suplantacion de identidad.
 */
export const playerCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('PLAY_CARD'),
    cardId: cardIdSchema,
    chosenColor: colorSchema.optional(),
    declareUno: z.boolean().optional(),
  }),
  z.object({ type: z.literal('DRAW_CARD') }),
  z.object({
    type: z.literal('PLAY_DRAWN_CARD'),
    chosenColor: colorSchema.optional(),
    declareUno: z.boolean().optional(),
  }),
  z.object({ type: z.literal('PASS') }),
  z.object({ type: z.literal('CHOOSE_COLOR'), color: colorSchema }),
  z.object({ type: z.literal('DECLARE_UNO') }),
  z.object({ type: z.literal('CALL_OUT_UNO'), targetId: z.string().min(1).max(64) }),
]);

export type PlayerCommand = z.infer<typeof playerCommandSchema>;

/** Sobre del comando: lleva la secuencia y la version esperada. */
export const commandEnvelopeSchema = z.object({
  command: playerCommandSchema,
  /** Monotonico por cliente. Correlaciona ack con comando y descarta reintentos. */
  clientSeq: z.number().int().nonnegative(),
  /** Si no coincide con la del servidor -> STALE_COMMAND + resync. */
  expectedVersion: z.number().int().nonnegative().optional(),
});

export const createRoomSchema = z.object({
  nickname: nicknameSchema,
  options: gameOptionsSchema.partial().optional(),
});

export const joinRoomSchema = z.object({
  roomId: roomCodeSchema,
  nickname: nicknameSchema,
});

export const resumeSessionSchema = z.object({
  roomId: roomCodeSchema,
  playerToken: playerTokenSchema,
});

export const startGameSchema = z.object({
  options: gameOptionsSchema.partial().optional(),
});

export type CreateRoomPayload = z.infer<typeof createRoomSchema>;
export type JoinRoomPayload = z.infer<typeof joinRoomSchema>;
export type ResumeSessionPayload = z.infer<typeof resumeSessionSchema>;
export type StartGamePayload = z.infer<typeof startGameSchema>;
export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;
