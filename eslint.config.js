import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/storybook-static/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  // El plugin de hooks es el que realmente atrapa bugs: dependencias faltantes
  // en useMemo/useEffect que producen estado viejo renderizado como si fuera
  // actual.
  {
    files: ['packages/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // El engine es una funcion pura. Esta regla hace la pureza MECANICA en vez de
  // depender de disciplina: sin determinismo no hay replay, no hay tests
  // reproducibles, y los escenarios de borde (wild4 inicial) se vuelven
  // imposibles de armar sin backdoors que rompan el encapsulamiento.
  // Todo lo no-deterministico entra por parametro.
  {
    files: ['packages/engine/**/*.ts'],
    // Los tests, los fixtures y el simulador quedan fuera: el sim mide
    // wall-clock para reportar performance, no decide nada del juego.
    ignores: [
      'packages/engine/**/*.test.ts',
      'packages/engine/src/testing/**',
      'packages/engine/src/sim/**',
    ],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'El engine debe ser determinista: usa el Rng inyectado (createRng(seed)), no Math.random().',
        },
        {
          object: 'Date',
          property: 'now',
          message:
            'El engine debe ser determinista: el tiempo entra por parametro (ej. now: number), no Date.now().',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'setTimeout', message: 'Los timers viven en el server, no en el engine puro.' },
        { name: 'setInterval', message: 'Los timers viven en el server, no en el engine puro.' },
      ],
    },
  },
);
