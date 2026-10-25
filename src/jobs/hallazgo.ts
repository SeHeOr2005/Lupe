/**
 * Piezas puras del pipeline de escaneo (sin base de datos ni red), separadas
 * de escanear-fuente.ts para poder probarlas solas.
 */
import { createHash } from "node:crypto";
import type { Candidato } from "../ai/gemini.js";

/** Lo que trae el evaluador, más lo que solo da una fuente estructurada (modo api). */
export type Hallazgo = Candidato & {
  urlOrigen?: string;
  /** La fuente dice que el contratista ya está escogido (SECOP: "Seleccionado"/adjudicado). */
  yaSeleccionado?: boolean;
  /** Nombre del contratista, si la fuente lo publica (SECOP casi nunca lo hace a tiempo). */
  contratista?: string;
};

export function normalizarTitulo(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * "La huella combina entidad, título normalizado y fecha de cierre" (doc 06 · Modelo de datos).
 * Se le suma el número de proceso cuando lo hay: en SECOP II muchos procesos de la misma
 * entidad comparten título ("PRESTAR SERVICIOS PROFESIONALES") y no traen fecha de cierre.
 */
export function calcularHuella(hallazgo: Hallazgo): string {
  const { entidad, titulo, fechaCierre, numeroProceso } = hallazgo;
  const base = `${entidad.toLowerCase().trim()}|${normalizarTitulo(titulo)}|${fechaCierre ?? ""}|${numeroProceso ?? ""}`;
  return createHash("sha256").update(base).digest("hex");
}

const TITULO_ES_UNA_ORGANIZACION =
  /^(la |el )?(corporaci[oó]n|asociaci[oó]n|fundaci[oó]n|cooperativa|museo|convenio de asociaci[oó]n)\b(?!.*\b(aunar|apoyar|implementar|desarrollar|realizar|prestar|brindar|fortalecer)\b)/i;

/**
 * En SECOP, un convenio con una ESAL ya escogida suele llevar como título el
 * nombre de esa organización ("CORPORACION LOMAS ANCHAS", "LA FUNDACION LUKER").
 * Devuelve ese nombre, o undefined si el título describe un objeto de contrato.
 */
export function nombreSiEsOrganizacion(titulo: string): string | undefined {
  const t = titulo.trim().replace(/^convenio de asociaci[oó]n\s+/i, "");
  if (!TITULO_ES_UNA_ORGANIZACION.test(titulo.trim()) || t.split(/\s+/).length > 12) return undefined;
  return t;
}
