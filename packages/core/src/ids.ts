import { customAlphabet, nanoid } from 'nanoid';

/**
 * Alfabeto sin caracteres ambiguos: nada de 0/O, 1/I/L.
 * Los codigos de sala se dictan por voz en la videollamada, asi que la
 * confusion entre un cero y una O cuesta una ronda de "no, la letra".
 */
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const roomCode = customAlphabet(ROOM_ALPHABET, 4);

export function generateRoomCode(): string {
  return roomCode();
}

/** Credencial del asiento. Es la identidad: no hay login. */
export function generatePlayerToken(): string {
  return nanoid(32);
}

export function generatePlayerId(): string {
  return nanoid(12);
}

/** Seed de la partida. Se loguea para poder reproducir cualquier bug reportado. */
export function generateSeed(): string {
  return nanoid(16);
}
