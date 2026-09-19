import { exportRngPosition, restoreRngPosition, type GameState } from '@uno/engine';
import type { Room, RoomManager, Seat } from '@uno/core';

/**
 * Persistencia de una sala.
 *
 * El estado en memoria es la fuente de verdad mientras el Durable Object vive.
 * Esto es la RED DE CONTENCION para cuando el objeto se evicta: no es una base
 * de datos con esquema ni queries, es un blob opaco que escribe una sola
 * funcion y lee una sola funcion.
 *
 * Esa disciplina es lo que evita la "maquina de bugs de serializacion" que el
 * proyecto descarto al no usar base de datos: no hay esquema que migrar ni
 * query que desincronizar.
 */

/** Si cambia la forma del snapshot, los viejos se descartan en vez de leerse mal. */
export const SCHEMA_VERSION = 1;

const KEY = 'room:snapshot';

interface SnapshotEnvelope {
  schemaVersion: number;
  roomId: string;
  hostId: string;
  seats: Seat[];
  options: Room['options'];
  createdAt: number;
  lastActivityAt: number;
  game: GameState | null;
  /**
   * Posicion del stream de RNG.
   *
   * Sin esto el snapshot seria una mentira sutil: el Rng vive fuera del
   * GameState, asi que al restaurar volveria a la posicion 0 y el proximo
   * re-barajado o color por timeout divergiria de la partida original.
   */
  rngConsumed: number | null;
}

/** Serializa la sala a un blob. Nadie mas escribe el snapshot. */
export function buildSnapshot(room: Room): SnapshotEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    roomId: room.id,
    hostId: room.hostId,
    // Los sockets no sobreviven a la evicción: al restaurar, todos empiezan
    // desconectados y reclaman su asiento con el token.
    seats: room.seats.map((seat) => ({ ...seat, socketId: null, connected: false })),
    options: room.options,
    createdAt: room.createdAt,
    lastActivityAt: room.lastActivityAt,
    game: room.game,
    rngConsumed: room.game ? exportRngPosition(room.game) : null,
  };
}

export async function saveSnapshot(storage: DurableObjectStorage, room: Room): Promise<void> {
  await storage.put(KEY, buildSnapshot(room));
}

/**
 * Rehidrata la sala en el manager. Devuelve true si habia algo que restaurar.
 *
 * Un snapshot de otra version se DESCARTA: es preferible perder una sala a
 * reanudarla mal. Manos desincronizadas entre jugadores serian un bug
 * irreportable.
 */
export async function restoreSnapshot(
  storage: DurableObjectStorage,
  rooms: RoomManager,
): Promise<boolean> {
  const snapshot = await storage.get<SnapshotEnvelope>(KEY);
  if (!snapshot) return false;

  if (snapshot.schemaVersion !== SCHEMA_VERSION) {
    await storage.delete(KEY);
    return false;
  }

  rooms.adopt({
    id: snapshot.roomId,
    hostId: snapshot.hostId,
    seats: snapshot.seats,
    options: snapshot.options,
    game: snapshot.game,
    createdAt: snapshot.createdAt,
    lastActivityAt: snapshot.lastActivityAt,
  });

  // ANTES del primer reduce sobre el estado restaurado.
  if (snapshot.game && snapshot.rngConsumed !== null) {
    restoreRngPosition(snapshot.game, snapshot.rngConsumed);
  }

  return true;
}

export async function clearSnapshot(storage: DurableObjectStorage): Promise<void> {
  await storage.delete(KEY);
}
