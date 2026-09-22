import { afterEach, describe, expect, it, vi } from 'vitest';
import { playSound } from './sound.js';

/**
 * El audio no tenia tests, y su modo de falla es silencioso: si una capa no se
 * dispara, el sonido se sigue oyendo — apenas mas pobre — y nadie se entera.
 *
 * Estos tests cuentan osciladores. No prueban que suene BIEN (eso se escucha),
 * prueban que suene lo que el mapa declara.
 */

interface FakeOsc {
  type: string;
  freqs: number[];
  started: number | null;
  stopped: number | null;
}

function mockAudio() {
  const oscs: FakeOsc[] = [];
  const gains: Array<{ values: number[] }> = [];

  class FakeAudioContext {
    currentTime = 0;
    state = 'running';
    destination = {};
    createOscillator() {
      const o: FakeOsc = { type: '', freqs: [], started: null, stopped: null };
      oscs.push(o);
      return {
        set type(v: string) {
          o.type = v;
        },
        frequency: {
          setValueAtTime: (v: number) => o.freqs.push(v),
          exponentialRampToValueAtTime: (v: number) => o.freqs.push(v),
        },
        connect: () => {},
        start: (t: number) => {
          o.started = t;
        },
        stop: (t: number) => {
          o.stopped = t;
        },
      };
    }
    createGain() {
      const g = { values: [] as number[] };
      gains.push(g);
      return {
        gain: {
          setValueAtTime: (v: number) => g.values.push(v),
          linearRampToValueAtTime: (v: number) => g.values.push(v),
          exponentialRampToValueAtTime: (v: number) => g.values.push(v),
        },
        connect: () => {},
      };
    }
  }

  vi.stubGlobal('window', { AudioContext: FakeAudioContext });
  return { oscs, gains };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('playSound', () => {
  it('con el sonido apagado no crea nada', async () => {
    const { oscs } = mockAudio();
    const { playSound: play } = await import('./sound.js');
    play('turn', false);
    expect(oscs).toHaveLength(0);
  });

  /**
   * Un tono con `layers` tiene que producir MAS de un oscilador. Si alguien
   * quita el bucle de capas de `playSound`, el sonido sigue andando y suena
   * mas pobre — exactamente el tipo de regresion que nadie nota.
   */
  it('EL RIESGO: las capas producen osciladores simultáneos', async () => {
    const { oscs } = mockAudio();
    const { playSound: play } = await import('./sound.js');

    play('reverse', true);

    // El reverse declara 2 tonos, y el segundo lleva 2 capas: 4 en total.
    expect(oscs.length, 'faltan capas del reverse').toBe(4);

    // Las capas arrancan EN EL MISMO instante que su tono, no despues: son
    // armonicos del mismo golpe, no notas de una melodia.
    const arranques = oscs.map((o) => o.started);
    const simultaneos = arranques.filter((t) => t === arranques[1]).length;
    expect(simultaneos, 'las capas no son simultáneas').toBeGreaterThan(1);
  });

  it('un sonido sin capas produce un oscilador por tono', async () => {
    const { oscs } = mockAudio();
    const { playSound: play } = await import('./sound.js');
    play('draw', true);
    expect(oscs).toHaveLength(1);
  });

  it('cada oscilador arranca y termina', async () => {
    const { oscs } = mockAudio();
    const { playSound: play } = await import('./sound.js');
    play('win', true);
    for (const o of oscs) {
      expect(o.started).not.toBeNull();
      expect(o.stopped).not.toBeNull();
      expect(o.stopped!).toBeGreaterThan(o.started!);
    }
  });

  it('todos los sonidos del mapa se reproducen sin explotar', async () => {
    const { playSound: play } = await import('./sound.js');
    mockAudio();
    const nombres = [
      'turn',
      'play',
      'draw',
      'penalty',
      'skipped',
      'timeout',
      'uno',
      'win',
      'reverse',
    ] as const;
    for (const n of nombres) {
      expect(() => play(n, true), `${n} explota`).not.toThrow();
    }
  });
});

// Referencia usada arriba sólo para el import estático del tipo.
void playSound;
