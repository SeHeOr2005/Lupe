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

/** Directo (la entidad escoge la organización) o competitivo (abierto a propuestas), si se sabe. */
export function tipoProcesoDe(analisisIa: unknown): "directo" | "competitivo" | undefined {
  const t = (analisisIa as { elegibilidad?: { tipoProceso?: unknown } } | null)?.elegibilidad?.tipoProceso;
  return t === "directo" || t === "competitivo" ? t : undefined;
}

/**
 * La línea que dice si la directora puede postularse o no. De lo más concreto a
 * lo más general: a quién está asignado, que ya está asignado, que es un convenio
 * directo (aunque SECOP aún no lo marque como seleccionado), o que está abierta.
 */
export function etiquetaProceso(analisisIa: unknown): string | undefined {
  const asignacion = asignacionDe(analisisIa);
  const tipo = tipoProcesoDe(analisisIa);
  if (asignacion?.organizacion) return `🔒 <b>Ya asignado a: ${escaparHtml(asignacion.organizacion)}</b>`;
  if (asignacion) return "🔒 <b>Ya asignado</b> (SECOP no publica a quién)";
  if (tipo === "directo") return "🔒 <b>Convenio directo:</b> la entidad escoge la organización (no es convocatoria abierta)";
  if (tipo === "competitivo") return "🟢 <b>Abierta a propuestas</b>";
  return undefined;
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

  const etiqueta = etiquetaProceso(c.analisisIa);
  if (etiqueta) lineas.push(etiqueta);

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
  "/nueva — agregar una convocatoria que te llegó por otro lado (PDF, captura o enlace)",
  "/aprobadas — convocatorias aprobadas, con el checklist de pasos y documentos",
  "/borrador — carta de presentación o propuesta técnica en Word (responde a la tarjeta de una convocatoria)",
  "/documentos — carpeta de la fundación: ver, subir, actualizar o eliminar documentos",
  "/avisos — activar o desactivar el resumen diario de convocatorias nuevas",
  "/resumen — convocatorias nuevas de las últimas 24 horas",
  "/ayuda — este mensaje",
  "",
  "En cada convocatoria puedes tocar ✅ <b>Aprobar</b> o ❌ <b>Descartar</b>.",
  "",
  "📄 <b>Paso a paso de una convocatoria:</b> descarga el pliego o los documentos precontractuales",
  "en SECOP, mantén presionada la tarjeta de la convocatoria → <i>Responder</i>, y adjunta el PDF.",
  "Si el cronograma no viene en el PDF, manda también una captura de la sección «Cronograma»",
  "de la página del proceso. Te devuelvo la fecha de cierre, los pasos y los documentos que piden.",
].join("\n");

/** Busca el id de una convocatoria en un texto (una tarjeta, o lo que la persona escribió). */
export function idDeConvocatoriaEn(texto: string | undefined): string | undefined {
  return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(texto ?? "")?.[0]?.toLowerCase();
}

/**
 * Lo que el bot pide justo después de aprobar: el pliego para armar el paso a
 * paso. Lleva el id al final para que la respuesta quede asociada a la convocatoria.
 */
export function textoPedirDocumentos(c: { id: string; urlOrigen: string; analisisIa?: unknown }): string {
  const tipo = tipoProcesoDe(c.analisisIa);
  const asignada = asignacionDe(c.analisisIa) !== undefined || tipo === "directo";
  const enlace = c.urlOrigen
    ? `<a href="${escaparHtml(c.urlOrigen)}">abre el proceso en SECOP</a>`
    : "abre el proceso en la página de la entidad";
  return [
    "📄 <b>Ahora mándame el pliego</b> para armarte el paso a paso:",
    "",
    `1. ${enlace} (resuelve el captcha si aparece).`,
    "2. En <i>Documentos del proceso</i>, descarga el pliego, la invitación o los «Documentos precontractuales» (PDF).",
    "3. Si el cronograma no viene en el PDF, toma una captura de la sección <i>Cronograma</i>.",
    "4. <b>Responde a este mensaje</b> con el PDF (y la captura si la tienes).",
    ...(asignada
      ? ["", "⚠ Ojo: según SECOP, la entidad ya escogió o escoge directamente la organización. Sirve como referencia, pero puede que no haya postulación abierta."]
      : []),
    "",
    `<code>${c.id}</code>`,
  ].join("\n");
}

export const TEXTO_SIN_CONVOCATORIA = [
  "¿De qué convocatoria es esto?",
  "• Si es de una que ya está en Lupe: mantén presionada su tarjeta → <i>Responder</i>, y vuelve a enviarlo.",
  "• Si es una convocatoria nueva que te llegó por otro lado, toca el botón y la agrego.",
].join("\n");

/** Instrucciones de /nueva: agregar una convocatoria que no salió de SECOP. */
export const TEXTO_NUEVA = [
  "➕ <b>Agregar una convocatoria</b>",
  "",
  "Envíame lo que tengas de ella:",
  "• el PDF (términos de referencia, invitación, pliego),",
  "• una captura de pantalla, o",
  "• el enlace a la página donde se publica.",
  "",
  "Saco el nombre, la entidad, la fecha de cierre, los pasos y los documentos que piden, y la dejo en pendientes.",
  "<i>Escribe /cancelar si te arrepientes.</i>",
].join("\n");

export const NOMBRE_TIPO: Record<string, string> = {
  rut: "RUT",
  certificado_existencia_representacion: "Certificado de existencia y representación legal",
  cedula_representante_legal: "Cédula del representante legal",
  certificado_antecedentes_fiscales: "Antecedentes fiscales",
  certificado_antecedentes_disciplinarios: "Antecedentes disciplinarios",
  certificado_antecedentes_judiciales: "Antecedentes judiciales",
  estados_financieros: "Estados financieros",
  hoja_vida_entidad: "Hoja de vida de la entidad",
};

/** Lo que el bot contesta después de leer los documentos de una convocatoria. */
export interface ResumenExploracion {
  titulo: string;
  fechaCierre?: { fecha: Date; origen: "pdf" | "captura" | "sin_respaldo" };
  pasos: { titulo: string; descripcion?: string }[];
  documentos: { tipo: string; descripcion: string; listo: boolean }[];
  requisitosHabilitantes: string[];
  advertencias: string[];
  archivosLeidos: number;
}

const formatoCierre = new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeStyle: "short", timeZone: "America/Bogota" });

export function textoResumenExploracion(r: ResumenExploracion): string {
  const lineas = [`📖 Leí ${r.archivosLeidos === 1 ? "el archivo" : `los ${r.archivosLeidos} archivos`} de:`, `<b>${escaparHtml(r.titulo)}</b>`, ""];

  if (r.fechaCierre) {
    const cuando = escaparHtml(formatoCierre.format(r.fechaCierre.fecha));
    const respaldo =
      r.fechaCierre.origen === "pdf"
        ? "✔ confirmada en el documento"
        : r.fechaCierre.origen === "captura"
          ? "⚠ tomada de la captura, confírmala"
          : "⚠ no la pude confirmar en el documento, revísala";
    lineas.push(`⏳ <b>Cierre:</b> ${cuando}`, `    ${respaldo}`);
  } else {
    lineas.push("⏳ <b>Cierre:</b> no lo encontré. Si está en la página del proceso, mándame una captura del cronograma.");
  }

  if (r.pasos.length > 0) {
    lineas.push("", `🗓 <b>Paso a paso (${r.pasos.length}):</b>`);
    r.pasos.forEach((p, i) =>
      lineas.push(`${i + 1}. ${escaparHtml(p.titulo)}${p.descripcion ? ` — <i>${escaparHtml(p.descripcion)}</i>` : ""}`),
    );
  }

  if (r.documentos.length > 0) {
    const listos = r.documentos.filter((d) => d.listo).length;
    lineas.push("", `📎 <b>Documentos que piden</b> (ya tienes ${listos} de ${r.documentos.length}):`);
    for (const d of r.documentos) {
      const nombre = NOMBRE_TIPO[d.tipo] ?? d.descripcion;
      lineas.push(`${d.listo ? "✅" : "⬜"} ${escaparHtml(recortar(nombre, 140))}`);
    }
  }

  if (r.requisitosHabilitantes.length > 0) {
    lineas.push("", "🧾 <b>Requisitos habilitantes:</b>");
    for (const req of r.requisitosHabilitantes.slice(0, 8)) lineas.push(`• ${escaparHtml(recortar(req, 160))}`);
  }

  if (r.advertencias.length > 0) {
    lineas.push("", "⚠ <b>Para revisar:</b>");
    for (const a of r.advertencias.slice(0, 5)) lineas.push(`• ${escaparHtml(recortar(a, 200))}`);
  }

  lineas.push("", "Si me mandas más archivos de esta convocatoria, los leo junto con estos.");
  return lineas.join("\n");
}

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
