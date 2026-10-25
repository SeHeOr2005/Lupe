import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

// La configuración se lee al importar, así que el entorno va antes del import del
// servidor. DATABASE_URL es falsa a propósito: ninguna de estas rutas toca la base.
const API_KEY = "k".repeat(40);
process.env.NODE_ENV = "test";
process.env.API_KEY = API_KEY;
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

let app: FastifyInstance;

beforeAll(async () => {
  const { buildServer } = await import("../src/http/server.js");
  app = buildServer();
  await app.ready();
});

afterAll(() => app.close());

describe("API key", () => {
  it("deja pasar /health sin clave", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("rechaza peticiones sin clave", async () => {
    const res = await app.inject({ method: "GET", url: "/convocatorias" });
    expect(res.statusCode).toBe(401);
  });

  it("rechaza una clave equivocada", async () => {
    const res = await app.inject({ method: "GET", url: "/convocatorias", headers: { "x-api-key": "otra" } });
    expect(res.statusCode).toBe(401);
  });

  it("acepta la clave correcta por x-api-key y por Bearer", async () => {
    // Ruta inexistente: si la clave pasa, Fastify responde 404 sin tocar la base.
    const porHeader = await app.inject({ method: "GET", url: "/no-existe", headers: { "x-api-key": API_KEY } });
    const porBearer = await app.inject({
      method: "GET",
      url: "/no-existe",
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(porHeader.statusCode).toBe(404);
    expect(porBearer.statusCode).toBe(404);
  });
});
