/** Quita `| undefined` de los valores, dejando las claves opcionales. */
type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/**
 * Quita las claves con valor undefined.
 *
 * zod `.optional()` produce `{ k?: T | undefined }`, pero con
 * exactOptionalPropertyTypes el engine distingue "clave ausente" de "clave
 * presente con undefined". Traducimos una sola vez en el borde en vez de
 * aflojar los tipos del engine, que es donde la precision vale.
 */
export function compact<T extends object>(obj: T | undefined): Defined<T> | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Defined<T>;
}
