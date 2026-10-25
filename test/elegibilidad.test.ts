import { describe, expect, it } from "vitest";
import { evaluarReglas } from "../src/elegibilidad/reglas.js";
import { asignacionDe, razonElegibilidad, tarjetaConvocatoria } from "../src/bot/formato.js";
import { nombreSiEsOrganizacion, type Hallazgo } from "../src/jobs/hallazgo.js";
import { detectarAsignacion } from "../src/elegibilidad/evaluar.js";
import { estaSeleccionado } from "../src/scraping/secop.js";

const manizales = (titulo: string): Hallazgo => ({ titulo, entidad: "MUNICIPIO DE MANIZALES" });

describe("reglas fijas de elegibilidad", () => {
  it("descarta entidades de otros municipios", () => {
    const v = evaluarReglas({ titulo: "AUNAR ESFUERZOS PARA ATENDER NIÑOS", entidad: "MUNICIPIO LA DORADA" });
    expect(v.apta).toBe(false);
  });

  it("deja pasar a la IA lo de Manizales y la Gobernación", () => {
    expect(evaluarReglas(manizales("AUNAR ESFUERZOS PARA LA INCLUSIÓN EDUCATIVA")).apta).toBe("por_evaluar");
    expect(evaluarReglas({ titulo: "Convenio de inclusión", entidad: "GOBERNACION DE CALDAS" }).apta).toBe("por_evaluar");
  });

  it("descarta préstamos, predios y bomberos", () => {
    expect(evaluarReglas(manizales("CONTRATO DE EMPRÉSTITO DE DEUDA PÚBLICA INTERNA")).apta).toBe(false);
    expect(evaluarReglas(manizales("COMPRAVENTA PREDIO LA MARIA")).apta).toBe(false);
    expect(evaluarReglas(manizales("CONVENIO PARA EL FUNCIONAMIENTO DEL CUERPO DE BOMBEROS")).apta).toBe(false);
  });

  it("no descarta convenios ya asignados: la directora quiere verlos si son de su tema", () => {
    expect(evaluarReglas(manizales("LA FUNDACION LUKER")).apta).toBe("por_evaluar");
    expect(evaluarReglas(manizales("CORPORACION LOMAS ANCHAS")).apta).toBe("por_evaluar");
  });
});

describe("convenios ya asignados", () => {
  it("reconoce cuándo el título es el nombre de una organización", () => {
    expect(nombreSiEsOrganizacion("LA FUNDACION LUKER")).toBe("LA FUNDACION LUKER");
    expect(nombreSiEsOrganizacion("CORPORACIÓN PARA EL DESARROLLO SOCIAL Y LA CALIDAD DE VIDA")).toBe(
      "CORPORACIÓN PARA EL DESARROLLO SOCIAL Y LA CALIDAD DE VIDA",
    );
    expect(nombreSiEsOrganizacion("CONVENIO DE ASOCIACION BATUTA")).toBe("BATUTA");
  });

  it("no confunde un objeto de contrato con un nombre", () => {
    expect(nombreSiEsOrganizacion("ASOCIACIÓN PARA APOYAR LA INCLUSIÓN DE NIÑOS CON DISCAPACIDAD")).toBeUndefined();
    expect(nombreSiEsOrganizacion("FESTIVAL INTERNACIONAL DE TEATRO")).toBeUndefined();
    expect(nombreSiEsOrganizacion("AUNAR ESFUERZOS PARA LA INCLUSIÓN")).toBeUndefined();
  });

  const veredicto = (asignadoA: string) => ({ indice: 0, apta: true, razon: "", asignadoA });

  it("prefiere el contratista que publica SECOP, luego el que reconoce la IA, luego el título", () => {
    const h = manizales("LA FUNDACION LUKER");
    expect(detectarAsignacion({ ...h, contratista: "FUNDACION LUKER S.A." }, veredicto("Luker"))).toEqual({
      organizacion: "FUNDACION LUKER S.A.",
    });
    expect(detectarAsignacion(manizales("BATUTA"), veredicto("Fundación Batuta"))).toEqual({
      organizacion: "Fundación Batuta",
    });
    expect(detectarAsignacion(h, veredicto(""))).toEqual({ organizacion: "LA FUNDACION LUKER" });
  });

  it("si SECOP dice 'Seleccionado' pero no se sabe a quién, igual lo marca como asignado", () => {
    expect(detectarAsignacion({ ...manizales("UNIDAD MOVIL"), yaSeleccionado: true }, veredicto(""))).toEqual({});
  });

  it("un proceso abierto con objeto normal no queda marcado", () => {
    expect(detectarAsignacion(manizales("AUNAR ESFUERZOS PARA LA INCLUSIÓN"), veredicto(""))).toBeUndefined();
  });

  it("lee 'Seleccionado' y 'adjudicado' de SECOP", () => {
    expect(estaSeleccionado("Seleccionado")).toBe(true);
    expect(estaSeleccionado("Publicado", "Si")).toBe(true);
    expect(estaSeleccionado("Publicado", "No")).toBe(false);
  });
});

describe("etiqueta de asignación en el bot", () => {
  const base = {
    id: "11111111-2222-3333-4444-555555555555",
    titulo: "BATUTA",
    entidad: "GOBERNACION DE CALDAS",
    resumen: null,
    urlOrigen: "",
    montoMaximo: null,
    fechaApertura: null,
    fechaCierre: null,
  };

  it("dice a quién está asignado cuando se sabe", () => {
    const t = tarjetaConvocatoria({ ...base, analisisIa: { elegibilidad: { asignacion: { organizacion: "Fundación Batuta" } } } });
    expect(t).toContain("Ya asignado a: Fundación Batuta");
  });

  it("avisa que está asignado aunque SECOP no diga a quién", () => {
    const t = tarjetaConvocatoria({ ...base, analisisIa: { elegibilidad: { asignacion: {} } } });
    expect(t).toContain("Ya asignado</b> (SECOP no publica a quién)");
  });

  it("no muestra nada en convocatorias abiertas", () => {
    expect(tarjetaConvocatoria({ ...base, analisisIa: { elegibilidad: { apta: true } } })).not.toContain("asignado");
    expect(asignacionDe(null)).toBeUndefined();
  });
});

describe("razón de elegibilidad en el bot", () => {
  it("solo se muestra si la convocatoria quedó apta", () => {
    expect(razonElegibilidad({ elegibilidad: { apta: true, razon: "Inclusión educativa" } })).toBe("Inclusión educativa");
    expect(razonElegibilidad({ elegibilidad: { apta: false, razon: "Otro tema" } })).toBeUndefined();
    expect(razonElegibilidad(null)).toBeUndefined();
  });
});
