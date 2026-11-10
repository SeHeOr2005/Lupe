/**
 * Resultado de una postulación desde el bot (/resultado): si se ganó o no y,
 * si se ganó, el monto adjudicado. Reutiliza services/convocatorias.ts#registrarResultado
 * (pasa la convocatoria de "postulada" a "ganada" o "no_ganada") y, si se ganó,
 * crea la adjudicación con lo recibido en cero: de ahí sale el saldo por recibir
 * en la vista de finanzas.
 */
import { prisma } from "../db/prisma.js";
import { NotFoundError } from "../http/errors.js";
import { registrarResultado } from "./convocatorias.js";

/** Postulaciones radicadas cuyo resultado todavía no se conoce, de la más antigua a la más reciente. */
export async function listarEsperandoResultado() {
  const resultados = await prisma.resultado.findMany({
    where: { estado: "pendiente" },
    include: {
      postulacion: {
        include: { convocatoria: { select: { id: true, titulo: true, entidad: true, montoMaximo: true } } },
      },
    },
    orderBy: { postulacion: { fechaRadicacion: "asc" } },
  });
  return resultados.map((r) => ({
    resultadoId: r.id,
    convocatoriaId: r.postulacion.convocatoria.id,
    titulo: r.postulacion.convocatoria.titulo,
    entidad: r.postulacion.convocatoria.entidad,
    montoMaximo: r.postulacion.convocatoria.montoMaximo,
    fechaRadicacion: r.postulacion.fechaRadicacion,
    numeroRadicado: r.postulacion.numeroRadicado,
  }));
}

export async function esperandoResultado(resultadoId: string) {
  const r = (await listarEsperandoResultado()).find((x) => x.resultadoId === resultadoId);
  if (!r) throw new NotFoundError("resultado pendiente", resultadoId);
  return r;
}

/**
 * Registra el resultado. Si se ganó, también la adjudicación (monto adjudicado,
 * entidad que otorga, fecha de hoy y nada recibido todavía).
 */
export async function registrarResultadoDesdeBot(
  resultadoId: string,
  datos: { ganada: true; montoAdjudicado: number; autor: string } | { ganada: false; autor: string },
) {
  const pendiente = await esperandoResultado(resultadoId);
  const hoy = new Date();
  await registrarResultado({
    resultadoId,
    estado: datos.ganada ? "ganada" : "no_ganada",
    fechaResultado: hoy,
    observaciones: `Registrado desde Telegram por ${datos.autor}.`,
  });
  if (datos.ganada) {
    await prisma.adjudicacion.create({
      data: {
        resultadoId,
        resultadoEstado: "ganada",
        montoAdjudicado: datos.montoAdjudicado,
        montoRecibido: 0,
        fechaAdjudicacion: hoy,
        entidadOtorgante: pendiente.entidad,
      },
    });
  }
  return pendiente;
}
