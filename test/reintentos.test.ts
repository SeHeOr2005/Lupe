import { describe, expect, it } from "vitest";
import { conModeloDeRespaldo, esErrorTemporal, mensajeErrorIa } from "../src/ai/reintentos.js";

/** Así llega el 503 de Gemini: un ApiError con status y el JSON de Google en el mensaje. */
const saturado = Object.assign(
  new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}'),
  { status: 503 },
);
const claveInvalida = Object.assign(new Error('{"error":{"code":400,"message":"API key not valid."}}'), { status: 400 });

describe("errores temporales de Gemini", () => {
  it("reconoce la saturación (503) y el cupo por minuto (429)", () => {
    expect(esErrorTemporal(saturado)).toBe(true);
    expect(esErrorTemporal(Object.assign(new Error("x"), { status: 429 }))).toBe(true);
    expect(esErrorTemporal(new Error("fetch failed"))).toBe(true);
  });

  it("no reintenta errores permanentes", () => {
    expect(esErrorTemporal(claveInvalida)).toBe(false);
  });
});

describe("reintentos con modelo de respaldo", () => {
  const sinEspera = { esperaBaseMs: 0 };

  it("reintenta el mismo modelo si la falla es pasajera", async () => {
    const llamados: string[] = [];
    const r = await conModeloDeRespaldo(
      ["flash", "flash-lite"],
      async (m) => {
        llamados.push(m);
        if (llamados.length < 2) throw saturado;
        return "ok";
      },
      sinEspera,
    );
    expect(r).toBe("ok");
    expect(llamados).toEqual(["flash", "flash"]);
  });

  it("pasa al modelo de respaldo si el primero sigue saturado", async () => {
    const llamados: string[] = [];
    const r = await conModeloDeRespaldo(
      ["flash", "flash-lite"],
      async (m) => {
        llamados.push(m);
        if (m === "flash") throw saturado;
        return `ok con ${m}`;
      },
      sinEspera,
    );
    expect(r).toBe("ok con flash-lite");
    expect(llamados).toEqual(["flash", "flash", "flash", "flash-lite"]);
  });

  it("no insiste con un error permanente", async () => {
    let llamados = 0;
    await expect(
      conModeloDeRespaldo(["flash", "flash-lite"], async () => {
        llamados++;
        throw claveInvalida;
      }, sinEspera),
    ).rejects.toBe(claveInvalida);
    expect(llamados).toBe(1);
  });

  it("si todo falla, lanza el último error", async () => {
    await expect(conModeloDeRespaldo(["a", "b"], async () => Promise.reject(saturado), sinEspera)).rejects.toBe(saturado);
  });

  it("no repite el modelo si evaluador y explorador son el mismo", async () => {
    let llamados = 0;
    await conModeloDeRespaldo(["igual", "igual"], async () => (++llamados === 4 ? "ok" : Promise.reject(saturado)), sinEspera).catch(
      () => {},
    );
    expect(llamados).toBe(3);
  });
});

describe("mensaje para el bot", () => {
  it("explica la saturación sin mostrar el JSON de Google", () => {
    const m = mensajeErrorIa(saturado);
    expect(m).toContain("saturada");
    expect(m).not.toContain("{");
  });

  it("distingue el cupo agotado", () => {
    expect(mensajeErrorIa(Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 }))).toContain("cupo");
  });
});
