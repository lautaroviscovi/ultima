import { DEFAULT_OPTIONS } from '@uno/engine';
import { createApp } from './app.js';
import { createLogger } from './logger.js';

const logger = createLogger();

const port = Number(process.env['PORT'] ?? 3000);
const clientOrigins = (process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const app = createApp({
  clientOrigins,
  logger,
  reconnectGraceMs: Number(process.env['RECONNECT_GRACE_MS'] ?? 120_000),
  roomTtlMs: Number(process.env['ROOM_TTL_MS'] ?? 3_600_000),
  options: {
    ...DEFAULT_OPTIONS,
    turnTimeoutMs: Number(process.env['TURN_TIMEOUT_MS'] ?? DEFAULT_OPTIONS.turnTimeoutMs),
  },
});

await app.listen(port);
logger.info({ port, clientOrigins }, 'servidor escuchando');

/**
 * Drain al recibir SIGTERM. Las salas viven en memoria: avisamos a los
 * jugadores en vez de cortarles la partida en silencio.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal, rooms: app.rooms.size }, 'apagando');
  app.io.emit('server:shutdown', { message: 'El servidor se esta reiniciando' });
  await app.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
