import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { citaAparece, normalizarParaCita, textoNormalizadoDePdf } from "../src/explorador/citas.js";
import { armarPlan, describirFecha, leerFechaColombia } from "../src/explorador/plan.js";
import { idDeConvocatoriaEn, textoResumenExploracion } from "../src/bot/formato.js";
import type { ExtraccionDocumentos } from "../src/ai/explorador.js";

const extraccion = (parcial: Partial<ExtraccionDocumentos>): ExtraccionDocumentos => ({
  cronograma: [],
  documentosExigidos: [],
  requisitosHabilitantes: [],
  criteriosEvaluacion: [],
  advertencias: [],
  ...parcial,
});

describe("fechas en hora de Colombia", () => {
  it("lee fecha y hora como hora de Colombia (UTC-5)", () => {
    expect(leerFechaColombia("2026-11-14T17:00")?.toISOString()).toBe("2026-11-14T22:00:00.000Z");
  });

  it("sin hora, el cierre es al final del día para no adelantarlo", () => {
    expect(leerFechaColombia("2026-11-14")?.toISOString()).toBe("2026-11-15T04:59:00.000Z");
  });

  it("ignora textos que no son fechas", () => {
    expect(leerFechaColombia("3 días hábiles después")).toBeUndefined();
    expect(leerFechaColombia(undefined)).toBeUndefined();
  });

  it("muestra la hora solo si el documento la daba", () => {
    expect(describirFecha("2026-11-14T17:00")).toMatch(/14 de nov.*2026.*5:00/);
    expect(describirFecha("2026-11-14")).not.toMatch(/:/);
  });
});

describe("verificación de citas", () => {
  it("compara sin tildes, mayúsculas ni puntuación", () => {
    expect(normalizarParaCita("Presentación de Propuestas: 14/11")).toBe("presentacion de propuestas 14 11");
  });

  it("encuentra la cita en el texto real de un PDF", async () => {
    const texto = await textoNormalizadoDePdf(readFileSync("test/fixtures/invitacion.pdf"));
    expect(citaAparece("Presentación de propuestas: hasta el 14 de noviembre de 2026 a las 5:00 p. m.", texto)).toBe(true);
  });

  it("no da por buena una cita inventada", async () => {
    const texto = await textoNormalizadoDePdf(readFileSync("test/fixtures/invitacion.pdf"));
    expect(citaAparece("Cierre: 30 de diciembre de 2026", texto)).toBe(false);
  });

  it("no acepta citas tan cortas que no prueban nada", () => {
    expect(citaAparece("2026", "presentacion 2026")).toBe(false);
  });
});

describe("plan de guardado", () => {
  const textoPdf = normalizarParaCita("Presentación de propuestas: hasta el 14 de noviembre de 2026 a las 5:00 p. m.");

  it("marca la fecha de cierre como confirmada si la cita está en el PDF", () => {
    const plan = armarPlan(
      extraccion({ fechaCierre: "2026-11-14T17:00", citaFechaCierre: "hasta el 14 de noviembre de 2026 a las 5:00 p. m." }),
      { textoPdf, hayCapturas: false },
    );
    expect(plan.fechaCierre).toMatchObject({ verificada: true, origen: "pdf" });
  });

  it("si la fecha solo sale de una captura, queda sin verificar", () => {
    const plan = armarPlan(extraccion({ fechaCierre: "2026-11-20T10:00", citaFechaCierre: "20/11/2026 10:00 AM" }), {
      textoPdf,
      hayCapturas: true,
    });
    expect(plan.fechaCierre).toMatchObject({ verificada: false, origen: "captura" });
  });

  it("si el modelo no dio la fecha de cierre, la toma del cronograma", () => {
    const plan = armarPlan(
      extraccion({
        cronograma: [
          { actividad: "Publicación", fecha: "2026-11-03" },
          { actividad: "Presentación de propuestas", fecha: "2026-11-14T17:00" },
        ],
      }),
      { textoPdf: "", hayCapturas: false },
    );
    expect(plan.fechaCierre?.fecha.toISOString()).toBe("2026-11-14T22:00:00.000Z");
    expect(plan.fechaCierre?.origen).toBe("sin_respaldo");
  });

  it("convierte el cronograma en pasos con su fecha y detalle", () => {
    const plan = armarPlan(
      extraccion({
        cronograma: [
          { actividad: "Manifestación de interés", detalle: "3 días hábiles desde la apertura" },
          { actividad: "Presentación de propuestas", fecha: "2026-11-14T17:00", detalle: "en SECOP II" },
        ],
      }),
      { textoPdf: "", hayCapturas: false },
    );
    expect(plan.pasos[0]).toEqual({ titulo: "Manifestación de interés", descripcion: "3 días hábiles desde la apertura" });
    expect(plan.pasos[1]?.descripcion).toMatch(/14 de nov.*5:00.*· en SECOP II/);
  });

  it("agrupa los documentos por tipo (uno por tipo, los «otro» juntos)", () => {
    const plan = armarPlan(
      extraccion({
        documentosExigidos: [
          { nombre: "RUT", tipo: "rut" },
          { nombre: "Carta de presentación", tipo: "otro" },
          { nombre: "Garantía de seriedad", tipo: "otro" },
          { nombre: "RUT", tipo: "rut" },
        ],
      }),
      { textoPdf: "", hayCapturas: false },
    );
    expect(plan.documentos).toEqual([
      { tipo: "rut", descripcion: "RUT" },
      { tipo: "otro", descripcion: "Carta de presentación; Garantía de seriedad" },
    ]);
  });
});

describe("bot: archivos de una convocatoria", () => {
  it("encuentra el id en la tarjeta a la que se respondió", () => {
    const tarjeta = "AUNAR ESFUERZOS...\n🔗 Ver el proceso\n11111111-2222-3333-4444-555555555555";
    expect(idDeConvocatoriaEn(tarjeta)).toBe("11111111-2222-3333-4444-555555555555");
    expect(idDeConvocatoriaEn("hola")).toBeUndefined();
  });

  it("el resumen dice el cierre, los pasos y qué documentos faltan", () => {
    const texto = textoResumenExploracion({
      titulo: "Atención a niños con discapacidad",
      fechaCierre: { fecha: new Date("2026-11-14T22:00:00Z"), origen: "captura" },
      pasos: [{ titulo: "Presentación de propuestas", descripcion: "14 nov 2026" }],
      documentos: [
        { tipo: "rut", descripcion: "RUT", listo: true },
        { tipo: "otro", descripcion: "Carta de presentación", listo: false },
      ],
      requisitosHabilitantes: ["Experiencia de 2 años"],
      advertencias: [],
      archivosLeidos: 2,
    });
    expect(texto).toContain("los 2 archivos");
    expect(texto).toMatch(/14 de noviembre de 2026/);
    expect(texto).toContain("tomada de la captura");
    expect(texto).toContain("ya tienes 1 de 2");
    expect(texto).toContain("✅ RUT");
    expect(texto).toContain("⬜ Carta de presentación");
  });
});
