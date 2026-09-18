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

export function createRng(seed: string): Rng {
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
