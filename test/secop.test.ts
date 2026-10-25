import { describe, expect, it } from "vitest";
import { MAX_FILAS_SECOP, mapearFilaSecop, mapearRespuestaSecop } from "../src/scraping/secop.js";
import { calcularHuella } from "../src/jobs/hallazgo.js";

/** Fila real de datos.gov.co (p6dx-8zbt), recortada a las columnas que usamos. */
const filaReal = {
  entidad: "MUNICIPIO DE MANIZALES",
  id_del_proceso: "CO1.REQ.11200000",
  nombre_del_procedimiento: "AUNAR ESFUERZOS PARA BRINDAR ATENCION INTEGRAL A ADULTOS MAYORES",
  descripci_n_del_procedimiento: "Atención integral en vivienda, alimentación y salud.",
  fecha_de_publicacion_del: "2026-10-21T00:00:00.000",
  precio_base: "84609548",
  urlproceso: {
    url: "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.1",
  },
};

describe("mapeo de SECOP II", () => {
  it("traduce las columnas de SECOP a una convocatoria", () => {
    expect(mapearFilaSecop(filaReal)).toEqual({
      titulo: "AUNAR ESFUERZOS PARA BRINDAR ATENCION INTEGRAL A ADULTOS MAYORES",
      entidad: "MUNICIPIO DE MANIZALES",
      numeroProceso: "CO1.REQ.11200000",
      resumen: "Atención integral en vivienda, alimentación y salud.",
      fechaApertura: "2026-10-21",
      fechaCierre: undefined,
      montoMaximo: 84609548,
      urlOrigen: "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.1",
    });
  });

  it("no inventa monto cuando SECOP trae 0 o basura", () => {
    expect(mapearFilaSecop({ ...filaReal, precio_base: "0" }).montoMaximo).toBeUndefined();
    expect(mapearFilaSecop({ ...filaReal, precio_base: "No Definido" }).montoMaximo).toBeUndefined();
  });

  it("tolera filas vacías o incompletas", () => {
    const h = mapearFilaSecop({});
    expect(h.titulo).toBe("Sin título");
    expect(h.entidad).toBe("Entidad sin identificar");
    expect(h.urlOrigen).toBeUndefined();
  });

  it("ignora respuestas que no son una lista y recorta a MAX_FILAS_SECOP", () => {
    expect(mapearRespuestaSecop({ error: "algo" })).toEqual([]);
    expect(mapearRespuestaSecop(Array(MAX_FILAS_SECOP + 20).fill(filaReal))).toHaveLength(MAX_FILAS_SECOP);
  });
});

describe("huella de deduplicación", () => {
  const base = mapearFilaSecop(filaReal);

  it("es estable: la misma convocatoria da la misma huella", () => {
    expect(calcularHuella(base)).toBe(calcularHuella(mapearFilaSecop(filaReal)));
  });

  it("ignora mayúsculas y tildes del título", () => {
    expect(calcularHuella({ ...base, titulo: "Aunar esfuerzos para brindar atención integral a adultos mayores" })).toBe(
      calcularHuella(base),
    );
  });

  it("distingue procesos con el mismo título pero distinto número", () => {
    expect(calcularHuella({ ...base, numeroProceso: "CO1.REQ.999" })).not.toBe(calcularHuella(base));
  });
});
