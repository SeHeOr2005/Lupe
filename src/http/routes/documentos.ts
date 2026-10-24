import type { FastifyInstance } from "fastify";
import { prisma } from "../../db/prisma.js";
import {
  createDocumentoFundacionSchema,
  updateDocumentoFundacionSchema,
} from "../../schemas/documentoFundacion.js";
import {
  createConvocatoriaDocumentoSchema,
  updateConvocatoriaDocumentoSchema,
} from "../../schemas/convocatoriaDocumento.js";
import { registerCrudRoutes } from "../crud.js";

/**
 * "Documentos" (ver leyenda amarilla del diagrama v2): la carpeta digital de
 * la fundación (documentos_fundacion) y qué pide cada convocatoria puntual
 * (convocatoria_documentos), que puede enlazar a uno ya guardado.
 */
export function registerDocumentosRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    resource: "documento_fundacion",
    basePath: "/documentos-fundacion",
    delegate: prisma.documentoFundacion,
    createSchema: createDocumentoFundacionSchema,
    updateSchema: updateDocumentoFundacionSchema,
    defaultOrderBy: { nombre: "asc" },
    buildWhere: (q) => ({
      ...(q.tipo ? { tipo: q.tipo } : {}),
    }),
  });

  registerCrudRoutes(app, {
    resource: "convocatoria_documento",
    basePath: "/convocatoria-documentos",
    delegate: prisma.convocatoriaDocumento,
    createSchema: createConvocatoriaDocumentoSchema,
    updateSchema: updateConvocatoriaDocumentoSchema,
    include: { documento: true },
    buildWhere: (q) => ({
      ...(q.convocatoriaId ? { convocatoriaId: q.convocatoriaId } : {}),
      ...(q.estado ? { estado: q.estado } : {}),
    }),
  });
}
