import type { FastifyInstance } from "fastify";
import { prisma } from "../../db/prisma.js";
import { createPostulacionSchema, updatePostulacionSchema } from "../../schemas/postulacion.js";
import { registerCrudRoutes } from "../crud.js";
import { serializeBigInt } from "../serialize.js";
import { radicarPostulacion } from "../../services/convocatorias.js";

export function registerPostulacionesRoutes(app: FastifyInstance) {
  // "🎒 Ya radicamos": crea la postulación + resultado pendiente y mueve
  // la convocatoria en_postulacion → postulada, todo en una transacción.
  app.post("/postulaciones", async (request, reply) => {
    const body = createPostulacionSchema.parse(request.body);
    const { postulacion, resultado } = await radicarPostulacion(body);
    reply.code(201);
    return serializeBigInt({ postulacion, resultado });
  });

  registerCrudRoutes(app, {
    resource: "postulacion",
    basePath: "/postulaciones",
    delegate: prisma.postulacion,
    createSchema: createPostulacionSchema,
    updateSchema: updatePostulacionSchema,
    allowCreate: false, // ya se registró arriba con la lógica de radicación
    allowDelete: false, // el dinero y el historial no se borran por accidente
    defaultOrderBy: { createdAt: "desc" },
    buildWhere: (q) => ({
      ...(q.convocatoriaId ? { convocatoriaId: q.convocatoriaId } : {}),
    }),
  });
}
