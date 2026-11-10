/**
 * Textos y botones del seguimiento (/aprobadas): la lista de convocatorias en
 * preparación y el checklist de cada una. Funciones puras.
 */
import { escaparHtml, NOMBRE_TIPO } from "./formato.js";

const MS_DIA = 24 * 60 * 60 * 1000;
const TZ = "America/Bogota";

/** Días de calendario (en Colombia) entre hoy y el cierre: 0 = hoy, negativo = ya cerró. */
export function diasParaCierre(fechaCierre: Date | null, hoy = new Date()): number | undefined {
  if (!fechaCierre) return undefined;
  const dia = (d: Date) => {
    const [a, m, dd] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(d)
      .split("-")
      .map(Number) as [number, number, number];
    return Date.UTC(a, m - 1, dd);
  };
  return Math.round((dia(fechaCierre) - dia(hoy)) / MS_DIA);
}

export function textoCierre(fechaCierre: Date | null, hoy = new Date()): string {
  const dias = diasParaCierre(fechaCierre, hoy);
  if (dias === undefined) return "sin fecha de cierre";
  if (dias < 0) return dias === -1 ? "cerró ayer" : `cerró hace ${-dias} días`;
  if (dias === 0) return "cierra hoy";
  if (dias === 1) return "cierra mañana";
  return `cierra en ${dias} días`;
}

/** ▰▰▰▱▱▱▱▱▱▱ (10 casillas). */
export function barraProgreso(hechos: number, total: number): string {
  if (total === 0) return "▱".repeat(10);
  const llenas = Math.round((hechos / total) * 10);
  return "▰".repeat(llenas) + "▱".repeat(10 - llenas);
}

function recortar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** 🟢 todo listo · 🔴 cierra en 3 días o menos · 🟡 en marcha · ⚪ sin empezar. */
export function iconoAvance(hechos: number, total: number, dias: number | undefined): string {
  if (total > 0 && hechos === total) return "🟢";
  if (dias !== undefined && dias >= 0 && dias <= 3) return "🔴";
  return hechos > 0 ? "🟡" : "⚪";
}

export interface ResumenSeguimiento {
  id: string;
  titulo: string;
  fechaCierre: Date | null;
  pasosHechos: number;
  pasosTotal: number;
}

/** Botón de una convocatoria en /aprobadas: "🟡 3/7 · cierra en 18 días · Fondo Semillas…". */
export function etiquetaConvocatoria(c: ResumenSeguimiento, hoy = new Date()): string {
  const dias = diasParaCierre(c.fechaCierre, hoy);
  const avance = c.pasosTotal > 0 ? `${c.pasosHechos}/${c.pasosTotal}` : "sin pasos";
  const cierre = dias === undefined ? "" : ` · ${textoCierre(c.fechaCierre, hoy)}`;
  return `${iconoAvance(c.pasosHechos, c.pasosTotal, dias)} ${avance}${cierre} · ${recortar(c.titulo, 34)}`;
}

export function textoListaAprobadas(cantidad: number): string {
  if (cantidad === 0) {
    return "📋 No tienes convocatorias aprobadas.\nAprueba alguna desde /pendientes o agrega una con /nueva.";
  }
  return [
    `📋 <b>Convocatorias en preparación</b> (${cantidad})`,
    "Ordenadas por la que cierra primero. Toca una para ver su checklist.",
    "",
    "🟢 todo listo · 🟡 en marcha · ⚪ sin empezar · 🔴 cierra en 3 días o menos",
  ].join("\n");
}

export interface PasoChecklist {
  id: string;
  titulo: string;
  descripcion: string | null;
  completado: boolean;
}

export interface DocumentoChecklist {
  id: string;
  tipo: string;
  descripcion: string | null;
  estado: "pendiente" | "listo" | "no_aplica";
}

export const ICONO_DOC = { listo: "✅", pendiente: "⬜", no_aplica: "➖" } as const;

export const nombreDocumento = (d: Pick<DocumentoChecklist, "tipo" | "descripcion">) =>
  d.tipo === "otro" ? (d.descripcion ?? "Otro documento") : (NOMBRE_TIPO[d.tipo] ?? d.descripcion ?? d.tipo);

export const etiquetaPaso = (p: PasoChecklist, i: number) => recortar(`${p.completado ? "✅" : "⬜"} ${i + 1}. ${p.titulo}`, 48);
export const etiquetaDocumento = (d: DocumentoChecklist) => recortar(`${ICONO_DOC[d.estado]} ${nombreDocumento(d)}`, 48);

const formatoCierre = new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: TZ });

/** El checklist completo de una convocatoria (texto del mensaje; los botones van aparte). */
export function textoChecklist(
  c: { id: string; titulo: string; entidad: string; estado: string; fechaCierre: Date | null },
  pasos: PasoChecklist[],
  documentos: DocumentoChecklist[],
  hoy = new Date(),
): string {
  const hechos = pasos.filter((p) => p.completado).length;
  const docsListos = documentos.filter((d) => d.estado !== "pendiente").length;
  const lineas = [
    `📋 <b>${escaparHtml(recortar(c.titulo, 140))}</b>`,
    `🏛 ${escaparHtml(c.entidad)}`,
    c.fechaCierre
      ? `⏳ ${escaparHtml(formatoCierre.format(c.fechaCierre))} · <b>${textoCierre(c.fechaCierre, hoy)}</b>`
      : "⏳ Sin fecha de cierre todavía",
    `Estado: <b>${c.estado === "en_postulacion" ? "en postulación" : "aprobada"}</b>`,
    "",
  ];

  if (pasos.length === 0) {
    lineas.push(
      "🗓 <b>Aún no tengo su paso a paso.</b>",
      "Responde a este mensaje con el pliego (PDF) o una captura del cronograma y lo armo.",
    );
  } else {
    lineas.push(`🗓 <b>Paso a paso</b> · ${hechos} de ${pasos.length}`, barraProgreso(hechos, pasos.length));
    pasos.forEach((p, i) =>
      lineas.push(
        `${p.completado ? "✅" : "⬜"} ${i + 1}. ${escaparHtml(p.titulo)}${p.descripcion ? ` — <i>${escaparHtml(recortar(p.descripcion, 70))}</i>` : ""}`,
      ),
    );
    if (hechos === pasos.length) lineas.push("", "🎉 Todos los pasos están hechos.");
  }

  if (documentos.length > 0) {
    lineas.push("", `📎 <b>Documentos</b> · ${docsListos} de ${documentos.length} listos`);
    for (const d of documentos) lineas.push(`${ICONO_DOC[d.estado]} ${escaparHtml(recortar(nombreDocumento(d), 90))}`);
  }

  lineas.push("", "<i>Toca un paso o un documento para marcarlo o desmarcarlo.</i>", `<code>${c.id}</code>`);
  return lineas.join("\n");
}

// ─────────────── Radicación ("🎒 Ya radicamos") ───────────────

/** Hoy en Colombia, como fecha sin hora (medianoche UTC, igual que guarda la columna DATE). */
export function hoyEnColombia(ahora = new Date()): Date {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(ahora)
    .split("-")
    .map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d));
}

/** Una fecha de radicación no puede ser futura (más allá de hoy en Colombia). */
export function fechaRadicacionValida(fecha: Date, ahora = new Date()): boolean {
  return fecha.getTime() <= hoyEnColombia(ahora).getTime();
}

const formatoDia = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
export const mostrarDiaRadicacion = (fecha: Date) => formatoDia.format(fecha);

export const textoPedirFechaRadicacion = (titulo: string) =>
  [
    `🎒 <b>Registrar la radicación</b>`,
    escaparHtml(recortar(titulo, 120)),
    "",
    "¿Qué día se radicó la propuesta? Toca <b>Hoy</b> o escribe la fecha (por ejemplo 25/11/2026).",
    "<i>Escribe /cancelar si te arrepientes.</i>",
  ].join("\n");

export const textoPedirNumeroRadicado = (fecha: Date) =>
  [
    `📅 Radicada el <b>${mostrarDiaRadicacion(fecha)}</b>.`,
    "",
    "¿Te dieron un número de radicado? Escríbelo, o toca <b>No tengo número</b>.",
  ].join("\n");

export const textoRadicada = (titulo: string, fecha: Date, numero?: string) =>
  [
    "✅ <b>Postulación registrada.</b>",
    escaparHtml(recortar(titulo, 120)),
    "",
    `📅 Radicada el ${mostrarDiaRadicacion(fecha)}`,
    numero ? `🔖 Radicado No. ${escaparHtml(numero)}` : "🔖 Sin número de radicado",
    "",
    "La convocatoria quedó como <b>postulada</b> y su resultado como pendiente. Ya no aparece en /aprobadas.",
    "Cuando te avisen si la ganaron, regístralo con /resultado.",
  ].join("\n");
