import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
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
