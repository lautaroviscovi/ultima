import { describe, expect, it } from 'vitest';
import { errorCopy, shouldShowError } from './errorCopy.js';

/**
 * Lo que estos tests protegen es que NINGUN texto del servidor llegue a la
 * pantalla.
 *
 * Los mensajes del backend exponen estado interno del motor —el nombre de la
 * fase, ids de jugador, la lista de comandos del protocolo— y la unica defensa
 * es que el cliente traduzca por `code` y descarte el `message`.
 */

/** Mensajes REALES que hoy genera el backend, copiados de los archivos. */
const MENSAJES_DEL_SERVIDOR = [
  'No se puede jugar en fase card_drawn',
  'No se puede robar en fase choosing_color',
  'Jugador p_a3f9c210 no encontrado',
  "Invalid discriminator value. Expected 'PLAY_CARD' | 'DRAW_CARD'",
  'String must contain at least 16 character(s)',
  'El estado cambio desde que mandaste el comando',
  'Evento desconocido: game:foo',
  'el servidor no respondió',
  'El servidor respondió 502',
];

describe('errorCopy', () => {
  it('traduce los códigos de regla a algo que un jugador entiende', () => {
    expect(errorCopy('NOT_YOUR_TURN')).toBe('Todavía no es tu turno');
    expect(errorCopy('ILLEGAL_MOVE')).toBe('Esa carta no se puede jugar ahora');
    expect(errorCopy('ROOM_FULL')).toBe('La sala está llena');
  });

  /**
   * La garantía central: aunque aparezca un código nuevo que nadie mapeó, el
   * peor caso es una frase poco específica — nunca detalle interno.
   */
  it('EL BUG: un código desconocido NO filtra nada', () => {
    const copy = errorCopy('CODIGO_QUE_NO_EXISTE');
    expect(copy).toBe('Algo falló. Probá de nuevo');

    // Y tampoco explota sin código.
    expect(errorCopy(undefined)).toBe('Algo falló. Probá de nuevo');
    expect(errorCopy('')).toBe('Algo falló. Probá de nuevo');
  });

  it('EL BUG: ninguna frase se parece a un mensaje del servidor', () => {
    const codigos = [
      'NOT_YOUR_TURN',
      'ILLEGAL_MOVE',
      'CARD_NOT_IN_HAND',
      'WRONG_PHASE',
      'PLAYER_NOT_FOUND',
      'INVALID_PAYLOAD',
      'STALE_COMMAND',
      'INTERNAL_ERROR',
      'ROOM_NOT_FOUND',
    ];
    for (const code of codigos) {
      const copy = errorCopy(code);
      for (const crudo of MENSAJES_DEL_SERVIDOR) {
        expect(copy, `${code} filtra el mensaje del servidor`).not.toBe(crudo);
      }
      // Ni jerga de implementación suelta.
      expect(copy.toLowerCase()).not.toContain('fase ');
      expect(copy).not.toMatch(/\bp_[a-z0-9]+/i);
      expect(copy).not.toContain('PLAY_CARD');
      expect(copy).not.toMatch(/\b\d{3}\b/); // códigos HTTP
    }
  });

  it('todas las frases están en español y son para una persona', () => {
    const codigos = ['NOT_YOUR_TURN', 'INVALID_PAYLOAD', 'RATE_LIMITED', 'SESSION_TAKEN_OVER'];
    for (const code of codigos) {
      const copy = errorCopy(code);
      expect(copy.length, `${code} es muy corto`).toBeGreaterThan(8);
      // Un mensaje de Zod sin traducir empieza así.
      expect(copy).not.toMatch(/^(String|Number|Expected|Invalid)\b/);
    }
  });
});

describe('shouldShowError', () => {
  /**
   * El servidor DETECTA el comando viejo, reenvía el estado fresco con
   * `syncOne` y recién después manda el ack fallido. Mostrar una alerta roja
   * por algo que el sistema ya arregló es alarmar sin motivo: el jugador ve su
   * mesa actualizarse y un cartel de error al mismo tiempo.
   */
  it('EL BUG: STALE_COMMAND no genera toast', () => {
    expect(shouldShowError('STALE_COMMAND')).toBe(false);
  });

  it('el resto sí se muestra', () => {
    expect(shouldShowError('NOT_YOUR_TURN')).toBe(true);
    expect(shouldShowError('ROOM_FULL')).toBe(true);
    expect(shouldShowError(undefined)).toBe(true);
  });
});
