/**
 * Gemini a veces responde 503 ("This model is currently experiencing high
 * demand") o 429 (cupo por minuto agotado). Son fallos pasajeros: se reintenta
 * con espera creciente y, si el modelo sigue saturado, se prueba con el otro
 * modelo configurado (evaluador ↔ explorador), que suele tener otra carga.
 */

/** Errores que vale la pena reintentar: saturación, cupo por minuto o fallo interno de Google. */
export function esErrorTemporal(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return status === 429 || status >= 500;
  const mensaje = err instanceof Error ? err.message : String(err);
  return /"code":\s*(429|500|502|503|504)|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|fetch failed|ECONNRESET|ETIMEDOUT/i.test(
    mensaje,
  );
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Llama a Gemini con el primer modelo y, ante errores temporales, reintenta
 * (2 s, 6 s...) y luego pasa al siguiente modelo. Un error permanente (clave
 * inválida, petición mal formada) se lanza de inmediato.
 */
export async function conModeloDeRespaldo<T>(
  modelos: string[],
  llamar: (modelo: string) => Promise<T>,
  { intentosPorModelo = 3, esperaBaseMs = 2_000 }: { intentosPorModelo?: number; esperaBaseMs?: number } = {},
): Promise<T> {
  const candidatos = [...new Set(modelos.filter(Boolean))];
  let ultimoError: unknown;
  for (const modelo of candidatos) {
    for (let intento = 0; intento < intentosPorModelo; intento++) {
      try {
        return await llamar(modelo);
      } catch (err) {
        if (!esErrorTemporal(err)) throw err;
        ultimoError = err;
        console.warn(`[ia] ${modelo} no disponible (intento ${intento + 1}/${intentosPorModelo}): ${resumirError(err)}`);
        if (intento < intentosPorModelo - 1) await esperar(esperaBaseMs * 3 ** intento);
      }
    }
  }
  throw ultimoError;
}

function resumirError(err: unknown): string {
  const mensaje = err instanceof Error ? err.message : String(err);
  return /"message":\s*"([^"]+)"/.exec(mensaje)?.[1] ?? mensaje.slice(0, 160);
}

/** Mensaje para la persona (en el bot): sin JSON crudo, y diciendo qué hacer. */
export function mensajeErrorIa(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status;
  const mensaje = err instanceof Error ? err.message : String(err);
  if (status === 429 || /RESOURCE_EXHAUSTED|"code":\s*429/i.test(mensaje)) {
    return "Se agotó el cupo de la IA por ahora. Intenta de nuevo en unos minutos.";
  }
  if (esErrorTemporal(err)) {
    return "La IA de Google está saturada en este momento (lo intenté varias veces). Vuelve a enviar el archivo en unos minutos.";
  }
  return resumirError(err);
}
