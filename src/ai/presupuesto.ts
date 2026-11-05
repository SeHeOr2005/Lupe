/**
 * Tope diario de IA (MAX_TOKENS_DIA). Todo lo que gasta tokens queda en la tabla
 * `escaneos` (los escaneos de fuentes y las lecturas de documentos del
 * explorador), así que el gasto del día es la suma de esa tabla.
 */
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";

/** Suma de tokens de IA gastados desde la medianoche (hora de TZ, America/Bogota). */
export async function tokensUsadosHoy(): Promise<number> {
  const inicioDelDia = new Date();
  inicioDelDia.setHours(0, 0, 0, 0);
  const { _sum } = await prisma.escaneo.aggregate({
    where: { inicioAt: { gte: inicioDelDia } },
    _sum: { tokensUsados: true },
  });
  return _sum.tokensUsados ?? 0;
}

/** ¿Queda cupo de IA hoy? Devuelve lo gastado para poder mostrarlo en el mensaje de error. */
export async function quedaCupoIa(): Promise<{ queda: boolean; usados: number; tope: number }> {
  const usados = await tokensUsadosHoy();
  return { queda: usados < env.MAX_TOKENS_DIA, usados, tope: env.MAX_TOKENS_DIA };
}
