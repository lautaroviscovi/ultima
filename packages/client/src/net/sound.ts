/**
 * Sonidos sintetizados con WebAudio.
 *
 * Nada de archivos: son tonos cortos que se generan en el momento, asi no hay
 * assets que cargar ni licencias que mirar. El tick de turno es lo mas
 * efectivo del set para atencion partida — con gente en videollamada nadie
 * mira la mesa todo el tiempo.
 */

type SoundName =
  'turn' | 'play' | 'draw' | 'penalty' | 'skipped' | 'timeout' | 'uno' | 'win' | 'reverse';

interface Tone {
  freq: number;
  /** Segundos. */
  duration: number;
  type: OscillatorType;
  gain: number;
  /** Frecuencia final para un barrido. */
  sweepTo?: number;
  /**
   * Osciladores que suenan AL MISMO TIEMPO que este, no despues.
   *
   * Es lo que separa un "bip" de algo con caracter: un tono solo suena a
   * prueba de laboratorio, dos o tres capas con distinta forma de onda suenan
   * a instrumento. Un array de `Tone` es una SECUENCIA; esto es una capa.
   *
   * Las capas heredan `duration` del tono principal y llevan su propio
   * `gain`, casi siempre mas bajo: son armonicos, no melodia.
   */
  layers?: Array<Omit<Tone, 'layers'>>;
}

const TONES: Record<SoundName, Tone[]> = {
  /**
   * Te toca. Dos notas ascendentes con una quinta por debajo.
   *
   * La quinta (x1.5) es el intervalo mas consonante que hay: suena a acorde,
   * no a dos frecuencias sueltas. Es el sonido que mas se repite en una
   * partida, asi que tiene que ser agradable a la decima vez.
   */
  turn: [
    {
      freq: 660,
      duration: 0.07,
      type: 'sine',
      gain: 0.16,
      layers: [{ freq: 990, duration: 0.07, type: 'sine', gain: 0.05 }],
    },
    {
      freq: 880,
      duration: 0.1,
      type: 'sine',
      gain: 0.15,
      layers: [{ freq: 1320, duration: 0.1, type: 'sine', gain: 0.05 }],
    },
  ],

  /**
   * Jugar una carta. Corto y seco, con un golpe grave debajo: la carta
   * ATERRIZA. Suena decenas de veces por partida, asi que es el mas discreto.
   */
  play: [
    {
      freq: 420,
      duration: 0.06,
      type: 'triangle',
      gain: 0.11,
      sweepTo: 330,
      layers: [{ freq: 150, duration: 0.05, type: 'sine', gain: 0.09, sweepTo: 90 }],
    },
  ],
  draw: [{ freq: 220, duration: 0.07, type: 'sine', gain: 0.1 }],
  /**
   * Alguien canto ÚLTIMA. Dos notas brillantes que SUBEN, con la octava
   * encima: es el momento con nombre propio del juego y tiene que cortar el
   * ruido de la videollamada.
   */
  uno: [
    {
      freq: 880,
      duration: 0.09,
      type: 'square',
      gain: 0.08,
      layers: [{ freq: 1760, duration: 0.09, type: 'sine', gain: 0.04 }],
    },
    {
      freq: 1320,
      duration: 0.16,
      type: 'square',
      gain: 0.08,
      layers: [{ freq: 2640, duration: 0.16, type: 'sine', gain: 0.03 }],
    },
  ],
  /**
   * Ganaste. Un arpegio mayor (do-mi-sol-do) con la tercera y la quinta
   * sonando encima de la ultima nota: cierra en acorde, no en una nota suelta.
   */
  win: [
    { freq: 523, duration: 0.1, type: 'sine', gain: 0.15 },
    { freq: 659, duration: 0.1, type: 'sine', gain: 0.15 },
    { freq: 784, duration: 0.1, type: 'sine', gain: 0.15 },
    {
      freq: 1046,
      duration: 0.32,
      type: 'sine',
      gain: 0.16,
      layers: [
        { freq: 1318, duration: 0.32, type: 'sine', gain: 0.06 },
        { freq: 1568, duration: 0.32, type: 'sine', gain: 0.05 },
      ],
    },
  ],
  /**
   * Castigo (+2 / +4). Barrido DESCENDENTE y mas grave que `draw`: robar por
   * turno es neutro, que te impongan cartas no. Usar el mismo sonido para los
   * dos borraba justo la distincion que importa.
   */
  penalty: [
    {
      freq: 300,
      duration: 0.22,
      type: 'sawtooth',
      gain: 0.12,
      sweepTo: 130,
      // Una quinta disminuida abajo: el intervalo mas incomodo que existe.
      // Un castigo no deberia sonar agradable.
      layers: [{ freq: 212, duration: 0.22, type: 'square', gain: 0.05, sweepTo: 92 }],
    },
  ],

  /**
   * Te saltearon. Dos notas que CAEN, como un "uh-oh": pasaste de largo sin
   * jugar. Distinto del castigo, que es mas grave y arrastrado — no te
   * impusieron cartas, te perdiste el turno.
   */
  skipped: [
    { freq: 520, duration: 0.09, type: 'triangle', gain: 0.13 },
    { freq: 390, duration: 0.13, type: 'triangle', gain: 0.12 },
  ],

  /**
   * Se te vencio el tiempo. Barrido largo y apagado: algo que se desinfla.
   * Es el unico que baja tanto, para que no se confunda con nada.
   */
  timeout: [{ freq: 420, duration: 0.3, type: 'sine', gain: 0.12, sweepTo: 120 }],
  /**
   * Cambio de sentido. El sonido con mas caracter del set, a proposito.
   *
   * Sube y despues cae: primero un barrido ascendente corto, y encima uno
   * largo que se desploma una octava con un armonico de sierra. Es la forma
   * de "algo que se dio vuelta" — y el reverse es la jugada que mas confunde,
   * asi que merece ser inconfundible.
   */
  reverse: [
    { freq: 320, duration: 0.1, type: 'triangle', gain: 0.1, sweepTo: 760 },
    {
      freq: 760,
      duration: 0.34,
      type: 'triangle',
      gain: 0.13,
      sweepTo: 200,
      layers: [
        { freq: 380, duration: 0.34, type: 'sawtooth', gain: 0.05, sweepTo: 100 },
        { freq: 1140, duration: 0.18, type: 'sine', gain: 0.04, sweepTo: 300 },
      ],
    },
  ],
};

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/**
 * Los navegadores no dejan sonar hasta que hubo un gesto del usuario. Lo
 * llamamos en el primer click para que el primer tick de turno ya suene.
 */
export function unlockAudio(): void {
  const ctx = getContext();
  if (ctx?.state === 'suspended') void ctx.resume();
}

/**
 * Variacion de tono por llamada.
 *
 * Dos cartas robadas seguidas sonaban EXACTAMENTE igual, y repetir un sample
 * identico es lo que hace que un sonido se perciba como sintetico y canse. Un
 * semitono arriba o abajo alcanza para que se lean como dos eventos y no como
 * un eco.
 *
 * Se aplica solo a los sonidos que se repiten en rafaga; el tick de turno y la
 * victoria mantienen su tono, porque ahi la constancia es la señal.
 */
const VARIES: ReadonlySet<SoundName> = new Set(['draw', 'play', 'penalty']);

/** +-1 semitono, que en frecuencia es un factor de 2^(1/12). */
function pitchFor(name: SoundName): number {
  if (!VARIES.has(name)) return 1;
  return 2 ** ((Math.random() * 2 - 1) / 12);
}

/** Dispara UN oscilador. El tono principal y cada capa pasan por aca. */
function emit(ctx: AudioContext, tone: Omit<Tone, 'layers'>, start: number, pitch: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = tone.type;
  osc.frequency.setValueAtTime(tone.freq * pitch, start);
  if (tone.sweepTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(tone.sweepTo * pitch, start + tone.duration);
  }

  // Ataque y caida suaves: un corte seco suena a "click" defectuoso.
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(tone.gain, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + tone.duration + 0.02);
}

export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return;
  const ctx = getContext();
  if (!ctx || ctx.state === 'suspended') return;

  const pitch = pitchFor(name);
  let offset = 0;
  for (const tone of TONES[name]) {
    const start = ctx.currentTime + offset;
    emit(ctx, tone, start, pitch);

    // Las capas arrancan EN EL MISMO instante: son armonicos del mismo golpe,
    // no notas de una melodia. Por eso no mueven el `offset`.
    for (const layer of tone.layers ?? []) emit(ctx, layer, start, pitch);

    offset += tone.duration * 0.85;
  }
}
