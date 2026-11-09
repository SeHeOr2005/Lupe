import { describe, expect, it } from "vitest";
import {
  contextoParaBorrador,
  requisitosDe,
  tieneDetalle,
  valorOCampo,
  type ConvocatoriaParaBorrador,
  type DatosFundacion,
} from "../src/borradores/contexto.js";
import { crearWord, nombreArchivo, trozosConCampos } from "../src/borradores/word.js";

const datos: DatosFundacion = {
  nombreLegal: "Fundación Asisco Up",
  nit: "",
  representanteLegal: "",
  cargoRepresentante: "Directora",
  direccion: "",
  ciudad: "Manizales",
  telefono: "",
  correo: "",
  anioConstitucion: "",
  trayectoria: [],
};

const perfil = { nombre: "Fundación Asisco Up", descripcion: "Trabaja con niños con síndrome de Down.", temasAfines: ["discapacidad"] };

const convocatoria: ConvocatoriaParaBorrador = {
  titulo: "Fondo Semillas de Inclusión 2026",
  entidad: "Fundación Horizonte Andino",
  resumen: "Apoyar proyectos de inclusión educativa.",
  montoMaximo: { toString: () => "40000000.00" },
  fechaCierre: new Date("2026-11-28T22:00:00Z"),
  requisitos: {
    habilitantes: ["Dos años de constitución"],
    criteriosEvaluacion: ["Pertinencia (30 puntos)", "Experiencia (25 puntos)"],
    documentosExigidos: ["RUT", "Carta de presentación"],
  },
  pasos: [{ titulo: "Cierre de la convocatoria", descripcion: "28 de nov de 2026, 5:00 p. m." }],
};

describe("datos de la fundación", () => {
  it("lo que falta sale como [campo] para llenar, nunca inventado", () => {
    expect(valorOCampo(datos, "nit")).toBe("[NIT]");
    expect(valorOCampo(datos, "representanteLegal")).toBe("[Nombre del representante legal]");
    expect(valorOCampo(datos, "ciudad")).toBe("Manizales");
  });
});

describe("contexto para la IA", () => {
  const texto = contextoParaBorrador(convocatoria, perfil, datos);

  it("incluye lo que se sabe de la convocatoria, sobre todo los criterios de evaluación", () => {
    expect(texto).toContain("Fondo Semillas de Inclusión 2026");
    expect(texto).toContain("Monto máximo: $40.000.000 COP");
    expect(texto).toContain("- Pertinencia (30 puntos)");
    expect(texto).toContain("- Cierre de la convocatoria (28 de nov de 2026, 5:00 p. m.)");
  });

  it("le dice a la IA que no hay trayectoria registrada, para que use corchetes", () => {
    expect(texto).toContain("Trayectoria y logros: no hay datos; usa campos entre corchetes.");
    expect(texto).toContain("Año de constitución: [Año de constitución]");
  });

  it("si hay trayectoria real, la pasa tal cual", () => {
    const t = contextoParaBorrador(convocatoria, perfil, { ...datos, trayectoria: ["Atiende 80 niños desde 2015"] });
    expect(t).toContain("- Atiende 80 niños desde 2015");
  });

  it("tolera requisitos vacíos o con otro formato", () => {
    expect(requisitosDe(null)).toEqual({ habilitantes: [], criteriosEvaluacion: [], documentosExigidos: [] });
    expect(requisitosDe({ habilitantes: "no es lista" }).habilitantes).toEqual([]);
  });

  it("sabe si la convocatoria tiene sus documentos leídos", () => {
    expect(tieneDetalle(convocatoria)).toBe(true);
    expect(tieneDetalle({ ...convocatoria, requisitos: null, pasos: [] })).toBe(false);
  });
});

describe("archivo Word", () => {
  it("separa los [campos] para resaltarlos", () => {
    expect(trozosConCampos("Atendemos [número de niños] niños en [ciudad].")).toEqual([
      { texto: "Atendemos ", campo: false },
      { texto: "[número de niños]", campo: true },
      { texto: " niños en ", campo: false },
      { texto: "[ciudad]", campo: true },
      { texto: ".", campo: false },
    ]);
    expect(trozosConCampos("Sin campos.")).toEqual([{ texto: "Sin campos.", campo: false }]);
  });

  it("nombra el archivo según el tipo y la convocatoria", () => {
    expect(nombreArchivo("carta", "Fondo Semillas de Inclusión 2026")).toBe("carta-de-presentacion-fondo-semillas-de-inclusion-2026.docx");
    expect(nombreArchivo("propuesta", "")).toBe("propuesta-tecnica.docx");
  });

  it("genera un .docx válido para los dos tipos", async () => {
    const borrador = { asunto: "Presentación de propuesta", secciones: [{ titulo: "Objetivos", parrafos: ["Texto con [campo]."] }], camposPorCompletar: ["[campo]"] };
    for (const tipo of ["carta", "propuesta"] as const) {
      const archivo = await crearWord(tipo, borrador, { titulo: "Convocatoria", entidad: "Entidad", datos });
      expect(archivo.subarray(0, 2).toString()).toBe("PK"); // un .docx es un zip
      expect(archivo.length).toBeGreaterThan(3000);
    }
  });
});

describe("campos por completar", () => {
  it("siempre entre corchetes y sin repetir, aunque la IA los liste distinto", async () => {
    const { normalizarCampos } = await import("../src/borradores/contexto.js");
    expect(normalizarCampos(["Año de constitución", "[NIT]", "[NIT]", " [confirmar: equipo] ", ""])).toEqual([
      "[Año de constitución]",
      "[NIT]",
      "[confirmar: equipo]",
    ]);
  });
});
