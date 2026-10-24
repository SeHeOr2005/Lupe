import type { FastifyInstance } from "fastify";
import { prisma } from "../../db/prisma.js";
import { parseBigIntId, registerCrudRoutes } from "../crud.js";
import { z } from "zod";

const noop = z.object({});

/**
 * Tablas de bitácora que solo escribe el sistema (worker, agentes):
 * aquí solo se exponen lectura y paginación, nunca creación/edición manual.
 */
export function registerReadonlyRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    resource: "convocatoria_evento",
    basePath: "/convocatoria-eventos",
    delegate: prisma.convocatoriaEvento,
    createSchema: noop,
    updateSchema: noop,
    parseId: parseBigIntId,
    allowCreate: false,
    allowUpdate: false,
    allowDelete: false,
    buildWhere: (q) => ({
      ...(q.convocatoriaId ? { convocatoriaId: q.convocatoriaId } : {}),
    }),
  });

  registerCrudRoutes(app, {
    resource: "escaneo",
    basePath: "/escaneos",
    delegate: prisma.escaneo,
    createSchema: noop,
    updateSchema: noop,
    parseId: parseBigIntId,
    allowCreate: false,
    allowUpdate: false,
    allowDelete: false,
    buildWhere: (q) => ({
      ...(q.fuenteId ? { fuenteId: q.fuenteId } : {}),
      ...(q.estado ? { estado: q.estado } : {}),
    }),
  });
}
