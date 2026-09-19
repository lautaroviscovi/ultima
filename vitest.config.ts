import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    // Los tests del worker corren DENTRO de workerd con su propio config:
    // `pnpm --filter @uno/worker test`. Probar un Durable Object con el
    // runtime de Node no probaria nada de lo que importa.
    exclude: ['**/node_modules/**', 'packages/worker/**'],
    // El cliente necesita DOM (sessionStorage/localStorage); el resto no.
    environmentMatchGlobs: [['packages/client/**', 'jsdom']],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['packages/engine/src/**'],
      exclude: [
        'packages/engine/src/testing/**',
        '**/*.test.ts',
        // Barrel de re-exports: no tiene logica que cubrir.
        'packages/engine/src/index.ts',
        // El simulador ES el gate de fase 1; se corre con `pnpm sim`, no se
        // testea a si mismo.
        'packages/engine/src/sim/**',
      ],
      // El engine es codigo puro sin I/O: no hay excusa para menos.
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
