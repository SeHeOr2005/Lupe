import { describe, expect, it } from "vitest";
import { idDeConvocatoriaEn, textoPedirDocumentos } from "../src/bot/formato.js";
import { EsperaDeDocumentos } from "../src/bot/espera.js";

const convocatoria = {
  id: "3cf12e6d-c28d-4a7a-b39f-f16921df9720",
  urlOrigen: "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.1&x=1",
};

describe("pedido del pliego después de aprobar", () => {
  const texto = textoPedirDocumentos(convocatoria);

  it("explica cómo descargar el PDF y enlaza al proceso", () => {
    expect(texto).toContain('<a href="https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.1&amp;x=1">');
    expect(texto).toContain("Documentos precontractuales");
    expect(texto).toContain("Cronograma");
    expect(texto).toContain("Responde a este mensaje");
  });

  it("lleva el id para que la respuesta quede asociada a la convocatoria", () => {
    expect(idDeConvocatoriaEn(texto)).toBe(convocatoria.id);
  });

  it("advierte cuando la entidad ya escogió o escoge directo la organización", () => {
    expect(textoPedirDocumentos({ ...convocatoria, analisisIa: { elegibilidad: { tipoProceso: "directo" } } })).toContain("⚠ Ojo");
    expect(textoPedirDocumentos({ ...convocatoria, analisisIa: { elegibilidad: { asignacion: {} } } })).toContain("⚠ Ojo");
    expect(texto).not.toContain("⚠ Ojo");
  });

  it("sin URL de SECOP, igual da las instrucciones", () => {
    expect(textoPedirDocumentos({ ...convocatoria, urlOrigen: "" })).toContain("página de la entidad");
  });
});

describe("convocatoria que espera documentos en el chat", () => {
  it("recuerda la última aprobada mientras esté vigente", () => {
    let ahora = 0;
    const espera = new EsperaDeDocumentos(1_000, () => ahora);
    espera.marcar(10, "a");
    espera.marcar(10, "b"); // la última aprobada manda
    ahora = 999;
    expect(espera.para(10)).toBe("b");
    ahora = 1_001;
    expect(espera.para(10)).toBeUndefined();
  });

  it("cada chat tiene la suya", () => {
    const espera = new EsperaDeDocumentos();
    espera.marcar(1, "x");
    expect(espera.para(2)).toBeUndefined();
  });
});
