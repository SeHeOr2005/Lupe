import type { FastifyInstance } from "fastify";
import { prisma } from "../../db/prisma.js";
import { createFuenteSchema, updateFuenteSchema } from "../../schemas/fuente.js";
import { registerCrudRoutes } from "../crud.js";

export function registerFuentesRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    resource: "fuente",
    basePath: "/fuentes",
    delegate: prisma.fuente,
    createSchema: createFuenteSchema,
    updateSchema: updateFuenteSchema,
    defaultOrderBy: { nombre: "asc" },
    buildWhere: (q) => ({
      ...(q.activa !== undefined ? { activa: q.activa === "true" } : {}),
      ...(q.modo ? { modo: q.modo } : {}),
    }),
  });
}
