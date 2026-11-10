import { describe, expect, it } from "vitest";
import {
  etiquetaEsperando,
  leerMonto,
  textoListaResultados,
  textoPedirMonto,
  textoResultadoRegistrado,
} from "../src/bot/resultadosFormato.js";

describe("montos escritos a mano", () => {
  it("entiende el formato colombiano con puntos de miles", () => {
    expect(leerMonto("$40.000.000")).toBe(40_000_000);
    expect(leerMonto("38.500.000")).toBe(38_500_000);
    expect(leerMonto("40.000.000,50")).toBe(40_000_001); // se redondea al peso
    expect(leerMonto("40'000.000")).toBe(40_000_000);
  });

  it("entiende el número sin separadores y en millones", () => {
    expect(leerMonto("40000000")).toBe(40_000_000);
    expect(leerMonto("38,5 millones")).toBe(38_500_000);
    expect(leerMonto("40 millones de pesos")).toBe(40_000_000);
    expect(leerMonto("40M")).toBe(40_000_000);
  });

  it("rechaza lo que no es un monto razonable", () => {
    expect(leerMonto("cuarenta millones")).toBeUndefined();
    expect(leerMonto("0")).toBeUndefined();
    expect(leerMonto("500")).toBeUndefined(); // menos de mil pesos: seguro un error
    expect(leerMonto("")).toBeUndefined();
  });
});

describe("textos de /resultado", () => {
  const e = {
    titulo: "Fondo Semillas de Inclusión 2026",
    entidad: "Fundación Horizonte Andino",
    fechaRadicacion: new Date("2026-11-25T00:00:00Z"),
    numeroRadicado: "R-2026-0457",
    montoMaximo: { toString: () => "40000000.00" },
  };

  it("el botón muestra la convocatoria y cuándo se radicó", () => {
    expect(etiquetaEsperando(e)).toBe("📮 Fondo Semillas de Inclusión 2026 · 25 de noviembre de 2026");
  });

  it("dice cuando no hay nada esperando resultado", () => {
    expect(textoListaResultados(0)).toContain("No tienes postulaciones esperando resultado");
  });

  it("ofrece el monto máximo como atajo", () => {
    expect(textoPedirMonto(e)).toMatch(/monto máximo \(\$\s?40\.000\.000\)/);
    expect(textoPedirMonto({ ...e, montoMaximo: null })).not.toContain("monto máximo");
  });

  it("confirma ganada con el monto, o no ganada", () => {
    expect(textoResultadoRegistrado(e.titulo, true, 38_500_000)).toMatch(/Monto adjudicado: <b>\$\s?38\.500\.000<\/b>/);
    expect(textoResultadoRegistrado(e.titulo, false)).toContain("no fue seleccionada");
  });
});
