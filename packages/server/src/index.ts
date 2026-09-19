import { createApp } from './app.js';
import { ConfigError, loadConfig, type ServerConfig } from '@uno/core';
import { createLogger } from './logger.js';

const logger = createLogger();

let config: ServerConfig;
try {
  config = loadConfig(process.env);
} catch (error) {
  // Fallar al arrancar con un mensaje claro es mucho mejor que fallar en la
  // primera conexion con un error de CORS que desde el navegador se ve como
  // "no conecta".
  if (error instanceof ConfigError) {
    logger.error({ err: error.message }, 'configuracion invalida');
    console.error(`\n  Configuración inválida: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

const app = createApp({
  clientOrigins: config.clientOrigins,
  reconnectGraceMs: config.reconnectGraceMs,
  roomTtlMs: config.roomTtlMs,
  sweepIntervalMs: config.sweepIntervalMs,
  options: config.options,
  logger,
});

await app.listen(config.port);
logger.info(
  { port: config.port, clientOrigins: config.clientOrigins, env: process.env['NODE_ENV'] },
  'servidor escuchando',
);

/**
 * Drain al recibir SIGTERM.
 *
 * Las salas viven en memoria, asi que un redeploy mata las partidas en curso.
 * No lo evitamos — es el trade-off asumido de no tener base de datos — pero al
 * menos avisamos en vez de cortar la conexion en silencio, y damos unos
 * segundos para que el mensaje llegue antes de cerrar los sockets.
 */
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  const rooms = app.rooms.size;
  logger.info({ signal, rooms }, 'apagando');
  app.io.emit('server:shutdown', {
    message: 'El servidor se está reiniciando. Volvé a entrar en unos segundos.',
  });

  if (rooms > 0 && config.shutdownGraceMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, config.shutdownGraceMs));
  }

  await app.close();
  logger.info({ signal }, 'apagado limpio');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Un error no capturado deja el proceso en estado indefinido: lo logueamos con
// contexto y salimos para que el supervisor lo reinicie limpio.
process.on('uncaughtException', (error) => {
  logger.error({ err: error.message, stack: error.stack }, 'excepcion no capturada');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason: String(reason) }, 'promesa rechazada sin manejar');
});
