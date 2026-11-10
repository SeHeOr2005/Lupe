/**
 * Bot de Telegram (grammY): la interfaz de la directora sobre el mismo flujo
 * que expone la API. No pasa por HTTP: llama directo a services/convocatorias.ts,
 * así que la validación de transiciones y la bitácora de eventos son las mismas.
 */
import { Bot, InlineKeyboard, type Context } from "grammy";
import { prisma } from "../db/prisma.js";
import { allowedTelegramUserIds } from "../config/env.js";
import { aprobarConvocatoria, descartarConvocatoria } from "../services/convocatorias.js";
import { HttpError } from "../http/errors.js";
import { registrarRecepcionDeDocumentos } from "./documentos.js";
import { registrarCarpeta } from "./carpeta.js";
import { botonesDecision } from "./teclados.js";
import { registrarBorradores } from "./borradores.js";
import { botonesSeguimiento, registrarSeguimiento } from "./seguimiento.js";
import { archivosPrevios } from "../explorador/aplicar.js";
import { crearAvisos } from "./avisos.js";
import { EsperaDeDocumentos } from "./espera.js";
import {
  ACCION,
  TAMANO_PAGINA,
  TEXTO_AYUDA,
  TEXTO_USO_CONVOCATORIA,
  estaAutorizado,
  idDeConvocatoriaEn,
  leerAccion,
  tarjetaConvocatoria,
  textoNoAutorizado,
  textoPaginacion,
  textoPedirDocumentos,
} from "./formato.js";

/** La tarjeta de una convocatoria con los botones que tocan según su estado. */
async function mostrarConvocatoria(ctx: Context, id: string) {
  const c = await prisma.convocatoria.findUnique({ where: { id } });
  if (!c) {
    await ctx.reply("No encontré una convocatoria con ese id. Cópialo de la última línea de su tarjeta (tócalo y se copia).");
    return;
  }
  await ctx.reply(`${tarjetaConvocatoria(c)}\n\nEstado: <b>${c.estado}</b>`, {
    parse_mode: "HTML",
    // Pendiente: decidir. Ya aprobada o en postulación: checklist y borradores.
    reply_markup:
      c.estado === "pendiente_aprobacion"
        ? botonesDecision(c.id)
        : ["aprobada", "en_postulacion"].includes(c.estado)
          ? botonesSeguimiento(c.id)
          : undefined,
    link_preview_options: { is_disabled: true },
  });
}

const ETIQUETA_ESTADO: Record<string, string> = {
  aprobada: "✅ <b>Aprobada</b>",
  descartada: "❌ <b>Descartada</b>",
};


function nombreDe(ctx: Context): string {
  return ctx.from?.first_name ?? `usuario ${ctx.from?.id ?? "?"}`;
}

/** Manda una página de pendientes: una tarjeta con botones por convocatoria, y al final "ver más". */
async function enviarPendientes(ctx: Context, desde: number) {
  const where = { estado: "pendiente_aprobacion" as const };
  const [total, convocatorias] = await Promise.all([
    prisma.convocatoria.count({ where }),
    prisma.convocatoria.findMany({
      where,
      orderBy: [{ fechaApertura: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: desde,
      take: TAMANO_PAGINA,
    }),
  ]);

  for (const c of convocatorias) {
    await ctx.reply(tarjetaConvocatoria(c), {
      parse_mode: "HTML",
      reply_markup: botonesDecision(c.id),
      link_preview_options: { is_disabled: true },
    });
  }

  const siguiente = desde + convocatorias.length;
  await ctx.reply(textoPaginacion(desde, convocatorias.length, total), {
    reply_markup:
      siguiente < total
        ? new InlineKeyboard().text(`Ver ${Math.min(TAMANO_PAGINA, total - siguiente)} más ▶`, `${ACCION.pendientes}:${siguiente}`)
        : undefined,
  });
}

/**
 * Botón ✅/❌: hace la transición y deja en la tarjeta quién decidió, sin botones.
 * Al aprobar, además pide el pliego para que el explorador arme el paso a paso.
 */
async function decidir(ctx: Context, accion: "aprobar" | "descartar", id: string, espera: EsperaDeDocumentos) {
  const nota = `${accion === "aprobar" ? "Aprobada" : "Descartada"} desde Telegram por ${nombreDe(ctx)}.`;
  try {
    const c = accion === "aprobar" ? await aprobarConvocatoria(id, nota) : await descartarConvocatoria(id, nota);
    await ctx.answerCallbackQuery({ text: accion === "aprobar" ? "Aprobada ✅" : "Descartada ❌" });
    await ctx.editMessageText(`${tarjetaConvocatoria(c)}\n\n${ETIQUETA_ESTADO[c.estado]} por ${nombreDe(ctx)}`, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });

    if (accion === "aprobar" && ctx.chat) {
      espera.marcar(ctx.chat.id, c.id);
      if ((await archivosPrevios(c.id)).length > 0) {
        // Ya se leyeron sus documentos (por ejemplo, si se agregó desde el bot con su PDF).
        await ctx.reply("📄 Ya tengo sus documentos y su paso a paso. Si te llega un anexo o una adenda, respóndeme con él aquí.", {
          reply_markup: botonesSeguimiento(c.id),
        });
        return;
      }
      // force_reply abre la respuesta a este mensaje: basta con adjuntar el PDF.
      await ctx.reply(textoPedirDocumentos(c), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: { force_reply: true, input_field_placeholder: "Adjunta el PDF del pliego" },
      });
    }
  } catch (err) {
    // 409: alguien ya la decidió (otra persona del equipo, u otro mensaje viejo). 404: ya no existe.
    if (err instanceof HttpError && (err.statusCode === 409 || err.statusCode === 404)) {
      const actual = await prisma.convocatoria.findUnique({ where: { id }, select: { estado: true } });
      await ctx.answerCallbackQuery({
        text: actual ? `Ya no está pendiente: quedó "${actual.estado}".` : "Esta convocatoria ya no existe.",
        show_alert: true,
      });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      return;
    }
    throw err;
  }
}

/**
 * Arma el bot con todos sus comandos. Devuelve también los avisos, cuyo reloj
 * del resumen diario se arranca aparte (arranque.ts), cuando el bot ya escucha.
 */
export function crearBot(token: string): { bot: Bot; avisos: ReturnType<typeof crearAvisos> } {
  const bot = new Bot(token);
  const permitidos = allowedTelegramUserIds();
  const espera = new EsperaDeDocumentos();

  // Lista blanca antes que todo: quien no esté en TELEGRAM_ALLOWED_USER_IDS solo
  // recibe su propio ID (para que se lo pase a quien administra) y nada más.
  bot.use(async (ctx, next) => {
    if (estaAutorizado(ctx.from?.id, permitidos)) return next();
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: "No tienes acceso a Lupe." });
    else if (ctx.from && ctx.chat?.type === "private") await ctx.reply(textoNoAutorizado(ctx.from.id), { parse_mode: "HTML" });
  });

  bot.command(["start", "ayuda", "help"], (ctx) => ctx.reply(TEXTO_AYUDA, { parse_mode: "HTML" }));

  bot.command("pendientes", (ctx) => enviarPendientes(ctx, 0));

  // El id se acepta como venga: "/convocatoria <id>", "/convocatoria id" o el id solo en
  // otro mensaje (más abajo). Así funciona copiándolo de la tarjeta y pegándolo.
  bot.command("convocatoria", async (ctx) => {
    const id = idDeConvocatoriaEn(ctx.match);
    if (!id) {
      await ctx.reply(TEXTO_USO_CONVOCATORIA, {
        parse_mode: "HTML",
        reply_markup: { force_reply: true, input_field_placeholder: "Pega aquí el id de la convocatoria" },
      });
      return;
    }
    await mostrarConvocatoria(ctx, id);
  });

  // Carpeta de la fundación (/documentos). Va antes del manejador general de botones
  // y del explorador: sus botones ("cp:...") y los archivos que espera son suyos.
  registrarCarpeta(bot);

  // Resumen diario de convocatorias nuevas (/avisos, /resumen). También antes del
  // manejador general: sus botones ("av:...") son suyos.
  const avisos = crearAvisos(bot);

  // PDF, capturas o enlaces → paso a paso de una convocatoria, o una convocatoria nueva
  // (/nueva). Antes del manejador general: su botón "nv:si" es suyo. Después de la
  // carpeta: si la carpeta espera un archivo o /cancelar, ella va primero.
  registrarRecepcionDeDocumentos(bot, token, espera);

  // Borradores con IA (/borrador, botón "📝 Borradores"): sus botones "bd:..." son suyos.
  registrarBorradores(bot, espera);

  // Seguimiento (/aprobadas): checklist de pasos y documentos. Sus botones "sg:..." son suyos.
  registrarSeguimiento(bot);

  // /cancelar: cada módulo de arriba limpió su paso a medias y pasó el turno; aquí se responde una vez.
  bot.command("cancelar", (ctx) => ctx.reply("Listo, cancelado."));

  bot.on("callback_query:data", async (ctx) => {
    const leida = leerAccion(ctx.callbackQuery.data);
    if (!leida) {
      await ctx.answerCallbackQuery();
      return;
    }
    if (leida.accion === "pendientes") {
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }); // el "ver más" viejo ya se usó
      await enviarPendientes(ctx, Number(leida.valor) || 0);
      return;
    }
    await decidir(ctx, leida.accion, leida.valor, espera);
  });

  // Un id de convocatoria suelto (copiado de una tarjeta, con o sin < >): se muestra esa convocatoria.
  bot.on("message:text", async (ctx, next) => {
    const id = ctx.message.text.startsWith("/") ? undefined : idDeConvocatoriaEn(ctx.message.text);
    if (!id) return next();
    await mostrarConvocatoria(ctx, id);
  });

  bot.on("message", (ctx) => ctx.reply("No entendí. Escribe /ayuda para ver lo que puedo hacer."));

  bot.catch((err) => {
    console.error("[bot] error atendiendo una actualización:", err.error);
  });

  return { bot, avisos };
}

/** Menú de comandos que Telegram muestra al escribir "/". */
export async function registrarComandos(bot: Bot) {
  await bot.api.setMyCommands([
    { command: "pendientes", description: "Convocatorias que esperan aprobación" },
    { command: "convocatoria", description: "Ver una convocatoria por id" },
    { command: "nueva", description: "Agregar una convocatoria (PDF, captura o enlace)" },
    { command: "aprobadas", description: "Convocatorias aprobadas y su checklist" },
    { command: "borrador", description: "Carta o propuesta en Word (responde a una convocatoria)" },
    { command: "documentos", description: "Carpeta de la fundación: ver, subir, actualizar" },
    { command: "avisos", description: "Activar o desactivar el resumen diario" },
    { command: "resumen", description: "Convocatorias nuevas de las últimas 24 horas" },
    { command: "cancelar", description: "Cancelar lo que estaba haciendo" },
    { command: "ayuda", description: "Qué puede hacer Lupe" },
  ]);
}
