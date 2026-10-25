/**
 * Tabla "Transiciones permitidas" del documento de diseño (05 · Ciclo de vida).
 * Vive aparte de services/convocatorias.ts (que toca la base de datos) para
 * poder probarla sola; ese archivo la usa y la re-exporta.
 */

export type EstadoConvocatoria =
  | "detectada"
  | "pendiente_aprobacion"
  | "aprobada"
  | "en_postulacion"
  | "postulada"
  | "ganada"
  | "no_ganada"
  | "no_apta"
  | "descartada"
  | "vencida";

export type OrigenEvento = "sistema" | "usuaria";

const TRANSICIONES_PERMITIDAS: Record<EstadoConvocatoria, EstadoConvocatoria[]> = {
  detectada: ["pendiente_aprobacion"],
  pendiente_aprobacion: ["aprobada", "descartada", "vencida"],
  aprobada: ["en_postulacion", "vencida"],
  en_postulacion: ["postulada", "vencida"],
  postulada: ["ganada", "no_ganada"],
  ganada: [],
  no_ganada: [],
  no_apta: [],
  descartada: [],
  vencida: [],
};

export function transicionesDesde(estado: EstadoConvocatoria): EstadoConvocatoria[] {
  return TRANSICIONES_PERMITIDAS[estado];
}

export function esTransicionPermitida(desde: EstadoConvocatoria, hacia: EstadoConvocatoria): boolean {
  return TRANSICIONES_PERMITIDAS[desde].includes(hacia);
}
