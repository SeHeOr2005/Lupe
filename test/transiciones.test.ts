import { describe, expect, it } from "vitest";
import { esTransicionPermitida, transicionesDesde, type EstadoConvocatoria } from "../src/services/transiciones.js";

describe("ciclo de vida de una convocatoria", () => {
  it("permite el camino feliz completo", () => {
    const camino: EstadoConvocatoria[] = [
      "detectada",
      "pendiente_aprobacion",
      "aprobada",
      "en_postulacion",
      "postulada",
      "ganada",
    ];
    for (let i = 0; i < camino.length - 1; i++) {
      expect(esTransicionPermitida(camino[i]!, camino[i + 1]!)).toBe(true);
    }
  });

  it("no deja saltarse la aprobación de la directora", () => {
    expect(esTransicionPermitida("detectada", "aprobada")).toBe(false);
    expect(esTransicionPermitida("pendiente_aprobacion", "en_postulacion")).toBe(false);
  });

  it("solo deja descartar mientras espera aprobación", () => {
    expect(esTransicionPermitida("pendiente_aprobacion", "descartada")).toBe(true);
    expect(esTransicionPermitida("aprobada", "descartada")).toBe(false);
  });

  it("solo lo que espera aprobación puede re-evaluarse como no_apta", () => {
    expect(esTransicionPermitida("pendiente_aprobacion", "no_apta")).toBe(true);
    expect(esTransicionPermitida("aprobada", "no_apta")).toBe(false);
  });

  it("una convocatoria ya postulada no puede vencer, solo esperar resultado", () => {
    expect(transicionesDesde("postulada")).toEqual(["ganada", "no_ganada"]);
  });

  it("lo que ocultó el filtro puede volver a pendientes, lo que descartó la directora no", () => {
    expect(transicionesDesde("no_apta")).toEqual(["pendiente_aprobacion"]);
    expect(transicionesDesde("descartada")).toEqual([]);
  });

  it("los estados finales no tienen salida", () => {
    for (const final of ["ganada", "no_ganada", "descartada", "vencida"] as const) {
      expect(transicionesDesde(final)).toEqual([]);
    }
  });
});
