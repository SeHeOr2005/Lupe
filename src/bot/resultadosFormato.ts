/**
 * Textos de /resultado y lectura de montos escritos a mano. Funciones puras.
 */
import { escaparHtml, formatearMonto } from "./formato.js";

/**
 * Monto escrito como lo escribe una persona en Colombia: "$40.000.000",
 * "40000000", "40'000.000", "35,5 millones", "40M", "40 millones de pesos".
 * Devuelve undefined si no es un monto razonable.
 */
export function leerMonto(texto: string): number | undefined {
  let t = texto
    .toLowerCase()
    .replace(/\$|cop|de\s+pesos|pesos/g, "")
    .replace(/['’]/g, ".") // 40'000.000: el apóstrofo separa los millones, como un punto de miles
    .replace(/\s+/g, " ")
    .trim();
  let factor = 1;
  const millones = /^(.+?)\s*(millones|millón|millon|mill|mm|m)$/.exec(t);
  if (millones) {
    factor = 1_000_000;
    t = millones[1]!.trim();
  }
  t = t.replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(t)) return undefined;

  let numero: number;
  if (t.includes(".") && t.includes(",")) {
    numero = Number(t.replace(/\./g, "").replace(",", ".")); // 40.000.000,50
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(t)) {
    numero = Number(t.replace(/[.,]/g, "")); // 40.000.000 o 40,000,000
  } else {
    numero = Number(t.replace(",", ".")); // 40000000 o 35,5 (con "millones")
  }
  const monto = numero * factor;
  return Number.isFinite(monto) && monto >= 1_000 && monto < 1e12 ? Math.round(monto) : undefined;
}

const formatoDia = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function recortar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export interface Esperando {
  titulo: string;
  entidad: string;
  fechaRadicacion: Date;
  numeroRadicado: string | null;
  montoMaximo: { toString(): string } | number | null;
}

/** Botón de una postulación en /resultado: "📮 Fondo Semillas… · radicada el 25 de noviembre de 2026". */
export const etiquetaEsperando = (e: Esperando) => `📮 ${recortar(e.titulo, 36)} · ${formatoDia.format(e.fechaRadicacion)}`;

export function textoListaResultados(cantidad: number): string {
  if (cantidad === 0) {
    return "📮 No tienes postulaciones esperando resultado.\nCuando radiques una (🎒 Ya radicamos, en /aprobadas), aparecerá aquí.";
  }
  return `📮 <b>Postulaciones esperando resultado</b> (${cantidad})\nToca una para registrar si la ganaron.`;
}

export function textoPreguntaResultado(e: Esperando): string {
  return [
    `📮 <b>${escaparHtml(recortar(e.titulo, 140))}</b>`,
    `🏛 ${escaparHtml(e.entidad)}`,
    `📅 Radicada el ${formatoDia.format(e.fechaRadicacion)}${e.numeroRadicado ? ` · No. ${escaparHtml(e.numeroRadicado)}` : ""}`,
    "",
    "¿Cuál fue el resultado?",
  ].join("\n");
}

export function textoPedirMonto(e: Esperando): string {
  const maximo = formatearMonto(e.montoMaximo);
  return [
    "🏆 <b>¡Felicitaciones!</b>",
    "",
    "¿Por cuánto se adjudicó? Escribe el monto (por ejemplo <code>38.500.000</code> o <code>38,5 millones</code>)" +
      (maximo ? `, o toca el botón si fue el monto máximo (${maximo}).` : "."),
    "<i>Escribe /cancelar si te arrepientes.</i>",
  ].join("\n");
}

export function textoResultadoRegistrado(titulo: string, ganada: boolean, monto?: number): string {
  return ganada
    ? [
        "🏆 <b>Resultado registrado: ganada.</b>",
        escaparHtml(recortar(titulo, 120)),
        "",
        `💰 Monto adjudicado: <b>${formatearMonto(monto ?? 0)}</b>`,
        "Recibido hasta ahora: $ 0. Queda en la vista de finanzas con su saldo por recibir.",
      ].join("\n")
    : [
        "📝 <b>Resultado registrado: no fue seleccionada.</b>",
        escaparHtml(recortar(titulo, 120)),
        "",
        "Queda en el historial. Los documentos y el paso a paso siguen guardados para la próxima convocatoria parecida.",
      ].join("\n");
}
