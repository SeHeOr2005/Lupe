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
  // no_apta desde aquí: al re-evaluar contra el perfil de la fundación (npm run
  // elegibilidad:reevaluar) lo que ya estaba esperando aprobación y no encaja.
  pendiente_aprobacion: ["aprobada", "descartada", "vencida", "no_apta"],
  aprobada: ["en_postulacion", "vencida"],
  en_postulacion: ["postulada", "vencida"],
  postulada: ["ganada", "no_ganada"],
  ganada: [],
  no_ganada: [],
  // Al re-evaluar con un perfil o criterio nuevo, lo que el filtro había ocultado
  // puede volver a la bandeja de la directora (nunca lo que ella misma descartó).
  no_apta: ["pendiente_aprobacion"],
  descartada: [],
  vencida: [],
};

export function transicionesDesde(estado: EstadoConvocatoria): EstadoConvocatoria[] {
  return TRANSICIONES_PERMITIDAS[estado];
}

export function esTransicionPermitida(desde: EstadoConvocatoria, hacia: EstadoConvocatoria): boolean {
  return TRANSICIONES_PERMITIDAS[desde].includes(hacia);
}
