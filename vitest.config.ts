import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * `.tsx` tambien, y no es cosmetico.
     *
     * Un test de componente lleva JSX, asi que se escribe `.test.tsx`. Con el
     * glob anterior (`*.test.ts` a secas) ese archivo NO se recogia y
     * `pnpm test` pasaba verde igual — el peor modo de falla posible: creer
     * que hay cobertura cuando no corrio nada.
     *
     * Hoy no hay ningun test de render en el repo, pero `jsdom` y
     * `@testing-library/react` ya estan instalados, asi que la trampa estaba
     * armada para el primero que lo intentara.
     */
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
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
