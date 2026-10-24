import type { FastifyInstance } from "fastify";
import { prisma } from "../../db/prisma.js";
import { createDesembolsoSchema, updateDesembolsoSchema } from "../../schemas/desembolso.js";
import { registerCrudRoutes } from "../crud.js";

export function registerDesembolsosRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    resource: "desembolso",
    basePath: "/desembolsos",
    delegate: prisma.desembolso,
    createSchema: createDesembolsoSchema,
    updateSchema: updateDesembolsoSchema,
    buildWhere: (q) => ({
      ...(q.adjudicacionId ? { adjudicacionId: q.adjudicacionId } : {}),
      ...(q.estado ? { estado: q.estado } : {}),
    }),
  });
}
