/**
 * De lo que extrajo el modelo a lo que se guarda: fecha de cierre (con su
 * verificación), pasos de la postulación y documentos exigidos. Todo puro,
 * sin base de datos, para poder probarlo solo.
 */
import type { ExtraccionDocumentos, TIPOS_DOCUMENTO } from "../ai/explorador.js";
import { citaAparece } from "./citas.js";

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export interface FechaCierrePlan {
  fecha: Date;
  cita?: string;
  /** La cita se encontró en el texto de un PDF. */
  verificada: boolean;
  /** De dónde salió: confirmada en el PDF, de una captura (no se puede verificar) o sin respaldo. */
  origen: "pdf" | "captura" | "sin_respaldo";
}

export interface PlanDeGuardado {
  fechaCierre?: FechaCierrePlan;
  pasos: { titulo: string; descripcion?: string }[];
  documentos: { tipo: TipoDocumento; descripcion: string }[];
  requisitos: { habilitantes: string[]; criteriosEvaluacion: string[]; documentosExigidos: string[] };
  presupuesto?: number;
  advertencias: string[];
}

const ZONA = "-05:00"; // Colombia no tiene horario de verano

/**
 * "2026-11-15T17:00" o "2026-11-15" (hora de Colombia) → Date. Sin hora, el cierre
 * se toma al final del día (23:59) para no adelantar la fecha límite.
 */
export function leerFechaColombia(texto: string | undefined): Date | undefined {
  if (!texto) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(texto.trim());
  if (!m) return undefined;
  const [, a, mes, d, h, min] = m;
  const fecha = new Date(`${a}-${mes}-${d}T${h ?? "23"}:${min ?? "59"}:00${ZONA}`);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

/** Actividades del cronograma que equivalen al cierre (por si el modelo no llenó fechaCierre). */
const ACTIVIDAD_DE_CIERRE =
  /cierre|presentaci[oó]n de (la |las )?(oferta|propuesta)s?|recepci[oó]n de (la |las )?(oferta|propuesta)s?|plazo (m[aá]ximo )?para (presentar|entregar)/i;

const DIA = { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" } as const;
const formatoFecha = new Intl.DateTimeFormat("es-CO", DIA);
const formatoFechaHora = new Intl.DateTimeFormat("es-CO", { ...DIA, hour: "numeric", minute: "2-digit" });

/** Fecha para mostrar: con hora solo si el documento la daba. */
export function describirFecha(texto: string | undefined): string | undefined {
  const fecha = leerFechaColombia(texto);
  if (!fecha) return undefined;
  return /T\d{2}:\d{2}|\s\d{2}:\d{2}/.test(texto ?? "") ? formatoFechaHora.format(fecha) : formatoFecha.format(fecha);
}

export function armarPlan(
  extraccion: ExtraccionDocumentos,
  { textoPdf, hayCapturas }: { textoPdf: string; hayCapturas: boolean },
): PlanDeGuardado {
  // Fecha de cierre: la que dio el modelo o, si no, la etapa del cronograma que es el cierre.
  let fechaTexto = extraccion.fechaCierre;
  let cita = extraccion.citaFechaCierre;
  if (!leerFechaColombia(fechaTexto)) {
    const etapa = extraccion.cronograma.find((e) => ACTIVIDAD_DE_CIERRE.test(e.actividad) && leerFechaColombia(e.fecha));
    fechaTexto = etapa?.fecha;
    cita = undefined;
  }
  const fecha = leerFechaColombia(fechaTexto);
  let fechaCierre: FechaCierrePlan | undefined;
  if (fecha) {
    const verificada = citaAparece(cita, textoPdf);
    fechaCierre = { fecha, cita, verificada, origen: verificada ? "pdf" : hayCapturas ? "captura" : "sin_respaldo" };
  }

  const pasos = extraccion.cronograma
    .filter((e) => e.actividad.trim() !== "")
    .map((e) => {
      const partes = [describirFecha(e.fecha), e.detalle?.trim()].filter(Boolean);
      return { titulo: e.actividad.trim(), ...(partes.length ? { descripcion: partes.join(" · ") } : {}) };
    });

  // Un documento por tipo (la tabla tiene unique(convocatoria, tipo)): los "otro" se agrupan.
  const porTipo = new Map<TipoDocumento, string[]>();
  for (const d of extraccion.documentosExigidos) {
    const nombres = porTipo.get(d.tipo) ?? [];
    if (!nombres.includes(d.nombre.trim())) nombres.push(d.nombre.trim());
    porTipo.set(d.tipo, nombres);
  }

  return {
    ...(fechaCierre ? { fechaCierre } : {}),
    pasos,
    documentos: [...porTipo].map(([tipo, nombres]) => ({ tipo, descripcion: nombres.join("; ") })),
    requisitos: {
      habilitantes: extraccion.requisitosHabilitantes,
      criteriosEvaluacion: extraccion.criteriosEvaluacion,
      documentosExigidos: extraccion.documentosExigidos.map((d) => d.nombre),
    },
    ...(extraccion.presupuesto && extraccion.presupuesto > 0 ? { presupuesto: extraccion.presupuesto } : {}),
    advertencias: extraccion.advertencias,
  };
}
