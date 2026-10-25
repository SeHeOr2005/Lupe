/**
 * SECOP II vía datos.gov.co (dataset p6dx-8zbt, "Procesos de Contratación").
 * Ya viene estructurado, así que no gasta IA. El filtro (departamento, Decreto 092, etc.) va
 * en el `$where` de `fuentes.url_base`; aquí solo se traducen las columnas de SECOP.
 */
import type { Hallazgo } from "../jobs/hallazgo.js";

/** Máximo de filas que se procesan por escaneo, aunque la URL pida más. */
export const MAX_FILAS_SECOP = 100;

export function mapearFilaSecop(row: unknown): Hallazgo {
  const r = (row ?? {}) as Record<string, unknown>;
  const texto = (k: string) => (typeof r[k] === "string" && r[k] !== "" ? (r[k] as string) : undefined);
  const precio = Number(texto("precio_base"));
  const urlProceso = (r["urlproceso"] as { url?: unknown } | undefined)?.url;
  return {
    titulo: texto("nombre_del_procedimiento") ?? "Sin título",
    entidad: texto("entidad") ?? "Entidad sin identificar",
    numeroProceso: texto("id_del_proceso"),
    resumen: texto("descripci_n_del_procedimiento"),
    fechaApertura: texto("fecha_de_publicacion_del")?.slice(0, 10),
    // SECOP II casi nunca publica la fecha de cierre en datos abiertos; queda vacía y la
    // directora la toma del detalle del proceso (urlOrigen).
    fechaCierre: texto("fecha_de_recepcion_de"),
    montoMaximo: Number.isFinite(precio) && precio > 0 ? precio : undefined,
    urlOrigen: typeof urlProceso === "string" ? urlProceso : undefined,
  };
}

export function mapearRespuestaSecop(data: unknown): Hallazgo[] {
  if (!Array.isArray(data)) return [];
  return data.slice(0, MAX_FILAS_SECOP).map(mapearFilaSecop);
}
