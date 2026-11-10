import { describe, expect, it } from "vitest";
import {
  barraProgreso,
  diasParaCierre,
  etiquetaConvocatoria,
  etiquetaDocumento,
  etiquetaPaso,
  iconoAvance,
  textoChecklist,
  textoCierre,
  textoListaAprobadas,
} from "../src/bot/seguimientoFormato.js";

// 10 de noviembre de 2026, 9:00 a. m. en Colombia (14:00 UTC)
const hoy = new Date("2026-11-10T14:00:00Z");

describe("días para el cierre (hora de Colombia)", () => {
  it("cuenta días de calendario, no horas", () => {
    expect(diasParaCierre(new Date("2026-11-28T22:00:00Z"), hoy)).toBe(18);
    expect(diasParaCierre(new Date("2026-11-11T04:00:00Z"), hoy)).toBe(0); // 10 nov a las 11 p. m. en Colombia: hoy
    expect(diasParaCierre(null, hoy)).toBeUndefined();
  });

  it("lo dice en palabras", () => {
    expect(textoCierre(new Date("2026-11-10T22:00:00Z"), hoy)).toBe("cierra hoy");
    expect(textoCierre(new Date("2026-11-11T22:00:00Z"), hoy)).toBe("cierra mañana");
    expect(textoCierre(new Date("2026-11-28T22:00:00Z"), hoy)).toBe("cierra en 18 días");
    expect(textoCierre(new Date("2026-11-09T22:00:00Z"), hoy)).toBe("cerró ayer");
    expect(textoCierre(new Date("2026-11-05T22:00:00Z"), hoy)).toBe("cerró hace 5 días");
    expect(textoCierre(null, hoy)).toBe("sin fecha de cierre");
  });
});

describe("avance", () => {
  it("la barra tiene 10 casillas proporcionales", () => {
    expect(barraProgreso(3, 6)).toBe("▰▰▰▰▰▱▱▱▱▱");
    expect(barraProgreso(0, 0)).toBe("▱▱▱▱▱▱▱▱▱▱");
    expect(barraProgreso(7, 7)).toBe("▰▰▰▰▰▰▰▰▰▰");
  });

  it("el ícono prioriza lo terminado y lo urgente", () => {
    expect(iconoAvance(5, 5, 1)).toBe("🟢");
    expect(iconoAvance(2, 5, 2)).toBe("🔴");
    expect(iconoAvance(2, 5, 20)).toBe("🟡");
    expect(iconoAvance(0, 5, 20)).toBe("⚪");
  });

  it("el botón de la lista resume avance, cierre y título", () => {
    const etiqueta = etiquetaConvocatoria(
      { id: "x", titulo: "Fondo Semillas de Inclusión 2026", fechaCierre: new Date("2026-11-28T22:00:00Z"), pasosHechos: 3, pasosTotal: 7 },
      hoy,
    );
    expect(etiqueta).toBe("🟡 3/7 · cierra en 18 días · Fondo Semillas de Inclusión 2026");
  });

  it("dice cuando no hay convocatorias aprobadas", () => {
    expect(textoListaAprobadas(0)).toContain("No tienes convocatorias aprobadas");
    expect(textoListaAprobadas(2)).toContain("(2)");
  });
});

describe("checklist", () => {
  const conv = {
    id: "11111111-2222-3333-4444-555555555555",
    titulo: "Fondo Semillas de Inclusión 2026",
    entidad: "Fundación Horizonte Andino",
    estado: "en_postulacion",
    fechaCierre: new Date("2026-11-28T22:00:00Z"),
  };
  const pasos = [
    { id: "p1", titulo: "Apertura", descripcion: "10 de nov de 2026", completado: true },
    { id: "p2", titulo: "Cierre de la convocatoria", descripcion: null, completado: false },
  ];
  const documentos = [
    { id: "d1", tipo: "rut", descripcion: "RUT", estado: "listo" as const },
    { id: "d2", tipo: "otro", descripcion: "Carta de presentación", estado: "pendiente" as const },
    { id: "d3", tipo: "estados_financieros", descripcion: null, estado: "no_aplica" as const },
  ];

  it("muestra avance de pasos y documentos, y el id para responder con el pliego", () => {
    const t = textoChecklist(conv, pasos, documentos, hoy);
    expect(t).toContain("cierra en 18 días");
    expect(t).toContain("Paso a paso</b> · 1 de 2");
    expect(t).toContain("✅ 1. Apertura");
    expect(t).toContain("⬜ 2. Cierre de la convocatoria");
    expect(t).toContain("Documentos</b> · 2 de 3 listos"); // "no aplica" cuenta como resuelto
    expect(t).toContain("➖ Estados financieros");
    expect(t).toContain(conv.id);
  });

  it("sin pasos, pide el pliego", () => {
    expect(textoChecklist(conv, [], [], hoy)).toContain("Aún no tengo su paso a paso");
  });

  it("celebra cuando todo está hecho", () => {
    expect(textoChecklist(conv, pasos.map((p) => ({ ...p, completado: true })), [], hoy)).toContain("Todos los pasos están hechos");
  });

  it("los botones muestran el estado y se recortan", () => {
    expect(etiquetaPaso(pasos[0]!, 0)).toBe("✅ 1. Apertura");
    expect(etiquetaDocumento(documentos[1]!)).toBe("⬜ Carta de presentación");
    expect(etiquetaPaso({ ...pasos[1]!, titulo: "Una etapa con un nombre larguísimo que no cabe en un botón" }, 1).length).toBeLessThanOrEqual(48);
  });
});
