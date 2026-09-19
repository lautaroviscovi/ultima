import { afterEach, describe, expect, it, vi } from 'vitest';
import { claimRoom } from './socket.js';

/**
 * Distinguir "este backend no necesita reserva" de "no pude hablar con el
 * servidor" no es un detalle: con el primero hay que seguir normal, con el
 * segundo hay que AVISAR.
 *
 * Antes los dos casos devolvian null y el cliente conectaba igual, a una sala
 * inexistente. El sintoma era "conexión cerrada" sin ninguna explicacion — lo
 * vi en produccion antes de arreglarlo.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('claimRoom', () => {
  it('devuelve el codigo cuando el backend lo reserva', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ ok: true, roomId: 'AB12' }), { status: 200 }),
      ),
    );
    await expect(claimRoom()).resolves.toEqual({ kind: 'claimed', roomId: 'AB12' });
  });

  it('un 404 significa "este backend no lo necesita", no un error', async () => {
    // Es el caso del servidor Node: genera el codigo el mismo.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no encontrado', { status: 404 })),
    );
    await expect(claimRoom()).resolves.toEqual({ kind: 'not-needed' });
  });

  it('un fetch que falla es UNREACHABLE, no "no lo necesita"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const res = await claimRoom();
    expect(res.kind).toBe('unreachable');
  });

  it('un 500 tambien es unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    );
    expect((await claimRoom()).kind).toBe('unreachable');
  });

  it('un cuerpo ilegible es unreachable, no un codigo vacio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no soy json', { status: 200 })),
    );
    expect((await claimRoom()).kind).toBe('unreachable');
  });
});
