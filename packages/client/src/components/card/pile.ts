/**
 * Desorden REPRODUCIBLE de la pila de descarte.
 *
 * Dos requisitos que tiran en direcciones opuestas:
 *
 * 1. **Estable.** Nada de `Math.random()`: cada re-render devolveria otro
 *    angulo y la pila temblaria sola en cada patch del servidor — varias veces
 *    por segundo en una partida de 10.
 * 2. **Visiblemente separado.** Si dos cartas de la pila caen casi en el mismo
 *    angulo, el monton se ve alineado y no se lee como monton.
 *
 * El hash solo resuelve (1). Para (2) hace falta repartir por BANDAS, porque
 * el azar no garantiza separacion: con hashing puro, `blue-9-c7` daba tres
 * rotaciones a menos de un grado entre si. Eso lo encontro un test que barre
 * las 40 cartas, no la inspeccion a ojo.
 */

/** FNV-1a de 32 bits, con semilla para poder derivar varios ejes del mismo id. */
function hash(id: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Mezcla final estilo MurmurHash3.
 *
 * FNV-1a solo no alcanza aca: con ids casi identicos (`abc:0`, `abc:1`) los
 * hashes quedan numericamente cerca y al mapearlos a un rango chico caen todos
 * en la misma zona. Medido en el navegador antes de agregar este paso, los
 * tres fantasmas salian rotados 0.21, 0.10 y -0.01 grados.
 */
function avalanche(h: number): number {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Valor en [0,1) a partir de un id y una semilla por eje. */
function unit(id: string, seed: number): number {
  return avalanche(hash(id, seed)) / 0x100000000;
}

/**
 * Semilla distinta por eje: si los tres salieran del mismo hash quedarian
 * correlacionados, y toda carta girada a la derecha estaria tambien corrida a
 * la derecha — el monton se veria peinado en vez de revuelto.
 */
const SEED = { rotate: 0x9e3779b9, x: 0x85ebca6b, y: 0xc2b2ae35 };

/**
 * Cuantos grados abarca el abanico de la pila, en total.
 *
 * 28 y no 18: es geometria, no gusto. Una carta de 90x144 rotada 4.8 grados
 * asoma 5.9px por el costado — invisible. A 14 grados asoma 16px, que se lee
 * como una carta debajo de otra. Calculado, no tanteado.
 */
const SPREAD_DEG = 28;

export interface PileJitter {
  /** Grados, en [-14, 14]. */
  rotate: number;
  /** Desplazamiento en px, en [-4, 4]. */
  x: number;
  y: number;
}

/**
 * Jitter de una carta suelta. El id decide todo.
 *
 * Para varias cartas de una misma pila usar `pileJitter`, que ademas garantiza
 * que se separen entre si.
 */
export function jitterFor(id: string): PileJitter {
  return {
    rotate: unit(id, SEED.rotate) * SPREAD_DEG - SPREAD_DEG / 2,
    x: unit(id, SEED.x) * 8 - 4,
    y: unit(id, SEED.y) * 8 - 4,
  };
}

/**
 * Jitter del fantasma `index` de `count`, con separacion GARANTIZADA.
 *
 * Cada fantasma se queda con su banda del rango y el hash solo elige donde
 * cae dentro de ella. Asi la separacion minima es una propiedad de la
 * construccion y no algo que se le pide al azar: con 3 fantasmas sobre 28
 * grados, cada banda mide 9.3 y quedan separados incluso en el peor caso,
 * porque el hash se restringe al 70% central de su banda.
 *
 * El eje `y` se deja recorrer toda la banda: superponerse en vertical es lo
 * que hace que parezcan apiladas, y ahi no molesta.
 */
export function pileJitter(id: string, index: number, count: number): PileJitter {
  const band = (seed: number, span: number): number => {
    const width = span / count;
    const start = -span / 2 + width * index;
    // 15% de margen a cada lado de la banda: es lo que asegura el hueco
    // entre bandas contiguas.
    return start + width * (0.15 + unit(`${id}:${index}`, seed) * 0.7);
  };

  return {
    rotate: band(SEED.rotate, SPREAD_DEG),
    x: band(SEED.x, 8),
    y: -4 + unit(`${id}:${index}`, SEED.y) * 8,
  };
}
