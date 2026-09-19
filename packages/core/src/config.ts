import { DEFAULT_OPTIONS, type GameOptions } from '@uno/engine';

export interface ServerConfig {
  port: number;
  clientOrigins: string[];
  reconnectGraceMs: number;
  roomTtlMs: number;
  sweepIntervalMs: number;
  /** Margen para que el aviso de apagado llegue antes de cerrar. */
  shutdownGraceMs: number;
  options: GameOptions;
  isProduction: boolean;
}

export class ConfigError extends Error {}

/** Fuente de variables. En Node es `process.env`; en un Worker, el `env` del fetch. */
export type EnvSource = Record<string, string | undefined>;

function int(env: EnvSource, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new ConfigError(`${name} debe ser un entero, recibio "${raw}"`);
  }
  if (value < min || value > max) {
    throw new ConfigError(`${name} debe estar entre ${min} y ${max}, recibio ${value}`);
  }
  return value;
}

/**
 * Lee y VALIDA la config al arrancar.
 *
 * Fallar al arrancar es mucho mejor que fallar en la primera conexion: un typo
 * en CLIENT_ORIGIN da un error de CORS que desde el navegador se ve como
 * "no conecta" y cuesta media hora encontrar.
 */
export function loadConfig(env: EnvSource): ServerConfig {
  const isProduction = env['NODE_ENV'] === 'production';

  const raw = env['CLIENT_ORIGIN'] ?? (isProduction ? '' : 'http://localhost:5173');
  const clientOrigins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (clientOrigins.length === 0) {
    throw new ConfigError(
      'Falta CLIENT_ORIGIN. En produccion es obligatorio: es la lista exacta de ' +
        'origenes que pueden abrir sockets contra este servidor.',
    );
  }

  for (const origin of clientOrigins) {
    // '*' seria tentador cuando algo no conecta, y es exactamente lo que no
    // hay que hacer: deja que cualquier pagina abra sockets contra el server.
    if (origin === '*') {
      throw new ConfigError("CLIENT_ORIGIN no puede ser '*': hay que listar los origenes exactos.");
    }
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new ConfigError(
        `CLIENT_ORIGIN invalido: "${origin}". Tiene que ser una URL completa, ` +
          'por ejemplo https://uno.vercel.app',
      );
    }
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new ConfigError(
        `CLIENT_ORIGIN debe ser solo el origen, sin path ni query: "${origin}"`,
      );
    }
    if (isProduction && parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
      throw new ConfigError(`En produccion CLIENT_ORIGIN debe ser https: "${origin}"`);
    }
  }

  return {
    port: int(env, 'PORT', 3000, 1, 65535),
    clientOrigins,
    reconnectGraceMs: int(env, 'RECONNECT_GRACE_MS', 120_000, 10_000, 600_000),
    roomTtlMs: int(env, 'ROOM_TTL_MS', 3_600_000, 60_000, 86_400_000),
    sweepIntervalMs: int(env, 'SWEEP_INTERVAL_MS', 10_000, 1_000, 60_000),
    shutdownGraceMs: int(env, 'SHUTDOWN_GRACE_MS', 3_000, 0, 30_000),
    options: {
      ...DEFAULT_OPTIONS,
      targetScore: int(env, 'TARGET_SCORE', DEFAULT_OPTIONS.targetScore, 100, 2000),
      turnTimeoutMs: int(env, 'TURN_TIMEOUT_MS', DEFAULT_OPTIONS.turnTimeoutMs, 10_000, 300_000),
      unoWindowMs: int(env, 'UNO_WINDOW_MS', DEFAULT_OPTIONS.unoWindowMs, 1_000, 15_000),
    },
    isProduction,
  };
}
