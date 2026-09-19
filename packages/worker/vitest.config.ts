import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

/**
 * Los tests del DO corren dentro de workerd real, no de un mock.
 *
 * Probar un Durable Object con mocks no probaria nada de lo que importa:
 * el ciclo de vida del objeto, las alarms, y que idFromName rutee al mismo
 * objeto.
 */
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        // El aislamiento de storage por test no funciona con DOs
        // SQLite-backed en esta version. Cada test usa codigos de sala
        // distintos, asi que no dependen de arrancar con storage limpio.
        isolatedStorage: false,
        singleWorker: true,
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: { compatibilityFlags: ['nodejs_compat'] },
      },
    },
  },
});
