import Fastify from "fastify";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { HttpError } from "./errors.js";
import { registerApiKeyAuth } from "./auth.js";
import { registerFuentesRoutes } from "./routes/fuentes.js";
import { registerConvocatoriasRoutes } from "./routes/convocatorias.js";
import { registerPostulacionesRoutes } from "./routes/postulaciones.js";
import { registerResultadosRoutes } from "./routes/resultados.js";
import { registerAdjudicacionesRoutes } from "./routes/adjudicaciones.js";
import { registerDocumentosRoutes } from "./routes/documentos.js";
import { registerRecordatoriosRoutes } from "./routes/recordatorios.js";
import { registerReadonlyRoutes } from "./routes/readonly.js";
import { swaggerSpec } from "../docs/swagger.js";

export function buildServer() {
  const app = Fastify({
    logger:
      env.NODE_ENV === "development"
        ? { transport: { target: "pino-pretty", options: { colorize: true } } }
        : env.NODE_ENV !== "test",
  });

  app.register(swagger, { mode: "static", specification: { document: swaggerSpec as never } });
  app.register(swaggerUi, {
    routePrefix: "/api-docs",
    uiConfig: { persistAuthorization: true },
    staticCSP: true,
  });

  app.register(sensible);
  registerApiKeyAuth(app, env.API_KEY);

  app.get("/health", async () => ({ status: "ok", env: env.NODE_ENV }));

  app.get("/api-docs.json", { config: { noAuth: true } }, async (_req, reply) => {
    reply.type("application/json");
    return swaggerSpec;
  });

  registerFuentesRoutes(app);
  registerConvocatoriasRoutes(app);
  registerPostulacionesRoutes(app);
  registerResultadosRoutes(app);
  registerAdjudicacionesRoutes(app);
  registerDocumentosRoutes(app);
  registerRecordatoriosRoutes(app);
  registerReadonlyRoutes(app);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: "ValidationError",
        message: "El cuerpo de la petición no es válido.",
        details: error.flatten(),
      });
      return;
    }

    if (error instanceof HttpError) {
      reply.code(error.statusCode).send({
        error: error.name,
        message: error.message,
        details: error.details,
      });
      return;
    }

    app.log.error(error);
    reply.code(500).send({ error: "InternalServerError", message: "Error interno del servidor." });
  });

  return app;
}
