import type { FastifyInstance } from "fastify";
import { prisma } from "../../db/prisma.js";
import { createAdjudicacionSchema, updateAdjudicacionSchema } from "../../schemas/adjudicacion.js";
import { registerCrudRoutes } from "../crud.js";
import { ConflictError, NotFoundError } from "../errors.js";
import { serializeBigInt } from "../serialize.js";

export function registerAdjudicacionesRoutes(app: FastifyInstance) {
  // POST personalizado: solo se puede adjudicar un resultado en estado "ganada"
  // (coincide con la FK compuesta (resultado_id, resultado_estado) del modelo).
  app.post("/adjudicaciones", async (request, reply) => {
    const data = createAdjudicacionSchema.parse(request.body);
    const resultado = await prisma.resultado.findUnique({ where: { id: data.resultadoId } });
    if (!resultado) throw new NotFoundError("resultado", data.resultadoId);
    if (resultado.estado !== "ganada") {
      throw new ConflictError(
        `Solo se puede adjudicar un resultado en estado "ganada" (este está en "${resultado.estado}").`,
      );
    }

    const adjudicacion = await prisma.adjudicacion.create({
      data: { ...data, resultadoEstado: "ganada" },
    });
    reply.code(201);
    return serializeBigInt(adjudicacion);
  });

  registerCrudRoutes(app, {
    resource: "adjudicacion",
    basePath: "/adjudicaciones",
    delegate: prisma.adjudicacion,
    createSchema: createAdjudicacionSchema,
    updateSchema: updateAdjudicacionSchema,
    allowCreate: false, // ya se registró arriba con la validación extra
  });
}
