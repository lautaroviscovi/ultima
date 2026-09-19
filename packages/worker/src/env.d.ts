/// <reference types="@cloudflare/vitest-pool-workers" />

import type { Env } from './RoomDurableObject.js';

/**
 * `cloudflare:test` expone el `env` del Worker en los tests. La librería lo
 * tipa via esta interfaz, que extendemos con nuestros bindings.
 */
declare module 'cloudflare:test' {
  // La interfaz vacia es el mecanismo oficial de la libreria: extiende
  // ProvidedEnv por declaration merging, sin agregar miembros propios.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends Env {}
}
