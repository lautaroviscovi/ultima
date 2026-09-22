import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

/**
 * Tests dentro de workerd real. Cubren lo especifico de la plataforma: el
 * ruteo por idFromName, el reclamo de codigos, y que un WebSocket llegue al
 * Durable Object correcto.
 */

describe('router', () => {
  it('responde /health', async () => {
    const res = await SELF.fetch('https://example.com/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('reclama un codigo de sala con el alfabeto sin ambiguos', async () => {
    const res = await SELF.fetch('https://example.com/claim', { method: 'POST' });
    const body = (await res.json()) as { ok: boolean; roomId: string };

    expect(body.ok).toBe(true);
    expect(body.roomId).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    // Se dicta por voz en la videollamada: 0/O y 1/I/L cuestan una ronda.
    expect(body.roomId).not.toMatch(/[01OIL]/);
  });

  it('cada claim devuelve un codigo distinto', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const res = await SELF.fetch('https://example.com/claim', { method: 'POST' });
      const body = (await res.json()) as { roomId: string };
      codes.add(body.roomId);
    }
    expect(codes.size).toBe(8);
  });

  it('rechaza /ws sin codigo de sala', async () => {
    const res = await SELF.fetch('https://example.com/ws');
    expect(res.status).toBe(400);
  });

  it('rechaza un codigo de sala con caracteres invalidos', async () => {
    const res = await SELF.fetch('https://example.com/ws?room=ab-1');
    expect(res.status).toBe(400);
  });

  it('rechaza un upgrade que no es websocket', async () => {
    const res = await SELF.fetch('https://example.com/ws?room=ABCD');
    expect(res.status).toBe(426);
  });
});

describe('CORS', () => {
  // El wrangler.jsonc de test define CLIENT_ORIGIN con localhost:5173.
  const ALLOWED = 'http://localhost:5173';

  it('devuelve el header para un origen permitido', async () => {
    const res = await SELF.fetch('https://example.com/health', {
      headers: { Origin: ALLOWED },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED);
  });

  it('NO devuelve header para un origen desconocido', async () => {
    /**
     * Hacer fallback al primer origen permitido seria incorrecto: el navegador
     * lo bloquea igual porque no coincide, pero le estaria diciendo a quien
     * sondea cual es el dominio autorizado. Este bug estuvo en produccion.
     */
    const res = await SELF.fetch('https://example.com/health', {
      headers: { Origin: 'https://sitio-malicioso.com' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('nunca devuelve el comodin', async () => {
    const res = await SELF.fetch('https://example.com/health', {
      headers: { Origin: ALLOWED },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
  });

  it('marca Vary: Origin para que no se cachee cruzado', async () => {
    const res = await SELF.fetch('https://example.com/health', {
      headers: { Origin: ALLOWED },
    });
    expect(res.headers.get('Vary')).toContain('Origin');
  });

  it('responde el preflight', async () => {
    const res = await SELF.fetch('https://example.com/claim', {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});

describe('ruteo a Durable Objects', () => {
  it('el mismo codigo siempre da el MISMO objeto', () => {
    const a = env.ROOM.idFromName('ABCD');
    const b = env.ROOM.idFromName('ABCD');
    expect(a.toString()).toBe(b.toString());
  });

  it('codigos distintos dan objetos distintos', () => {
    const a = env.ROOM.idFromName('ABCD');
    const b = env.ROOM.idFromName('EFGH');
    expect(a.toString()).not.toBe(b.toString());
  });

  it('EL CASE IMPORTA: minusculas y mayusculas son objetos DISTINTOS', () => {
    // Por eso el router normaliza a mayusculas ANTES de idFromName. Sin eso,
    // dos jugadores con el mismo codigo en distinto case terminan en salas
    // diferentes — y el sintoma es "estamos en la misma sala pero no nos
    // vemos", que cuesta diagnosticar.
    const upper = env.ROOM.idFromName('ABCD');
    const lower = env.ROOM.idFromName('abcd');
    expect(upper.toString()).not.toBe(lower.toString());
  });

  it('el router normaliza el case antes de rutear', async () => {
    // Las dos formas tienen que llegar al mismo DO: si no, el upgrade de una
    // fallaria distinto que el de la otra.
    const upper = await SELF.fetch('https://example.com/ws?room=ABCD');
    const lower = await SELF.fetch('https://example.com/ws?room=abcd');
    expect(lower.status).toBe(upper.status);
  });
});

describe('salud de una sala', () => {
  it('rechaza el endpoint sin codigo', async () => {
    const res = await SELF.fetch('https://example.com/health/room');
    expect(res.status).toBe(400);
  });

  it('rechaza un codigo invalido', async () => {
    const res = await SELF.fetch('https://example.com/health/room?code=ab-1');
    expect(res.status).toBe(400);
  });

  it('una sala nunca usada no tiene estado', async () => {
    const res = await SELF.fetch('https://example.com/health/room?code=QQQQ');
    const body = (await res.json()) as { ok: boolean; status: unknown };
    expect(body.ok).toBe(true);
    expect(body.status).toBeNull();
  });

  it('una sala reclamada aparece como tal', async () => {
    const claim = await SELF.fetch('https://example.com/claim', { method: 'POST' });
    const { roomId } = (await claim.json()) as { roomId: string };

    const res = await SELF.fetch(`https://example.com/health/room?code=${roomId}`);
    const body = (await res.json()) as { status: { claimed: boolean; players: number } };
    expect(body.status.claimed).toBe(true);
    expect(body.status.players).toBe(0);
  });

  it('normaliza el case tambien aca', async () => {
    const claim = await SELF.fetch('https://example.com/claim', { method: 'POST' });
    const { roomId } = (await claim.json()) as { roomId: string };

    const res = await SELF.fetch(`https://example.com/health/room?code=${roomId.toLowerCase()}`);
    const body = (await res.json()) as { roomId: string; status: { claimed: boolean } };
    expect(body.roomId).toBe(roomId);
    expect(body.status.claimed).toBe(true);
  });
});

describe('reclamo de codigo', () => {
  it('un DO solo acepta UN claim: es su propio registro de unicidad', async () => {
    const id = env.ROOM.idFromName('ZZZZ');
    const stub = env.ROOM.get(id);

    // El DO ES el registro: no hay estado compartido ni coordinacion.
    expect(await stub.claim('ZZZZ')).toBe(true);
    expect(await stub.claim('ZZZZ')).toBe(false);
  });

  it('release LIBERA el codigo para volver a usarlo', async () => {
    /**
     * Sin esto, cada partida jugada consume un codigo del espacio de ~920k
     * para siempre: el flag `claimed` se persiste y nunca se borraba. Es una
     * fuga lenta, pero es una fuga.
     */
    const stub = env.ROOM.get(env.ROOM.idFromName('YYYY'));
    expect(await stub.claim('YYYY')).toBe(true);
    expect(await stub.claim('YYYY')).toBe(false);

    await stub.release();
    expect(await stub.claim('YYYY')).toBe(true);
  });
});
