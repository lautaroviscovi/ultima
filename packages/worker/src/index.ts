import { generateRoomCode } from '@uno/core';
import { RoomDurableObject, type Env } from './RoomDurableObject.js';

export { RoomDurableObject };

/** Cuantas veces reintentar si el codigo de sala ya estaba tomado. */
const MAX_CLAIM_ATTEMPTS = 5;

/**
 * IMPORTANTE: `idFromName("abcd")` y `idFromName("ABCD")` son Durable Objects
 * DISTINTOS. Si no se normaliza acá, dos jugadores con el mismo código en
 * distinto case terminan en salas diferentes — y el sintoma es "estamos en la
 * misma sala pero no nos vemos", que es dificil de diagnosticar.
 */
function normalizeRoomId(raw: string): string {
  return raw.trim().toUpperCase();
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  // Lista exacta, nunca '*': con '*' cualquier pagina puede abrir sockets.
  const allow = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow ?? '',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data: unknown, init: ResponseInit = {}, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...cors, ...(init.headers ?? {}) },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const allowed = (env.CLIENT_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const cors = corsHeaders(request.headers.get('Origin'), allowed);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/health') {
      return json({ ok: true, runtime: 'durable-objects' }, {}, cors);
    }

    /**
     * Reserva un codigo de sala.
     *
     * No hay registro central: el DO es su propio guardian de unicidad. Se
     * genera un codigo, se le pide al DO que lo reclame, y si ya estaba tomado
     * se reintenta con otro. Con 31^4 = ~920k combinaciones la colision es
     * rarisima, pero esto es correcto tambien bajo concurrencia real.
     */
    if (url.pathname === '/claim' && request.method === 'POST') {
      for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
        const roomId = generateRoomCode();
        const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
        if (await stub.claim(roomId)) {
          return json({ ok: true, roomId }, {}, cors);
        }
      }
      return json(
        { ok: false, code: 'INTERNAL_ERROR', message: 'no se pudo reservar un codigo' },
        { status: 503 },
        cors,
      );
    }

    // Conexion de juego: /ws?room=XXXX
    if (url.pathname === '/ws') {
      const raw = url.searchParams.get('room');
      if (!raw) return new Response('falta el parametro room', { status: 400, headers: cors });

      const roomId = normalizeRoomId(raw);
      if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4,6}$/.test(roomId)) {
        return new Response('codigo de sala invalido', { status: 400, headers: cors });
      }

      const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
      // El DO necesita saber su propio codigo para los broadcasts y las alarms.
      const forward = new URL(request.url);
      forward.searchParams.set('room', roomId);
      return stub.fetch(new Request(forward, request));
    }

    return new Response('no encontrado', { status: 404, headers: cors });
  },
};
