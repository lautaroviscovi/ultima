import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { primeVoice, resetVoiceForTests, speak, stopVoice } from './voice.js';

/**
 * Lo que estos tests protegen es el FALLBACK.
 *
 * La Web Speech API depende del sistema operativo: puede no haber ninguna voz
 * en español, y `getVoices()` puede devolver vacío hasta que dispare
 * `voiceschanged` — un evento que a veces no llega (verificado en el navegador
 * de prueba, donde la llamada se colgaba esperándolo).
 *
 * Si `speak()` devolviera `true` sin poder hablar, el juego quedaría MUDO: el
 * llamador no caería al tono y el jugador no oiría nada. Ese es el modo de
 * falla que hay que hacer imposible.
 */

interface FakeVoice {
  lang: string;
  name: string;
  localService: boolean;
}

function mockSpeech(voices: FakeVoice[], opts: { neverFiresEvent?: boolean } = {}) {
  const spoken: Array<{ text: string; lang: string; rate: number }> = [];
  let cancels = 0;
  const listeners: Array<() => void> = [];
  let available: FakeVoice[] = opts.neverFiresEvent ? [] : voices;

  const speech = {
    getVoices: () => available,
    speak: (u: { text: string; lang: string; rate: number }) => spoken.push(u),
    cancel: () => {
      cancels++;
    },
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: () => void) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };

  vi.stubGlobal('speechSynthesis', speech);
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string;
      lang = '';
      rate = 1;
      pitch = 1;
      voice: unknown = null;
      constructor(text: string) {
        this.text = text;
      }
    },
  );

  return {
    spoken,
    cancels: () => cancels,
    /** Simula que el motor termina de cargar las voces. */
    loadVoices: () => {
      available = voices;
      for (const fn of [...listeners]) fn();
    },
  };
}

beforeEach(() => {
  resetVoiceForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetVoiceForTests();
});

describe('voice', () => {
  it('EL FALLBACK: sin voz en español devuelve false', async () => {
    mockSpeech([{ lang: 'en-US', name: 'Alex', localService: true }]);
    primeVoice();
    await vi.waitFor(() => expect(speak('ultima', true)).toBe(false));
  });

  it('EL FALLBACK: sin la API devuelve false y no explota', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    expect(() => speak('ultima', true)).not.toThrow();
    expect(speak('ultima', true)).toBe(false);
  });

  it('EL FALLBACK: no se cuelga si `voiceschanged` nunca llega', async () => {
    vi.useFakeTimers();
    mockSpeech([{ lang: 'es-AR', name: 'Voz', localService: true }], { neverFiresEvent: true });
    primeVoice();

    // Antes del timeout no hay voz resuelta: el llamador cae al tono.
    expect(speak('ultima', true)).toBe(false);

    // Pasado el timeout se resuelve con lo que haya (acá, nada).
    await vi.advanceTimersByTimeAsync(1200);
    expect(speak('ultima', true)).toBe(false);
  });

  it('con el sonido apagado no habla', () => {
    mockSpeech([{ lang: 'es-AR', name: 'Voz', localService: true }]);
    expect(speak('ultima', false)).toBe(false);
  });

  it('habla cuando hay voz en español', async () => {
    const m = mockSpeech([{ lang: 'es-AR', name: 'Voz', localService: true }]);
    primeVoice();
    await vi.waitFor(() => expect(speak('ultima', true)).toBe(true));
    expect(m.spoken.at(-1)?.text).toContain('ltima');
  });

  it('prefiere rioplatense, después LatAm, y evita las de red', async () => {
    const m = mockSpeech([
      { lang: 'es-ES', name: 'Península', localService: true },
      { lang: 'es-MX', name: 'Latam red', localService: false },
      { lang: 'es-AR', name: 'Rioplatense', localService: true },
    ]);
    primeVoice();
    await vi.waitFor(() => expect(speak('skipped', true)).toBe(true));
    expect(m.spoken.at(-1)?.lang).toBe('es-AR');
  });

  it('cae a LatAm si no hay rioplatense', async () => {
    const m = mockSpeech([
      { lang: 'es-ES', name: 'Península', localService: true },
      { lang: 'es-MX', name: 'Mexicana', localService: true },
    ]);
    primeVoice();
    await vi.waitFor(() => expect(speak('skipped', true)).toBe(true));
    expect(m.spoken.at(-1)?.lang).toBe('es-MX');
  });

  it('PISA lo anterior en vez de encolar', async () => {
    // Con 10 jugadores los eventos se encadenan: una cola hablaría sobre el
    // turno siguiente.
    const m = mockSpeech([{ lang: 'es-AR', name: 'Voz', localService: true }]);
    primeVoice();
    await vi.waitFor(() => expect(speak('ultima', true)).toBe(true));
    const before = m.cancels();
    speak('skipped', true);
    expect(m.cancels()).toBe(before + 1);
  });

  it('stopVoice no explota sin la API', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    expect(() => stopVoice()).not.toThrow();
  });
});
