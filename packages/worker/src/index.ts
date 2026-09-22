import { generateRoomCode } from '@uno/core';
import { RoomDurableObject, type Env } from './RoomDurableObject.js';

export { RoomDurableObject };

/** Cuantas veces reintentar si el codigo de sala ya estaba tomado. */
const MAX_CLAIM_ATTEMPTS = 5;

/** Alfabeto sin caracteres ambiguos: los codigos se dictan por voz. */
const ROOM_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4,6}$/;

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
  const base = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    // La respuesta depende del Origin: sin esto, un proxy podria cachear la
    // respuesta de un origen permitido y servirsela a otro.
    Vary: 'Origin',
  };

  /**
   * Un origen que NO esta en la lista no recibe header de CORS.
   *
   * Hacer fallback al primer origen permitido seria incorrecto: el navegador
   * lo bloquea igual porque no coincide, pero le estaria diciendo a quien
   * sondea cual es el dominio autorizado. Lista exacta, y nunca '*'.
   */
  if (!origin || !allowed.includes(origin)) return base;

  return { ...base, 'Access-Control-Allow-Origin': origin };
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
     * Estado de UNA sala: /health/room?code=XXXX
     *
     * No hay listado global a proposito: con Durable Objects cada sala es un
     * objeto independiente, sin registro central. Eso es lo que hace que el
     * aislamiento entre salas sea una garantia de plataforma y no una
     * convencion — pero significa que para mirar una sala hay que nombrarla.
     */
    if (url.pathname === '/health/room') {
      const raw = url.searchParams.get('code');
      if (!raw) return json({ ok: false, message: 'falta ?code=' }, { status: 400 }, cors);

      const roomId = normalizeRoomId(raw);
      if (!ROOM_CODE.test(roomId)) {
        return json({ ok: false, message: 'codigo invalido' }, { status: 400 }, cors);
      }

      const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
      const status = await stub.status();
      return json({ ok: true, roomId, status }, {}, cors);
    }

    /**
     * Libera una sala: borra su estado y devuelve el codigo al pool.
     *
     * Es destructivo, asi que pide el header. No es una API para el cliente:
     * el ciclo normal es que la sala venza por TTL. Esto es para limpiar a
     * mano despues de probar.
     */
    if (url.pathname === '/admin/release' && request.method === 'POST') {
      const raw = url.searchParams.get('code');
      if (!raw) return json({ ok: false, message: 'falta ?code=' }, { status: 400 }, cors);

      const roomId = normalizeRoomId(raw);
      if (!ROOM_CODE.test(roomId)) {
        return json({ ok: false, message: 'codigo invalido' }, { status: 400 }, cors);
      }

      const stub = env.ROOM.get(env.ROOM.idFromName(roomId));
      const before = await stub.status();
      // No cortamos una partida EN CURSO por accidente. Una terminada, si.
      const enCurso = before && before.players > 0 && before.phase !== 'game_over';
      if (enCurso) {
        return json(
          {
            ok: false,
            message: `la sala ${roomId} tiene una partida en curso con ${before.players} jugadores`,
          },
          { status: 409 },
          cors,
        );
      }

      await stub.release();
      return json({ ok: true, roomId, released: before !== null }, {}, cors);
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
      if (!ROOM_CODE.test(roomId)) {
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
