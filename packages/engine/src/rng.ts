import prand from 'pure-rand';

/**
 * RNG determinista e INYECTADO. El engine nunca llama a Math.random().
 *
 * Toda la partida es funcion de (seed, comandos). Eso compra cuatro cosas:
 *  - Un test que falla es reproducible desde su seed, en vez de flaky en CI.
 *  - Los escenarios de borde se arman buscando un seed que los produzca, sin
 *    backdoors de setState que rompan el encapsulamiento y dejen de ejercitar
 *    el camino real.
 *  - Replay: un bug reportado en produccion se reduce a (seed, comandos).
 *  - Property-based testing con fallos reproducibles.
 *
 * Es mutable a proposito: un unico stream por partida que avanzan TODOS los
 * consumos (repartir, re-barajar, color por timeout, cartas de un abandonado).
 * Si algun consumo usara su propio stream, el replay dejaria de coincidir.
 */
export interface Rng {
  /** Entero en [0, max). */
  nextInt(max: number): number;
  /** Elemento al azar de un array no vacio. */
  pick<T>(items: readonly T[]): T;
  /** Copia barajada (Fisher-Yates). No muta la entrada. */
  shuffle<T>(items: readonly T[]): T[];
  /** Cuantos numeros se consumieron. Util para asserts de determinismo. */
  readonly consumed: number;
}

/** Hash estable string -> int32, para aceptar seeds legibles ("wild4-inicial"). */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Crea un Rng. `skip` avanza el stream esa cantidad de consumos, para
 * reconstruir una posicion guardada (ver `restoreRng`).
 */
export function createRng(seed: string, skip = 0): Rng {
  let gen = prand.xoroshiro128plus(hashSeed(seed));
  let consumed = 0;

  const nextInt = (max: number): number => {
    if (!Number.isInteger(max) || max <= 0) {
      throw new Error(`nextInt requiere un entero positivo, recibio ${max}`);
    }
    const [value, nextGen] = prand.uniformIntDistribution(0, max - 1, gen);
    gen = nextGen;
    consumed++;
    return value;
  };

  // Avanzar el stream es la unica forma de reconstruir la posicion: xoroshiro
  // no permite "saltar" a un estado arbitrario. Es O(skip), pero una partida
  // larga consume unos pocos miles de valores, asi que es instantaneo.
  for (let i = 0; i < skip; i++) nextInt(2);

  return {
    nextInt,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick sobre un array vacio');
      // El indice esta acotado por length, asi que el elemento existe.
      return items[nextInt(items.length)]!;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = nextInt(i + 1);
        const a = out[i]!;
        const b = out[j]!;
        out[i] = b;
        out[j] = a;
      }
      return out;
    },
    get consumed() {
      return consumed;
    },
  };
}

/**
 * Posicion del stream, para guardarla junto al estado.
 *
 * El Rng vive FUERA del GameState serializable (ver `rngs` en game.ts), asi que
 * al restaurar un estado desde disco el stream volveria a la posicion 0 y
 * cualquier consumo posterior — re-barajar el descarte, elegir color por
 * timeout, repartir las cartas de un abandonado — daria un resultado distinto
 * al de la partida original. El replay `(seed, comandos)` dejaria de valer en
 * silencio.
 */
export function exportRngState(rng: Rng): number {
  return rng.consumed;
}

/** Reconstruye un stream en la posicion guardada por `exportRngState`. */
export function restoreRng(seed: string, consumed: number): Rng {
  if (!Number.isInteger(consumed) || consumed < 0) {
    throw new Error(`posicion de rng invalida: ${consumed}`);
  }
  return createRng(seed, consumed);
}
