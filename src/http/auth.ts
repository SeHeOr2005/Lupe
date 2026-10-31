import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HttpError } from "./errors.js";

declare module "fastify" {
  interface FastifyContextConfig {
    /** Marca una ruta como pública: no pide API key (ej. `app.get(url, { config: { noAuth: true } }, ...)`). */
    noAuth?: boolean;
  }
}

/**
 * Rutas que no piden clave: el monitoreo del hosting y el webhook de Telegram
 * (ese lo protege su propio secreto, TELEGRAM_WEBHOOK_SECRET, que valida grammY).
 */
const RUTAS_PUBLICAS = new Set(["/health", "/telegram/webhook"]);

/**
 * La documentación (Swagger UI y la spec OpenAPI) es pública: describe la API
 * pero no expone datos, y el navegador no puede mandar el header x-api-key al
 * abrirla. Las rutas del plugin swagger-ui no admiten `noAuth`, por eso va por prefijo.
 */
const PREFIJO_DOCS = "/api-docs";

function esPublica(request: FastifyRequest): boolean {
  const url = request.routeOptions.url ?? "";
  return (
    RUTAS_PUBLICAS.has(url) ||
    url === PREFIJO_DOCS ||
    url.startsWith(`${PREFIJO_DOCS}/`) ||
    url.startsWith(`${PREFIJO_DOCS}.`) ||
    request.routeOptions.config?.noAuth === true
  );
}

function claveDeLaPeticion(request: FastifyRequest): string | undefined {
  const header = request.headers["x-api-key"];
  if (typeof header === "string") return header;
  const auth = request.headers.authorization;
  return auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
}

/** Comparación en tiempo constante, para no filtrar la clave por tiempos de respuesta. */
function coincide(recibida: string, esperada: string): boolean {
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Exige `API_KEY` en toda petición salvo las públicas (ver `esPublica`). Sin `apiKey`
 * (solo permitido fuera de producción, ver config/env.ts) la API queda abierta.
 */
export function registerApiKeyAuth(app: FastifyInstance, apiKey: string | undefined) {
  if (!apiKey) {
    app.log.warn("API_KEY no está configurada: la API queda abierta (solo aceptable en desarrollo).");
    return;
  }

  app.addHook("onRequest", async (request) => {
    if (esPublica(request)) return;
    const recibida = claveDeLaPeticion(request);
    if (!recibida || !coincide(recibida, apiKey)) {
      throw new HttpError(401, "Falta la API key o no es válida (header x-api-key).");
    }
  });
}
