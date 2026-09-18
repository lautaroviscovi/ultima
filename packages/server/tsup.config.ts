import { defineConfig } from 'tsup';

/**
 * Bundle de un solo archivo.
 *
 * El servidor importa @uno/engine y @uno/protocol por workspace: en el
 * contenedor esos paquetes no existen como dependencias publicadas, asi que se
 * empaquetan adentro. Las deps de npm (socket.io, express, pino) quedan
 * externas y se instalan normal.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  // Los workspace no se marcan externos: van dentro del bundle.
  noExternal: [/^@uno\//],
  sourcemap: true,
  clean: true,
});
