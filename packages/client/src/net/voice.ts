/**
 * Voz sintetizada por el navegador (Web Speech API).
 *
 * Cero bytes de descarga y cualquier frase sin regrabar. Pero la API es mas
 * fragil de lo que promete, y esto esta escrito alrededor de esa fragilidad:
 *
 * - `getVoices()` devuelve vacio hasta que el motor carga las voces, y avisa
 *   con `voiceschanged` — un evento que **a veces no llega**. Verificado: en
 *   el navegador de prueba la llamada se colgaba esperandolo.
 * - Que exista una voz en español depende del sistema operativo. En una Mac
 *   con 18 voces `es_*` funciona; en un Windows pelado puede no haber ninguna.
 *
 * Por eso nunca se espera indefinidamente y SIEMPRE hay un camino de vuelta:
 * si no hay voz en español, `speak()` devuelve false y el llamador cae al tono
 * sintetizado de siempre. Nunca hablar en ingles, nunca quedar mudo.
 */

export type VoiceLine = 'ultima' | 'skipped' | 'draw4' | 'timeout';

/**
 * Lo que dice cada linea.
 *
 * Frases cortas y en segunda persona: describen algo que te paso A VOS. Narrar
 * cada carta seria insoportable a los cinco minutos, y ademas competiria con
 * la gente hablando por la videollamada.
 */
const LINES: Record<VoiceLine, string> = {
  ultima: '¡Última!',
  skipped: 'Te saltearon',
  draw4: 'Robás cuatro',
  timeout: 'Se acabó tu tiempo',
};

/** Cuanto esperamos a que el motor cargue las voces antes de rendirnos. */
const RESOLVE_TIMEOUT_MS = 1000;

type Resolution = { voice: SpeechSynthesisVoice | null };
let resolution: Promise<Resolution> | null = null;

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  return window.speechSynthesis ?? null;
}

/**
 * Elige la mejor voz disponible en español.
 *
 * Preferencia rioplatense primero y despues el resto de Latinoamerica: la voz
 * de España pronuncia la "ll" y la "z" distinto, y en una mesa de argentinos
 * eso se nota. Igual es preferible a no tener voz.
 */
function pickSpanish(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const spanish = voices.filter((v) => v.lang.toLowerCase().startsWith('es'));
  if (spanish.length === 0) return null;

  const byPreference = [/es[-_]ar/i, /es[-_](419|mx|uy|cl|co)/i, /es/i];
  for (const pattern of byPreference) {
    // `localService` primero: las de red meten latencia y fallan sin conexion.
    const local = spanish.find((v) => pattern.test(v.lang) && v.localService);
    if (local) return local;
    const any = spanish.find((v) => pattern.test(v.lang));
    if (any) return any;
  }
  return spanish[0] ?? null;
}

/**
 * Resuelve la voz UNA sola vez y cachea el resultado (incluido el negativo).
 *
 * El timeout es lo que hace que esto no se cuelgue: si `voiceschanged` no
 * llega, a los 1000ms se resuelve con lo que haya — que puede ser nada, y esta
 * bien, porque el llamador tiene fallback.
 */
function resolveVoice(): Promise<Resolution> {
  if (resolution) return resolution;

  resolution = new Promise<Resolution>((resolve) => {
    const speech = synth();
    if (!speech) return resolve({ voice: null });

    const settle = (): void => resolve({ voice: pickSpanish(speech.getVoices()) });

    /**
     * Camino rapido: las voces YA estan. Se resuelve sin armar timeout ni
     * listener, que ademas es el caso mas comun.
     *
     * Este `return` temprano no es solo una optimizacion: una version anterior
     * llamaba a un `finish()` que hacia `clearTimeout(timer)` sobre un `const`
     * declarado mas abajo, y reventaba con ReferenceError por zona muerta —
     * justo cuando todo estaba bien.
     */
    if (speech.getVoices().length > 0) return settle();

    // Referencia local: dentro de una `function` con hoisting, TypeScript
    // pierde el narrowing de `speech` que hizo el guard de arriba.
    const target = speech;

    const timer = setTimeout(() => {
      target.removeEventListener('voiceschanged', onVoices);
      settle();
    }, RESOLVE_TIMEOUT_MS);

    function onVoices(): void {
      clearTimeout(timer);
      target.removeEventListener('voiceschanged', onVoices);
      settle();
    }
    target.addEventListener('voiceschanged', onVoices);
  });

  return resolution;
}

/**
 * Deja la voz lista antes de que haga falta.
 *
 * Se llama en el mismo gesto que desbloquea el audio: resolver la voz tarda
 * hasta un segundo, y no se puede pagar esa espera en medio de una jugada.
 */
export function primeVoice(): void {
  void resolveVoice();
}

/**
 * Dice una linea. Devuelve si efectivamente va a hablar.
 *
 * `false` significa "no hay voz utilizable": el llamador tiene que caer al
 * tono sintetizado. Por eso es sincrono en su respuesta aunque hable despues —
 * la decision de fallback no puede esperar.
 */
export function speak(line: VoiceLine, enabled: boolean): boolean {
  if (!enabled) return false;
  const speech = synth();
  if (!speech) return false;

  // Sin voz resuelta todavia no arriesgamos: que hable el tono.
  const cached = cachedVoice;
  if (!cached) {
    void resolveVoice().then((r) => {
      cachedVoice = r.voice;
    });
    return false;
  }

  /**
   * Pisar lo anterior, no encolar.
   *
   * En una mesa de 10 los eventos se encadenan, y la cola de speech acumularia
   * frases viejas hablando sobre el turno siguiente. Lo ultimo que paso es
   * siempre lo relevante.
   */
  speech.cancel();

  const utterance = new SpeechSynthesisUtterance(LINES[line]);
  utterance.voice = cached;
  utterance.lang = cached.lang;
  // Un poco mas rapido y agudo que el default: suena a exclamacion de mesa y
  // no a lector de documentos.
  utterance.rate = 1.15;
  utterance.pitch = 1.1;
  speech.speak(utterance);
  return true;
}

let cachedVoice: SpeechSynthesisVoice | null = null;
void resolveVoice().then((r) => {
  cachedVoice = r.voice;
});

/** Corta lo que se este diciendo. Al salir de la mesa, por ejemplo. */
export function stopVoice(): void {
  synth()?.cancel();
}

/** Solo para tests: vuelve al estado inicial. */
export function resetVoiceForTests(): void {
  resolution = null;
  cachedVoice = null;
}
