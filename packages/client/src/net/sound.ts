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
}

const TONES: Record<SoundName, Tone[]> = {
  // Dos notas ascendentes: se reconoce sin ser estridente.
  turn: [
    { freq: 660, duration: 0.07, type: 'sine', gain: 0.18 },
    { freq: 880, duration: 0.09, type: 'sine', gain: 0.16 },
  ],
  play: [{ freq: 420, duration: 0.05, type: 'triangle', gain: 0.12 }],
  draw: [{ freq: 220, duration: 0.07, type: 'sine', gain: 0.1 }],
  uno: [
    { freq: 880, duration: 0.09, type: 'square', gain: 0.1 },
    { freq: 1170, duration: 0.12, type: 'square', gain: 0.1 },
  ],
  win: [
    { freq: 523, duration: 0.1, type: 'sine', gain: 0.16 },
    { freq: 659, duration: 0.1, type: 'sine', gain: 0.16 },
    { freq: 784, duration: 0.18, type: 'sine', gain: 0.16 },
  ],
  /**
   * Castigo (+2 / +4). Barrido DESCENDENTE y mas grave que `draw`: robar por
   * turno es neutro, que te impongan cartas no. Usar el mismo sonido para los
   * dos borraba justo la distincion que importa.
   */
  penalty: [{ freq: 300, duration: 0.18, type: 'sawtooth', gain: 0.13, sweepTo: 140 }],

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
  // Barrido descendente: el reverse suena a "algo se dio vuelta".
  reverse: [{ freq: 700, duration: 0.22, type: 'sawtooth', gain: 0.1, sweepTo: 300 }],
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

export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return;
  const ctx = getContext();
  if (!ctx || ctx.state === 'suspended') return;

  const pitch = pitchFor(name);
  let offset = 0;
  for (const tone of TONES[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + offset;

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
    offset += tone.duration * 0.85;
  }
}
