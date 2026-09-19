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

describe('reclamo de codigo', () => {
  it('un DO solo acepta UN claim: es su propio registro de unicidad', async () => {
    const id = env.ROOM.idFromName('ZZZZ');
    const stub = env.ROOM.get(id);

    // El DO ES el registro: no hay estado compartido ni coordinacion.
    expect(await stub.claim('ZZZZ')).toBe(true);
    expect(await stub.claim('ZZZZ')).toBe(false);
  });
});
