/**
 * Resumen diario de convocatorias nuevas: quién lo recibe, qué ventana de
 * tiempo cubre cada envío y cómo se ve. Funciones puras (sin Telegram ni base).
 */
import { CronExpressionParser } from "cron-parser";
import { escaparHtml } from "./formato.js";

/**
 * Chats con avisos activos. Empieza con los de TELEGRAM_AVISOS_CHAT_IDS y cada
 * quien lo cambia con /avisos. Vive en memoria: al reiniciar el bot vuelve a la
 * lista de la configuración.
 */
export class Suscripciones {
  private readonly activos: Set<number>;

  constructor(iniciales: number[] = []) {
    this.activos = new Set(iniciales);
  }

  activar(chatId: number) {
    this.activos.add(chatId);
  }

  desactivar(chatId: number) {
    this.activos.delete(chatId);
  }

  estaActivo(chatId: number): boolean {
    return this.activos.has(chatId);
  }

  lista(): number[] {
    return [...this.activos];
  }
}

/** La última vez que tocaba enviar según el cron, en o antes de `ahora`. */
export function ultimaOcurrencia(cron: string, ahora: Date, tz: string): Date {
  const interval = CronExpressionParser.parse(cron, { currentDate: new Date(ahora.getTime() + 1000), tz });
  return interval.prev().toDate();
}

/**
 * Si ya pasó una hora de envío desde el último resumen, la ventana a cubrir:
 * desde el envío anterior hasta esta hora. Así cada convocatoria sale en un solo
 * resumen. Si el bot estuvo apagado a la hora de envío, ese día se salta.
 */
export function ventanaPendiente(
  cron: string,
  ultimoEnvio: Date,
  ahora: Date,
  tz: string,
): { desde: Date; hasta: Date } | undefined {
  const hasta = ultimaOcurrencia(cron, ahora, tz);
  return hasta.getTime() > ultimoEnvio.getTime() ? { desde: ultimoEnvio, hasta } : undefined;
}

export interface ConvocatoriaDelResumen {
  titulo: string;
  entidad: string;
  /** "abierta" = con ofertas; "referencia" = convenio directo o ya asignado; undefined = no se sabe. */
  tipo?: "abierta" | "referencia";
}

const MAX_EN_LISTA = 5;

function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio;
}

/** El mensaje del resumen, o undefined si no hay nada nuevo (no se manda nada). */
export function textoResumenDiario(nuevas: ConvocatoriaDelResumen[], { saludo = true } = {}): string | undefined {
  if (nuevas.length === 0) return undefined;

  const abiertas = nuevas.filter((c) => c.tipo === "abierta");
  const referencia = nuevas.filter((c) => c.tipo === "referencia");
  const sinDato = nuevas.length - abiertas.length - referencia.length;
  const n = nuevas.length;

  const lineas = [
    `${saludo ? "☀️ <b>Buenos días.</b> " : ""}Llegaron <b>${n}</b> convocatoria${n === 1 ? "" : "s"} nueva${n === 1 ? "" : "s"} que encaja${n === 1 ? "" : "n"} con Asisco Up:`,
    ...(abiertas.length ? [`🟢 ${abiertas.length} abierta${abiertas.length === 1 ? "" : "s"} a propuestas`] : []),
    ...(referencia.length ? [`🔒 ${referencia.length} ya asignada${referencia.length === 1 ? "" : "s"} o de convenio directo (como referencia)`] : []),
    ...(sinDato ? [`📄 ${sinDato} sin dato de modalidad`] : []),
    "",
  ];

  // Primero las abiertas: son las oportunidades de verdad.
  const orden = [...abiertas, ...nuevas.filter((c) => c.tipo !== "abierta")];
  for (const c of orden.slice(0, MAX_EN_LISTA)) {
    const icono = c.tipo === "abierta" ? "🟢" : c.tipo === "referencia" ? "🔒" : "📄";
    lineas.push(`${icono} <b>${escaparHtml(recortar(c.titulo, 90))}</b>\n    ${escaparHtml(recortar(c.entidad, 60))}`);
  }
  if (n > MAX_EN_LISTA) lineas.push(`… y ${n - MAX_EN_LISTA} más.`);

  lineas.push("", "Toca <b>Ver pendientes</b> para revisarlas y aprobarlas.");
  return lineas.join("\n");
}

export function textoEstadoAvisos(activo: boolean, horaLegible: string): string {
  return activo
    ? `🔔 <b>Avisos activados.</b>\nTodos los días a las ${horaLegible} te mando un resumen con las convocatorias nuevas (solo si hay alguna).`
    : "🔕 <b>Avisos desactivados.</b>\nNo te mando resúmenes. Puedes ver las convocatorias cuando quieras con /pendientes.";
}

/** "7:30 a. m." a partir de un cron de hora fija ("30 7 * * *"); si no es de hora fija, el cron tal cual. */
export function horaDelCron(cron: string): string {
  const m = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(cron.trim());
  if (!m) return `«${cron}»`;
  const minuto = Number(m[1]);
  const hora = Number(m[2]);
  const h12 = hora % 12 === 0 ? 12 : hora % 12;
  return `${h12}:${String(minuto).padStart(2, "0")} ${hora < 12 ? "a. m." : "p. m."}`;
}
