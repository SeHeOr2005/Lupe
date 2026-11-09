/**
 * Re-evalúa contra el perfil de la fundación (config/perfil-fundacion.ts) las
 * convocatorias que el sistema clasificó: pendiente_aprobacion y no_apta. Útil la
 * primera vez y cada vez que cambie el perfil o el criterio del filtro.
 *
 *   npm run elegibilidad:reevaluar              → solo muestra qué cambiaría
 *   npm run elegibilidad:reevaluar -- --aplicar → aplica los cambios
 *
 * Mueve pendiente_aprobacion → no_apta lo que ya no encaja, y no_apta →
 * pendiente_aprobacion lo que ahora sí. Nunca toca lo que decidió la directora
 * (aprobada, descartada...). A todas les actualiza analisis_ia.elegibilidad.
 * Los tokens de IA que gasta no cuentan para el tope diario del worker (ese
 * suma la tabla escaneos).
 */
import { prisma } from "../db/prisma.js";
import { elegibilidadComoJson, evaluarLote } from "../elegibilidad/evaluar.js";
import { transicionarConvocatoria } from "../services/convocatorias.js";
import { consultarEstadosSecop, type EstadoSecop } from "../scraping/secop.js";
import type { Hallazgo } from "../jobs/hallazgo.js";
import { FUENTE_MANUAL } from "../explorador/nueva.js";

const aplicar = process.argv.includes("--aplicar");

const comoObjeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const convocatorias = await prisma.convocatoria.findMany({
  // Las que la directora agregó a mano desde el bot no se re-evalúan: las escogió ella.
  where: { estado: { in: ["pendiente_aprobacion", "no_apta"] }, fuente: { nombre: { not: FUENTE_MANUAL } } },
  orderBy: { fechaApertura: "desc" },
});
console.log(`${convocatorias.length} convocatorias clasificadas por el sistema. Evaluando...`);

// Se pregunta a SECOP el estado de HOY de todas: un proceso puede quedar "Seleccionado"
// semanas después de detectado, y las guardadas antes no tenían la modalidad.
const estadosSecop = await consultarEstadosSecop(
  convocatorias.flatMap((c) => (c.numeroProceso ? [c.numeroProceso] : [])),
);

/** Lo de SECOP hoy y, si no se pudo consultar, lo que se guardó al detectarla. */
const infoFuente = (c: (typeof convocatorias)[number]): Partial<EstadoSecop> =>
  estadosSecop.get(c.numeroProceso ?? "") ?? (comoObjeto(c.analisisIa)["fuente"] as Partial<EstadoSecop> | undefined) ?? {};

const hallazgos: Hallazgo[] = convocatorias.map((c) => ({
  titulo: c.titulo,
  entidad: c.entidad,
  resumen: c.resumen ?? undefined,
  ...infoFuente(c),
}));

const { resultados, tokensUsados, errorIa } = await evaluarLote(hallazgos);
if (errorIa) {
  console.error(`La IA falló, no se cambia nada: ${errorIa}`);
  process.exit(1);
}

let cambios = 0;
for (const [i, c] of convocatorias.entries()) {
  const e = resultados[i]!;
  const nuevoEstado = e.apta ? "pendiente_aprobacion" : "no_apta";
  const cambia = nuevoEstado !== c.estado;
  if (cambia) cambios += 1;

  if (e.apta || cambia) {
    const asignado = e.asignacion
      ? `  [ya asignado${e.asignacion.organizacion ? ` a ${e.asignacion.organizacion}` : ""}]`
      : e.tipoProceso === "directo"
        ? "  [convenio directo]"
        : e.tipoProceso === "competitivo"
          ? "  [ABIERTA a propuestas]"
          : "";
    console.log(`${e.apta ? "✅" : "❌"}${cambia ? " (cambia)" : ""} ${c.titulo.slice(0, 70)}${asignado}\n     ${e.razon}`);
  }
  if (!aplicar) continue;

  const fuente = infoFuente(c);
  const analisisIa = {
    ...comoObjeto(c.analisisIa),
    elegibilidad: elegibilidadComoJson(e),
    ...(fuente.yaSeleccionado !== undefined ? { fuente } : {}),
  };
  if (cambia) {
    await transicionarConvocatoria(c.id, nuevoEstado, {
      origen: "sistema",
      nota: e.apta ? `Re-evaluada como apta: ${e.razon}` : `No encaja con el perfil: ${e.razon}`,
      dataExtra: { analisisIa },
    });
  } else {
    await prisma.convocatoria.update({ where: { id: c.id }, data: { analisisIa } });
  }
}

const aptas = resultados.filter((r) => r.apta).length;
console.log(
  `\n${aptas} aptas, ${resultados.length - aptas} no aptas, ${cambios} cambian de estado (${tokensUsados} tokens de IA).` +
    (aplicar ? " Cambios aplicados." : " No se cambió nada: corre con --aplicar para guardar."),
);
await prisma.$disconnect();
