import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { registerCrudRoutes } from "../crud.js";
import { serializeBigInt } from "../serialize.js";
import { registrarResultado } from "../../services/convocatorias.js";
import { createResultadoSchema, updateResultadoSchema } from "../../schemas/resultado.js";

const registrarSchema = z.object({
  estado: z.enum(["ganada", "no_ganada"]),
  observaciones: z.string().optional(),
  fechaResultado: z.coerce.date().optional(),
});

export function registerResultadosRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    resource: "resultado",
    basePath: "/resultados",
    delegate: prisma.resultado,
    createSchema: createResultadoSchema,
    updateSchema: updateResultadoSchema,
    allowCreate: false, // lo crea radicarPostulacion()
    allowUpdate: false, // se cambia con /registrar, nunca con un PATCH libre
    allowDelete: false,
    buildWhere: (q) => ({
      ...(q.estado ? { estado: q.estado } : {}),
    }),
  });

  // "/resultado" del bot: registra ganada/no_ganada y mueve la convocatoria.
  app.post("/resultados/:id/registrar", async (request) => {
    const { id } = request.params as { id: string };
    const body = registrarSchema.parse(request.body);
    const resultado = await registrarResultado({ resultadoId: id, ...body });
    return serializeBigInt(resultado);
  });
}
