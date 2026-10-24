import type { FastifyInstance } from "fastify";
import { prisma } from "../../db/prisma.js";
import { createRecordatorioSchema, updateRecordatorioSchema } from "../../schemas/recordatorio.js";
import { parseBigIntId, registerCrudRoutes } from "../crud.js";

export function registerRecordatoriosRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    resource: "recordatorio",
    basePath: "/recordatorios",
    delegate: prisma.recordatorio,
    createSchema: createRecordatorioSchema,
    updateSchema: updateRecordatorioSchema,
    parseId: parseBigIntId,
    buildWhere: (q) => ({
      ...(q.convocatoriaId ? { convocatoriaId: q.convocatoriaId } : {}),
      ...(q.pendientes === "true" ? { enviadoAt: null } : {}),
    }),
  });
}
