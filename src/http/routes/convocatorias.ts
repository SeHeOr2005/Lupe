import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { createConvocatoriaSchema, updateConvocatoriaSchema } from "../../schemas/convocatoria.js";
import {
  createConvocatoriaPasoSchema,
  updateConvocatoriaPasoSchema,
} from "../../schemas/convocatoriaPaso.js";
import { registerCrudRoutes } from "../crud.js";
import { serializeBigInt } from "../serialize.js";
import {
  aprobarConvocatoria,
  completarPaso,
  descartarConvocatoria,
  transicionarConvocatoria,
  transicionesDesde,
  type EstadoConvocatoria,
} from "../../services/convocatorias.js";

const estadoInicialSchema = z.enum(["detectada", "no_apta"]).default("detectada");

const transicionSchema = z.object({
  estado: z.enum([
    "detectada",
    "pendiente_aprobacion",
    "aprobada",
    "en_postulacion",
    "postulada",
    "ganada",
    "no_ganada",
    "no_apta",
    "descartada",
    "vencida",
  ]),
  origen: z.enum(["sistema", "usuaria"]).default("usuaria"),
  nota: z.string().optional(),
});

const accionDirectoraSchema = z.object({
  nota: z.string().optional(),
});

export function registerConvocatoriasRoutes(app: FastifyInstance) {
  // Creación: el resultado de la evaluación del agente decide si nace
  // "detectada" o "no_apta" (ver fila "(nueva)" de la tabla de transiciones).
  app.post("/convocatorias", async (request, reply) => {
    const { estadoInicial, ...data } = createConvocatoriaSchema
      .extend({ estadoInicial: estadoInicialSchema })
      .parse(request.body);
    const convocatoria = await prisma.convocatoria.create({ data: { ...data, estado: estadoInicial } });
    reply.code(201);
    return serializeBigInt(convocatoria);
  });

  registerCrudRoutes(app, {
    resource: "convocatoria",
    basePath: "/convocatorias",
    delegate: prisma.convocatoria,
    createSchema: createConvocatoriaSchema,
    updateSchema: updateConvocatoriaSchema,
    allowCreate: false, // ya se registró arriba
    defaultOrderBy: { createdAt: "desc" },
    buildWhere: (q) => ({
      ...(q.estado ? { estado: q.estado } : {}),
      ...(q.fuenteId ? { fuenteId: q.fuenteId } : {}),
    }),
  });

  // Historial de estado de una convocatoria.
  app.get("/convocatorias/:id/eventos", async (request) => {
    const { id } = request.params as { id: string };
    const eventos = await prisma.convocatoriaEvento.findMany({
      where: { convocatoriaId: id },
      orderBy: { createdAt: "asc" },
    });
    return serializeBigInt(eventos);
  });

  // Qué transiciones son válidas desde el estado actual (útil para el bot/frontend).
  app.get("/convocatorias/:id/transiciones", async (request, reply) => {
    const { id } = request.params as { id: string };
    const convocatoria = await prisma.convocatoria.findUnique({ where: { id } });
    if (!convocatoria) return reply.notFound(`convocatoria con id "${id}" no existe`);
    return {
      estadoActual: convocatoria.estado,
      siguientes: transicionesDesde(convocatoria.estado as EstadoConvocatoria),
    };
  });

  // Transición genérica (la "sola puerta" para cambiar de estado).
  app.post("/convocatorias/:id/transiciones", async (request) => {
    const { id } = request.params as { id: string };
    const body = transicionSchema.parse(request.body);
    const convocatoria = await transicionarConvocatoria(id, body.estado, {
      origen: body.origen,
      nota: body.nota,
    });
    return serializeBigInt(convocatoria);
  });

  // Atajos del flujo del bot: ✅ Aprobar / ❌ Descartar (solo directora).
  app.post("/convocatorias/:id/aprobar", async (request) => {
    const { id } = request.params as { id: string };
    const body = accionDirectoraSchema.parse(request.body ?? {});
    return serializeBigInt(await aprobarConvocatoria(id, body.nota));
  });

  app.post("/convocatorias/:id/descartar", async (request) => {
    const { id } = request.params as { id: string };
    const body = accionDirectoraSchema.parse(request.body ?? {});
    return serializeBigInt(await descartarConvocatoria(id, body.nota));
  });

  // Paso a paso de la postulación (convocatoria_pasos).
  app.get("/convocatorias/:id/pasos", async (request) => {
    const { id } = request.params as { id: string };
    const pasos = await prisma.convocatoriaPaso.findMany({
      where: { convocatoriaId: id },
      orderBy: { orden: "asc" },
    });
    return serializeBigInt(pasos);
  });

  app.post("/convocatorias/:id/pasos", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createConvocatoriaPasoSchema.omit({ convocatoriaId: true }).parse(request.body);
    const paso = await prisma.convocatoriaPaso.create({ data: { ...body, convocatoriaId: id } });
    reply.code(201);
    return serializeBigInt(paso);
  });

  app.patch("/convocatorias/:id/pasos/:pasoId", async (request) => {
    const { pasoId } = request.params as { id: string; pasoId: string };
    const body = updateConvocatoriaPasoSchema.parse(request.body);
    const paso = await prisma.convocatoriaPaso.update({ where: { id: pasoId }, data: body });
    return serializeBigInt(paso);
  });

  // Botón "✔ Hecho": marca el paso y, si corresponde, avanza aprobada → en_postulacion.
  app.post("/convocatorias/:id/pasos/:pasoId/completar", async (request) => {
    const { pasoId } = request.params as { id: string; pasoId: string };
    return serializeBigInt(await completarPaso(pasoId));
  });

  // Documentos que pide esta convocatoria puntual (convocatoria_documentos).
  app.get("/convocatorias/:id/documentos", async (request) => {
    const { id } = request.params as { id: string };
    const documentos = await prisma.convocatoriaDocumento.findMany({
      where: { convocatoriaId: id },
      include: { documento: true },
    });
    return serializeBigInt(documentos);
  });
}
