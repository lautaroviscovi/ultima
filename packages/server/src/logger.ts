import pino from 'pino';

export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/**
 * Siempre con roomId y seed en el contexto: es lo que convierte un bug
 * reportado ("se colgo la partida") en un test de regresion reproducible,
 * porque una partida es funcion de (seed, comandos).
 */
export function createLogger(level = process.env['LOG_LEVEL'] ?? 'info'): Logger {
  // En produccion, JSON plano a stdout. En dev, pino-pretty.
  // La clave `transport` se OMITE en vez de pasarse como undefined:
  // con exactOptionalPropertyTypes no son lo mismo.
  if (process.env['NODE_ENV'] === 'production') return pino({ level });
  return pino({
    level,
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  });
}

/** Logger mudo para los tests. */
export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
