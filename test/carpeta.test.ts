import { describe, expect, it } from "vitest";
import {
  cb,
  etiquetaBotonDocumento,
  leerAccionCarpeta,
  leerFechaEscrita,
  OPCIONES_TIPO,
  textoCarpeta,
  textoDetalleDocumento,
  vigencia,
  type DocumentoParaMostrar,
} from "../src/bot/carpetaFormato.js";
import { EstadoPorChat } from "../src/bot/espera.js";

const hoy = new Date("2026-11-04T15:00:00Z");
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);
const doc = (parcial: Partial<DocumentoParaMostrar>): DocumentoParaMostrar => ({
  id: "11111111-2222-3333-4444-555555555555",
  tipo: "rut",
  nombre: "RUT",
  fechaExpedicion: null,
  fechaVencimiento: null,
  ...parcial,
});

describe("fechas que escribe la persona", () => {
  it("entiende dd/mm/aaaa, con guiones y aaaa-mm-dd", () => {
    expect(leerFechaEscrita("15/03/2027")?.toISOString()).toBe("2027-03-15T00:00:00.000Z");
    expect(leerFechaEscrita("5-3-2027")?.toISOString()).toBe("2027-03-05T00:00:00.000Z");
    expect(leerFechaEscrita("2027-03-15")?.toISOString()).toBe("2027-03-15T00:00:00.000Z");
  });

  it("rechaza fechas que no existen o que no son fechas", () => {
    expect(leerFechaEscrita("31/02/2027")).toBeUndefined();
    expect(leerFechaEscrita("mañana")).toBeUndefined();
    expect(leerFechaEscrita("15/03/27")).toBeUndefined();
  });
});

describe("vigencia de un documento", () => {
  it("vigente, por vencer (30 días), vencido o sin fecha", () => {
    expect(vigencia(doc({ fechaVencimiento: dia("2027-06-01") }), hoy)).toBe("vigente");
    expect(vigencia(doc({ fechaVencimiento: dia("2026-11-20") }), hoy)).toBe("por_vencer");
    expect(vigencia(doc({ fechaVencimiento: dia("2026-11-04") }), hoy)).toBe("por_vencer"); // vence hoy: aún sirve
    expect(vigencia(doc({ fechaVencimiento: dia("2026-11-03") }), hoy)).toBe("vencido");
    expect(vigencia(doc({}), hoy)).toBe("sin_fecha");
  });

  it("el botón muestra el estado con un ícono", () => {
    expect(etiquetaBotonDocumento(doc({ fechaVencimiento: dia("2026-11-03") }), hoy)).toBe("❌ RUT");
    expect(etiquetaBotonDocumento(doc({ tipo: "otro", nombre: "Carta de la junta directiva" }), hoy)).toBe(
      "📄 Carta de la junta directiva",
    );
  });
});

describe("textos de la carpeta", () => {
  it("con la carpeta vacía, invita a subir el primero", () => {
    expect(textoCarpeta([], hoy)).toContain("Subir documento");
  });

  it("resume cuántos hay vencidos y por vencer", () => {
    const t = textoCarpeta(
      [doc({ fechaVencimiento: dia("2026-11-01") }), doc({ fechaVencimiento: dia("2026-11-10") }), doc({})],
      hoy,
    );
    expect(t).toContain("3 documentos");
    expect(t).toContain("1 vencido");
    expect(t).toContain("1 por vencer");
  });

  it("la ficha muestra tipo, fechas y estado sin correr el día", () => {
    const t = textoDetalleDocumento(
      doc({ fechaExpedicion: dia("2026-03-15"), fechaVencimiento: dia("2027-03-15") }),
      hoy,
    );
    expect(t).toContain("<b>RUT</b>");
    expect(t).toMatch(/Expedición: 15 de mar/);
    expect(t).toMatch(/Vence el 15 de mar.*2027/);
  });
});

describe("botones de la carpeta", () => {
  it("van y vuelven sin perder la acción ni el valor", () => {
    expect(leerAccionCarpeta(cb("ver", "abc"))).toEqual({ accion: "ver", valor: "abc" });
    expect(leerAccionCarpeta(cb("menu"))).toEqual({ accion: "menu", valor: "" });
    expect(leerAccionCarpeta("cp:hackear:x")).toBeUndefined();
    expect(leerAccionCarpeta("aprobar:x")).toBeUndefined();
  });

  it("caben en los 64 bytes que permite Telegram", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    for (const o of OPCIONES_TIPO) expect(Buffer.byteLength(cb("tipo", o.tipo))).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(cb("borrar", uuid))).toBeLessThanOrEqual(64);
  });
});

describe("estado de la conversación por chat", () => {
  it("vence solo y se puede quitar", () => {
    let ahora = 0;
    const e = new EstadoPorChat<string>(100, () => ahora);
    e.poner(1, "esperando archivo");
    expect(e.leer(1)).toBe("esperando archivo");
    e.quitar(1);
    expect(e.leer(1)).toBeUndefined();
    e.poner(1, "otra cosa");
    ahora = 101;
    expect(e.leer(1)).toBeUndefined();
  });
});
