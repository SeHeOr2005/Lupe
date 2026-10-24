/**
 * Prisma devuelve BigInt para las columnas bigserial (chat_messages, escaneos,
 * convocatoria_eventos, recordatorios). JSON.stringify no sabe serializar BigInt,
 * así que lo convertimos a string antes de responder.
 */
export function serializeBigInt<T>(value: T): T {
  if (typeof value === "bigint") {
    return value.toString() as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeBigInt(item)) as unknown as T;
  }
  if (value instanceof Date) {
    return value as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = serializeBigInt(val);
    }
    return out as unknown as T;
  }
  return value;
}
