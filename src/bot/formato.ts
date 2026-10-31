/**
 * Cómo se ven las convocatorias en Telegram. Todo es texto HTML (parse_mode
 * "HTML") y funciones puras, para poder probarlas sin el bot ni la base.
 */

/** Lo mínimo que el bot necesita de una convocatoria (encaja con el modelo de Prisma). */
export interface ConvocatoriaParaMostrar {
  id: string;
  titulo: string;
  entidad: string;
  resumen: string | null;
  urlOrigen: string;
  /** Decimal de Prisma, number o null: se lee con String(). */
  montoMaximo: { toString(): string } | number | null;
  fechaApertura: Date | null;
  fechaCierre: Date | null;
  /** JSON de analisis_ia; de ahí sale por qué le sirve a la fundación (elegibilidad.razon). */
  analisisIa?: unknown;
}

/**
 * Si el convenio ya tiene organización asignada: `{ organizacion }` con el nombre
 * cuando se sabe, `{}` cuando SECOP solo dice que ya está seleccionado.
 */
export function asignacionDe(analisisIa: unknown): { organizacion?: string } | undefined {
  const a = (analisisIa as { elegibilidad?: { asignacion?: { organizacion?: unknown } } } | null)?.elegibilidad?.asignacion;
  if (!a || typeof a !== "object") return undefined;
  return typeof a.organizacion === "string" && a.organizacion !== "" ? { organizacion: a.organizacion } : {};
}

/** La razón de elegibilidad guardada por el filtro, si la convocatoria quedó como apta. */
export function razonElegibilidad(analisisIa: unknown): string | undefined {
  const e = (analisisIa as { elegibilidad?: { apta?: unknown; razon?: unknown } } | null)?.elegibilidad;
  return e?.apta === true && typeof e.razon === "string" && e.razon !== "" ? e.razon : undefined;
}

/** Botones: los callback_data de Telegram tienen tope de 64 bytes; un uuid cabe de sobra. */
export const ACCION = {
  aprobar: "aprobar",
  descartar: "descartar",
  pendientes: "pendientes",
} as const;

export const TAMANO_PAGINA = 5;
const MAX_RESUMEN = 300;

export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatearMonto(monto: ConvocatoriaParaMostrar["montoMaximo"]): string | undefined {
  if (monto === null) return undefined;
  const n = Number(String(monto));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

export function formatearFecha(fecha: Date | null): string | undefined {
  if (!fecha) return undefined;
  // Las fechas sin hora se guardan a medianoche UTC; mostrarlas en UTC evita que
  // salgan un día antes en hora de Colombia.
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" }).format(fecha);
}

function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio;
}

/** La "tarjeta" de una convocatoria: lo que la directora necesita para decidir. */
export function tarjetaConvocatoria(c: ConvocatoriaParaMostrar): string {
  const lineas = [`<b>${escaparHtml(c.titulo)}</b>`];

  const asignacion = asignacionDe(c.analisisIa);
  if (asignacion) {
    lineas.push(
      asignacion.organizacion
        ? `🔒 <b>Ya asignado a: ${escaparHtml(asignacion.organizacion)}</b>`
        : "🔒 <b>Ya asignado</b> (SECOP no publica a quién)",
    );
  }

  lineas.push(`🏛 ${escaparHtml(c.entidad)}`);

  const porQue = razonElegibilidad(c.analisisIa);
  if (porQue) lineas.push(`🎯 ${escaparHtml(porQue)}`);

  const monto = formatearMonto(c.montoMaximo);
  if (monto) lineas.push(`💰 ${monto}`);

  const publicada = formatearFecha(c.fechaApertura);
  if (publicada) lineas.push(`📅 Publicada: ${publicada}`);

  const cierre = formatearFecha(c.fechaCierre);
  lineas.push(cierre ? `⏳ Cierre: ${cierre}` : "⏳ Cierre: no publicado, revísalo en el proceso");

  if (c.resumen && c.resumen.trim() !== "" && recortar(c.resumen, MAX_RESUMEN) !== recortar(c.titulo, MAX_RESUMEN)) {
    lineas.push("", escaparHtml(recortar(c.resumen, MAX_RESUMEN)));
  }

  if (c.urlOrigen) lineas.push("", `🔗 <a href="${escaparHtml(c.urlOrigen)}">Ver el proceso</a>`);
  lineas.push(`<code>${c.id}</code>`);

  return lineas.join("\n");
}

export function textoPaginacion(desde: number, cantidad: number, total: number): string {
  if (total === 0) return "🎉 No hay convocatorias pendientes de aprobación.";
  return `Mostrando ${desde + 1}–${desde + cantidad} de ${total} pendientes.`;
}

export const TEXTO_AYUDA = [
  "<b>Lupe</b> busca convocatorias para la fundación y te las trae para que decidas.",
  "",
  "/pendientes — convocatorias que esperan tu aprobación",
  "/convocatoria &lt;id&gt; — ver una convocatoria puntual",
  "/ayuda — este mensaje",
  "",
  "En cada convocatoria puedes tocar ✅ <b>Aprobar</b> o ❌ <b>Descartar</b>.",
].join("\n");

export function textoNoAutorizado(userId: number): string {
  return [
    "No tienes acceso a Lupe todavía.",
    `Tu ID de Telegram es <code>${userId}</code>.`,
    "Pídele a quien administra Lupe que lo agregue a TELEGRAM_ALLOWED_USER_IDS.",
  ].join("\n");
}

/** Interpreta el callback_data de un botón: "aprobar:<uuid>", "pendientes:5"... */
export function leerAccion(data: string): { accion: keyof typeof ACCION; valor: string } | undefined {
  const match = /^(aprobar|descartar|pendientes):(.+)$/.exec(data);
  if (!match) return undefined;
  return { accion: match[1] as keyof typeof ACCION, valor: match[2]! };
}

/** Lista blanca: sin tabla de usuarios en v2, la autorización es TELEGRAM_ALLOWED_USER_IDS. */
export function estaAutorizado(userId: number | undefined, permitidos: readonly bigint[]): boolean {
  if (userId === undefined) return false;
  if (permitidos.length === 0) return true; // lista vacía = abierto a todos
  return permitidos.includes(BigInt(userId));
}
