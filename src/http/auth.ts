import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HttpError } from "./errors.js";

/** Rutas que no piden clave (monitoreo del hosting). */
const RUTAS_PUBLICAS = new Set(["/health"]);

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
 * Exige `API_KEY` en toda petición salvo las de RUTAS_PUBLICAS. Sin `apiKey`
 * (solo permitido fuera de producción, ver config/env.ts) la API queda abierta.
 */
export function registerApiKeyAuth(app: FastifyInstance, apiKey: string | undefined) {
  if (!apiKey) {
    app.log.warn("API_KEY no está configurada: la API queda abierta (solo aceptable en desarrollo).");
    return;
  }

  app.addHook("onRequest", async (request) => {
    if (RUTAS_PUBLICAS.has(request.routeOptions.url ?? "")) return;
    const recibida = claveDeLaPeticion(request);
    if (!recibida || !coincide(recibida, apiKey)) {
      throw new HttpError(401, "Falta la API key o no es válida (header x-api-key).");
    }
  });
}
