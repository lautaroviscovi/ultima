/**
 * Sonidos sintetizados con WebAudio.
 *
 * Nada de archivos: son tonos cortos que se generan en el momento, asi no hay
 * assets que cargar ni licencias que mirar. El tick de turno es lo mas
 * efectivo del set para atencion partida — con gente en videollamada nadie
 * mira la mesa todo el tiempo.
 */

type SoundName = 'turn' | 'play' | 'draw' | 'uno' | 'win' | 'reverse';

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

export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return;
  const ctx = getContext();
  if (!ctx || ctx.state === 'suspended') return;

  let offset = 0;
  for (const tone of TONES[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + offset;

    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq, start);
    if (tone.sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(tone.sweepTo, start + tone.duration);
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
