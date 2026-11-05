/**
 * Carpeta digital de la fundación (documentos_fundacion): RUT, certificados,
 * cédula del representante legal... Se usa desde el bot (/documentos).
 *
 * Mantiene sincronizadas las convocatorias: al guardar un documento, las que lo
 * pedían y lo tenían pendiente pasan a "listo"; al borrarlo, vuelven a "pendiente".
 * Los archivos viven en Telegram; aquí solo se guarda su file_id.
 */
import { prisma } from "../db/prisma.js";
import { NotFoundError } from "../http/errors.js";
import type { TipoDocumento } from "../explorador/plan.js";

export async function listarDocumentos() {
  return prisma.documentoFundacion.findMany({ orderBy: [{ tipo: "asc" }, { nombre: "asc" }] });
}

export async function obtenerDocumento(id: string) {
  const doc = await prisma.documentoFundacion.findUnique({ where: { id } });
  if (!doc) throw new NotFoundError("documento", id);
  return doc;
}

/**
 * Marca como listo este documento en las convocatorias que piden su tipo y aún lo
 * tienen pendiente. "otro" no se enlaza solo: es demasiado genérico.
 * Devuelve cuántas convocatorias quedaron con el documento listo.
 */
async function enlazarAConvocatorias(documentoId: string, tipo: TipoDocumento): Promise<number> {
  if (tipo === "otro") return 0;
  const { count } = await prisma.convocatoriaDocumento.updateMany({
    where: { tipo, estado: "pendiente", documentoId: null },
    data: { estado: "listo", documentoId },
  });
  return count;
}

export async function crearDocumento(input: { tipo: TipoDocumento; nombre: string; telegramFileId: string }) {
  const doc = await prisma.documentoFundacion.create({ data: input });
  const convocatoriasActualizadas = await enlazarAConvocatorias(doc.id, doc.tipo);
  return { doc, convocatoriasActualizadas };
}

/** Cambia el archivo (por ejemplo, un certificado renovado). Las fechas viejas se borran: son del archivo anterior. */
export async function reemplazarArchivo(id: string, telegramFileId: string) {
  await obtenerDocumento(id);
  const doc = await prisma.documentoFundacion.update({
    where: { id },
    data: { telegramFileId, fechaExpedicion: null, fechaVencimiento: null },
  });
  const convocatoriasActualizadas = await enlazarAConvocatorias(doc.id, doc.tipo);
  return { doc, convocatoriasActualizadas };
}

export async function actualizarDatos(
  id: string,
  datos: { nombre?: string; fechaExpedicion?: Date | null; fechaVencimiento?: Date | null },
) {
  await obtenerDocumento(id);
  return prisma.documentoFundacion.update({ where: { id }, data: datos });
}

/**
 * Borra el documento. Las convocatorias que lo tenían como "listo" vuelven a
 * "pendiente" en la misma transacción, para no quedar con un enlace roto.
 */
export async function eliminarDocumento(id: string) {
  const doc = await obtenerDocumento(id);
  const [{ count }] = await prisma.$transaction([
    prisma.convocatoriaDocumento.updateMany({
      where: { documentoId: id },
      data: { documentoId: null, estado: "pendiente" },
    }),
    prisma.documentoFundacion.delete({ where: { id } }),
  ]);
  return { doc, convocatoriasAfectadas: count };
}
