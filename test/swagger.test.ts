import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

const API_KEY = "k".repeat(40);
process.env.NODE_ENV = "test";
process.env.API_KEY = API_KEY;
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

let app: FastifyInstance;

beforeAll(async () => {
  const { buildServer } = await import("../src/http/server.js");
  app = buildServer();
  await app.ready();
}, 30_000);

afterAll(() => app.close());

describe("especificación OpenAPI", () => {
  it("se sirve en /api-docs.json sin clave y declara ambos esquemas de seguridad", async () => {
    const res = await app.inject({ method: "GET", url: "/api-docs.json" });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.components.securitySchemes)).toEqual(["apiKey", "bearerAuth"]);
  });

  it("toda operación protegida documenta 401 y 500, y las de escritura 400", async () => {
    const spec = (await app.inject({ method: "GET", url: "/api-docs.json" })).json();
    for (const [ruta, item] of Object.entries<Record<string, any>>(spec.paths)) {
      for (const [metodo, op] of Object.entries<any>(item)) {
        const id = `${metodo.toUpperCase()} ${ruta}`;
        expect(op.tags?.length, `${id} sin tag`).toBeGreaterThan(0);
        expect(op.responses["500"], `${id} sin 500`).toBeDefined();
        if (op.security?.length === 0) continue; // ruta pública
        expect(op.responses["401"], `${id} sin 401`).toBeDefined();
        if (["post", "patch"].includes(metodo)) expect(op.responses["400"], `${id} sin 400`).toBeDefined();
        if (ruta.includes("{id}")) expect(op.responses["404"], `${id} sin 404`).toBeDefined();
      }
    }
  });
});

describe("manejo de errores documentado", () => {
  const headers = { "x-api-key": API_KEY };

  it("401 con el cuerpo { error, message } si falta la clave", async () => {
    const res = await app.inject({ method: "GET", url: "/convocatorias" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "HttpError", message: expect.any(String) });
  });

  it("acepta Authorization: Bearer además de x-api-key", async () => {
    const res = await app.inject({ method: "POST", url: "/fuentes", headers: { authorization: `Bearer ${API_KEY}` }, payload: {} });
    expect(res.statusCode).toBe(400); // pasó la autenticación y falló la validación
  });

  it("400 ValidationError con details por campo si el cuerpo es inválido", async () => {
    const res = await app.inject({ method: "POST", url: "/convocatorias", headers, payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "ValidationError", details: { fieldErrors: expect.any(Object) } });
  });
});
