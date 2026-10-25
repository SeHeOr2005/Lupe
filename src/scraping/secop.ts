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
  const contratista = texto("nombre_del_proveedor");
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
    yaSeleccionado: estaSeleccionado(texto("estado_del_procedimiento"), texto("adjudicado")),
    contratista: contratista && !SIN_DATO.test(contratista) ? contratista : undefined,
  };
}

/** SECOP llena los campos vacíos con textos como "No Definido" o "No Adjudicado". */
const SIN_DATO = /^no (definido|adjudicado|aplica)$/i;

/**
 * "Seleccionado" es como SECOP marca un convenio de régimen especial que ya tiene
 * la ESAL escogida (aunque el nombre del proveedor siga en "No Definido").
 */
export function estaSeleccionado(estadoProcedimiento?: string, adjudicado?: string): boolean {
  return /^(seleccionado|adjudicado|celebrado)$/i.test(estadoProcedimiento ?? "") || /^s[ií]$/i.test(adjudicado ?? "");
}

/**
 * Consulta en datos.gov.co el estado de varios procesos por su id (CO1.REQ...).
 * Sirve para completar convocatorias guardadas antes de que se registrara ese dato.
 */
export async function consultarEstadosSecop(
  ids: string[],
): Promise<Map<string, { yaSeleccionado: boolean; contratista?: string }>> {
  const resultado = new Map<string, { yaSeleccionado: boolean; contratista?: string }>();
  const validos = ids.filter((id) => /^[A-Z0-9.]+$/i.test(id)); // van dentro de un $where: nada de comillas
  for (let i = 0; i < validos.length; i += 50) {
    const lote = validos.slice(i, i + 50);
    const params = new URLSearchParams({
      $select: "id_del_proceso, estado_del_procedimiento, adjudicado, nombre_del_proveedor",
      $where: `id_del_proceso in (${lote.map((id) => `'${id}'`).join(",")})`,
      $limit: "1000",
    });
    const res = await fetch(`https://www.datos.gov.co/resource/p6dx-8zbt.json?${params}`);
    if (!res.ok) throw new Error(`datos.gov.co respondió ${res.status} al consultar estados de SECOP`);
    for (const fila of (await res.json()) as Record<string, string | undefined>[]) {
      const id = fila["id_del_proceso"];
      if (!id) continue;
      const contratista = fila["nombre_del_proveedor"];
      resultado.set(id, {
        yaSeleccionado: estaSeleccionado(fila["estado_del_procedimiento"], fila["adjudicado"]),
        contratista: contratista && !SIN_DATO.test(contratista) ? contratista : undefined,
      });
    }
  }
  return resultado;
}

export function mapearRespuestaSecop(data: unknown): Hallazgo[] {
  if (!Array.isArray(data)) return [];
  return data.slice(0, MAX_FILAS_SECOP).map(mapearFilaSecop);
}
