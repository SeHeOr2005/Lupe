/**
 * Piezas puras del pipeline de escaneo (sin base de datos ni red), separadas
 * de escanear-fuente.ts para poder probarlas solas.
 */
import { createHash } from "node:crypto";
import type { Candidato } from "../ai/gemini.js";

/** Lo que trae el evaluador, más la URL de detalle cuando la fuente la da (modo api). */
export type Hallazgo = Candidato & { urlOrigen?: string };

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
