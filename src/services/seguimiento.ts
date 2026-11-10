/**
 * Seguimiento de las convocatorias aprobadas: el checklist de la postulación
 * (los pasos del cronograma y los documentos que piden) para ir marcando lo
 * que ya se hizo. Lo usa el bot (/aprobadas).
 *
 * Completar un paso reutiliza services/convocatorias.ts#completarPaso, que con
 * el primero pasa la convocatoria de "aprobada" a "en_postulacion".
 */
import { prisma } from "../db/prisma.js";
import { NotFoundError } from "../http/errors.js";
import { completarPaso } from "./convocatorias.js";

/** Estados en los que una convocatoria se está preparando (aparecen en /aprobadas). */
export const EN_SEGUIMIENTO = ["aprobada", "en_postulacion"] as const;

export async function listarEnSeguimiento() {
  const convocatorias = await prisma.convocatoria.findMany({
    where: { estado: { in: [...EN_SEGUIMIENTO] } },
    // La que cierra primero, arriba; las que no tienen fecha, al final.
    orderBy: [{ fechaCierre: { sort: "asc", nulls: "last" } }, { aprobadaAt: "desc" }],
    select: {
      id: true,
      titulo: true,
      fechaCierre: true,
      pasos: { select: { completado: true } },
      documentos: { select: { estado: true } },
    },
  });
  return convocatorias.map((c) => ({
    id: c.id,
    titulo: c.titulo,
    fechaCierre: c.fechaCierre,
    pasosHechos: c.pasos.filter((p) => p.completado).length,
    pasosTotal: c.pasos.length,
    documentosListos: c.documentos.filter((d) => d.estado !== "pendiente").length,
    documentosTotal: c.documentos.length,
  }));
}

export async function checklistDe(convocatoriaId: string) {
  const c = await prisma.convocatoria.findUnique({
    where: { id: convocatoriaId },
    include: {
      pasos: { orderBy: { orden: "asc" } },
      documentos: { orderBy: { tipo: "asc" } },
    },
  });
  if (!c) throw new NotFoundError("convocatoria", convocatoriaId);
  return c;
}

/** Marca o desmarca un paso. Devuelve la convocatoria a la que pertenece. */
export async function alternarPaso(pasoId: string): Promise<string> {
  const paso = await prisma.convocatoriaPaso.findUnique({ where: { id: pasoId } });
  if (!paso) throw new NotFoundError("convocatoria_paso", pasoId);
  if (paso.completado) {
    // Desmarcar no devuelve la convocatoria a "aprobada": la postulación ya empezó.
    await prisma.convocatoriaPaso.update({ where: { id: pasoId }, data: { completado: false, completadoAt: null } });
  } else {
    await completarPaso(pasoId);
  }
  return paso.convocatoriaId;
}

const SIGUIENTE_ESTADO = { pendiente: "listo", listo: "no_aplica", no_aplica: "pendiente" } as const;

/**
 * Documento exigido: pendiente → listo → no aplica → pendiente. Al volver a
 * pendiente se suelta el documento de la carpeta que estuviera enlazado.
 */
export async function alternarDocumento(documentoExigidoId: string): Promise<string> {
  const d = await prisma.convocatoriaDocumento.findUnique({ where: { id: documentoExigidoId } });
  if (!d) throw new NotFoundError("convocatoria_documento", documentoExigidoId);
  const estado = SIGUIENTE_ESTADO[d.estado];
  await prisma.convocatoriaDocumento.update({
    where: { id: documentoExigidoId },
    data: { estado, ...(estado === "pendiente" ? { documentoId: null } : {}) },
  });
  return d.convocatoriaId;
}
