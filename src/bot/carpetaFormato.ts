/**
 * Textos y botones de la carpeta de la fundación en el bot (/documentos).
 * Funciones puras, para poder probarlas sin Telegram ni base de datos.
 */
import { tipoDocumento } from "../schemas/documentoFundacion.js";
import { escaparHtml, NOMBRE_TIPO } from "./formato.js";

export interface DocumentoParaMostrar {
  id: string;
  tipo: string;
  nombre: string;
  fechaExpedicion: Date | null;
  fechaVencimiento: Date | null;
  notas?: string | null;
}

/** Botones de la carpeta: "cp:<acción>:<valor>". Telegram limita callback_data a 64 bytes. */
export const ACCIONES_CARPETA = [
  "menu", // volver a la lista
  "ver", // ver un documento (manda el archivo)
  "subir", // elegir tipo para subir uno nuevo
  "tipo", // tipo elegido → pedir archivo
  "reemp", // reemplazar el archivo de un documento
  "editar", // menú de edición de datos
  "nombre", // cambiar nombre
  "venc", // poner fecha de vencimiento
  "exp", // poner fecha de expedición
  "elim", // pedir confirmación para borrar
  "borrar", // borrar (confirmado)
] as const;
export type AccionCarpeta = (typeof ACCIONES_CARPETA)[number];

export const cb = (accion: AccionCarpeta, valor = "") => `cp:${accion}:${valor}`;

export function leerAccionCarpeta(data: string): { accion: AccionCarpeta; valor: string } | undefined {
  const m = /^cp:([a-z]+):(.*)$/.exec(data);
  if (!m || !(ACCIONES_CARPETA as readonly string[]).includes(m[1]!)) return undefined;
  return { accion: m[1] as AccionCarpeta, valor: m[2]! };
}

export const nombreTipo = (tipo: string) => NOMBRE_TIPO[tipo] ?? "Otro documento";

/** Las fechas de la carpeta se guardan como DATE (medianoche UTC): se muestran en UTC para no correrlas un día. */
const formatoDia = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const mostrarDia = (fecha: Date) => formatoDia.format(fecha);

const DIAS_AVISO = 30;
const MS_DIA = 24 * 60 * 60 * 1000;

export type Vigencia = "vigente" | "por_vencer" | "vencido" | "sin_fecha";

export function vigencia(doc: Pick<DocumentoParaMostrar, "fechaVencimiento">, hoy = new Date()): Vigencia {
  if (!doc.fechaVencimiento) return "sin_fecha";
  const inicioHoy = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  const dias = Math.round((doc.fechaVencimiento.getTime() - inicioHoy) / MS_DIA);
  if (dias < 0) return "vencido";
  return dias <= DIAS_AVISO ? "por_vencer" : "vigente";
}

const ICONO: Record<Vigencia, string> = { vigente: "✅", por_vencer: "⚠️", vencido: "❌", sin_fecha: "📄" };

function descripcionVigencia(doc: DocumentoParaMostrar, hoy: Date): string {
  const v = vigencia(doc, hoy);
  if (v === "sin_fecha") return "sin fecha de vencimiento";
  const dia = mostrarDia(doc.fechaVencimiento!);
  return v === "vencido" ? `venció el ${dia}` : v === "por_vencer" ? `vence pronto: ${dia}` : `vence el ${dia}`;
}

/** Lo que dice el botón de cada documento en el menú. */
export function etiquetaBotonDocumento(doc: DocumentoParaMostrar, hoy = new Date()): string {
  const titulo = doc.tipo === "otro" ? doc.nombre : nombreTipo(doc.tipo);
  const corto = titulo.length > 40 ? `${titulo.slice(0, 39)}…` : titulo;
  return `${ICONO[vigencia(doc, hoy)]} ${corto}`;
}

export function textoCarpeta(docs: DocumentoParaMostrar[], hoy = new Date()): string {
  if (docs.length === 0) {
    return [
      "📁 <b>Carpeta de la fundación</b>",
      "",
      "Todavía no hay documentos. Toca <b>➕ Subir documento</b> para agregar el RUT, la cámara de comercio, la cédula del representante legal…",
      "",
      "Cuando una convocatoria los pida, los marco como listos solos.",
    ].join("\n");
  }
  const vencidos = docs.filter((d) => vigencia(d, hoy) === "vencido").length;
  const porVencer = docs.filter((d) => vigencia(d, hoy) === "por_vencer").length;
  return [
    `📁 <b>Carpeta de la fundación</b> · ${docs.length} documento${docs.length === 1 ? "" : "s"}`,
    ...(vencidos ? [`❌ ${vencidos} vencido${vencidos === 1 ? "" : "s"}`] : []),
    ...(porVencer ? [`⚠️ ${porVencer} por vencer (menos de ${DIAS_AVISO} días)`] : []),
    "",
    "Toca un documento para verlo, actualizarlo o eliminarlo.",
  ].join("\n");
}

export function textoDetalleDocumento(doc: DocumentoParaMostrar, hoy = new Date()): string {
  return [
    `${ICONO[vigencia(doc, hoy)]} <b>${escaparHtml(nombreTipo(doc.tipo))}</b>`,
    ...(doc.tipo === "otro" || doc.nombre !== nombreTipo(doc.tipo) ? [`📝 ${escaparHtml(doc.nombre)}`] : []),
    `📅 Expedición: ${doc.fechaExpedicion ? mostrarDia(doc.fechaExpedicion) : "sin registrar"}`,
    `⏳ ${descripcionVigencia(doc, hoy).replace(/^./, (c) => c.toUpperCase())}`,
    ...(doc.notas ? [`🗒 ${escaparHtml(doc.notas)}`] : []),
  ].join("\n");
}

/** Los tipos para elegir al subir, con su nombre legible. */
export const OPCIONES_TIPO = tipoDocumento.options.map((tipo) => ({ tipo, nombre: nombreTipo(tipo) }));

/**
 * Fecha escrita por la persona: "15/03/2027", "15-3-2027" o "2027-03-15".
 * Se guarda como DATE (medianoche UTC). Devuelve undefined si no es una fecha real.
 */
export function leerFechaEscrita(texto: string): Date | undefined {
  const t = texto.trim();
  let a: number, m: number, d: number;
  const dma = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const amd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (dma) [d, m, a] = [Number(dma[1]), Number(dma[2]), Number(dma[3])];
  else if (amd) [a, m, d] = [Number(amd[1]), Number(amd[2]), Number(amd[3])];
  else return undefined;
  const fecha = new Date(Date.UTC(a, m - 1, d));
  // Descarta 31/02 y similares (Date los "corre" al mes siguiente).
  if (fecha.getUTCFullYear() !== a || fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) return undefined;
  if (a < 1990 || a > 2100) return undefined;
  return fecha;
}
