/**
 * EL "trigger" que pediste: cada `SCHEDULER_TICK_MS` (por defecto 60s) revisa
 * la tabla `fuentes` y dispara `escanearFuente()` para toda fuente activa
 * cuyo `cron` ya esté vencido. No hace falta pg-boss/Redis para esto: con dos
 * fuentes y una revisión diaria, un `setInterval` que lee Postgres sobra (ver
 * README § Arquitectura).
 *
 * Reemplazar esto por pg-boss más adelante (fase 5, "Explorador y
 * operación") es un cambio interno: nada fuera de este archivo lo nota,
 * porque sigue llamando a la misma `escanearFuente()`.
 */
import { CronExpressionParser } from "cron-parser";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { escanearFuente } from "./escanear-fuente.js";

function estaVencida(cron: string, ultimoEscaneoAt: Date | null, ahora: Date): boolean {
  try {
    const interval = CronExpressionParser.parse(cron, {
      currentDate: ultimoEscaneoAt ?? new Date(0),
      tz: env.TZ,
    });
    const siguiente = interval.next().toDate();
    return siguiente <= ahora;
  } catch {
    console.error(`[scheduler] expresión cron inválida: "${cron}"`);
    return false;
  }
}

/** Un "tick": mira qué fuentes activas tienen el cron vencido y las escanea una por una. */
export async function tickFuentes(ahora = new Date()): Promise<void> {
  const fuentes = await prisma.fuente.findMany({ where: { activa: true } });

  for (const fuente of fuentes) {
    if (!estaVencida(fuente.cron, fuente.ultimoEscaneoAt, ahora)) continue;

    console.log(`[scheduler] disparando escaneo de "${fuente.nombre}" (${fuente.id})`);
    try {
      const resultado = await escanearFuente(fuente.id);
      console.log(
        `[scheduler] "${fuente.nombre}" → ${resultado.estado}` +
          (resultado.convocatoriasNuevas ? `, ${resultado.convocatoriasNuevas} nueva(s)` : "") +
          (resultado.error ? `: ${resultado.error}` : ""),
      );
    } catch (err) {
      // Una fuente que falla no debe tumbar el tick de las demás.
      console.error(`[scheduler] error escaneando "${fuente.nombre}":`, err);
    }
  }
}

/** Arranca el loop del scheduler. Devuelve una función para detenerlo (tests, apagado ordenado). */
export function iniciarScheduler(tickMs = env.SCHEDULER_TICK_MS): () => void {
  const id = setInterval(() => void tickFuentes(), tickMs);
  return () => clearInterval(id);
}
