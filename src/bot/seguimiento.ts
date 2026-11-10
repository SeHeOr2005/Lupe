/**
 * Seguimiento en el bot: /aprobadas lista las convocatorias en preparación y
 * cada una abre su checklist (pasos del cronograma y documentos exigidos) para
 * marcar lo que ya se hizo. El checklist se actualiza en el mismo mensaje.
 * Desde el checklist, "🎒 Ya radicamos" registra la postulación (fecha y número
 * de radicado) y pasa la convocatoria a "postulada".
 *
 * Botones "sg:...": ver (edita el mensaje), abrir (mensaje nuevo, desde otras
 * pantallas), p (paso), d (documento), lista (volver), rad / rhoy / rsin
 * (radicación: empezar, fecha de hoy, sin número de radicado).
 */
import { GrammyError, InlineKeyboard, type Bot, type Context } from "grammy";
import {
  alternarDocumento,
  alternarPaso,
  checklistDe,
  EN_SEGUIMIENTO,
  listarEnSeguimiento,
  radicarDesdeBot,
} from "../services/seguimiento.js";
import { HttpError } from "../http/errors.js";
import { leerFechaEscrita } from "./carpetaFormato.js";
import { EstadoPorChat } from "./espera.js";
import {
  etiquetaConvocatoria,
  etiquetaDocumento,
  etiquetaPaso,
  fechaRadicacionValida,
  hoyEnColombia,
  textoChecklist,
  textoListaAprobadas,
  textoPedirFechaRadicacion,
  textoPedirNumeroRadicado,
  textoRadicada,
} from "./seguimientoFormato.js";

const MAX_MENSAJE = 4_000;

/** Lo que espera la radicación en cada chat: primero la fecha, luego el número. */
type PasoRadicacion = { paso: "fecha"; convocatoriaId: string } | { paso: "numero"; convocatoriaId: string; fecha: Date };

/** 📋 Checklist + 📝 Borradores: para el resumen del explorador y la tarjeta de una convocatoria. */
export const botonesSeguimiento = (convocatoriaId: string) =>
  new InlineKeyboard().text("📋 Checklist", `sg:abrir:${convocatoriaId}`).text("📝 Borradores", `bd:menu:${convocatoriaId}`);

const recortar = (texto: string) => (texto.length <= MAX_MENSAJE ? texto : `${texto.slice(0, MAX_MENSAJE - 30)}\n…`);
const nombreDe = (ctx: Context) => ctx.from?.first_name ?? `usuario ${ctx.from?.id ?? "?"}`;

/** Edita el mensaje del botón; si Telegram dice que no cambió nada, no es un error. */
async function editar(ctx: Context, texto: string, teclado: InlineKeyboard) {
  try {
    await ctx.editMessageText(recortar(texto), { parse_mode: "HTML", reply_markup: teclado, link_preview_options: { is_disabled: true } });
  } catch (err) {
    if (err instanceof GrammyError && err.description.includes("message is not modified")) return;
    throw err;
  }
}

async function vistaLista() {
  const lista = await listarEnSeguimiento();
  const teclado = new InlineKeyboard();
  for (const c of lista) teclado.text(etiquetaConvocatoria(c), `sg:ver:${c.id}`).row();
  return { texto: textoListaAprobadas(lista.length), teclado };
}

async function vistaChecklist(convocatoriaId: string) {
  const c = await checklistDe(convocatoriaId);
  const teclado = new InlineKeyboard();
  c.pasos.forEach((p, i) => teclado.text(etiquetaPaso(p, i), `sg:p:${p.id}`).row());
  for (const d of c.documentos) teclado.text(etiquetaDocumento(d), `sg:d:${d.id}`).row();
  if ((EN_SEGUIMIENTO as readonly string[]).includes(c.estado)) teclado.text("🎒 Ya radicamos", `sg:rad:${c.id}`).row();
  teclado.text("📝 Borradores", `bd:menu:${c.id}`).text("⬅️ Lista", "sg:lista");
  return { texto: textoChecklist(c, c.pasos, c.documentos), teclado };
}

export function registrarSeguimiento(bot: Bot) {
  const radicacion = new EstadoPorChat<PasoRadicacion>(30 * 60 * 1000); // 30 minutos para responder

  async function pedirNumero(ctx: Context, convocatoriaId: string, fecha: Date) {
    radicacion.poner(ctx.chat!.id, { paso: "numero", convocatoriaId, fecha });
    await ctx.reply(textoPedirNumeroRadicado(fecha), {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("No tengo número", `sg:rsin:${convocatoriaId}`),
    });
  }

  async function radicar(ctx: Context, convocatoriaId: string, fecha: Date, numeroRadicado?: string) {
    radicacion.quitar(ctx.chat!.id);
    try {
      const r = await radicarDesdeBot(convocatoriaId, { fechaRadicacion: fecha, autor: nombreDe(ctx), ...(numeroRadicado ? { numeroRadicado } : {}) });
      await ctx.reply(textoRadicada(r.titulo, fecha, numeroRadicado), { parse_mode: "HTML" });
    } catch (err) {
      // 409: ya estaba radicada (o en un estado que no lo permite). No es un fallo del bot.
      if (err instanceof HttpError && err.statusCode === 409) {
        await ctx.reply(`No la pude registrar: ${err.message}`);
        return;
      }
      throw err;
    }
  }

  bot.command(["aprobadas", "seguimiento"], async (ctx) => {
    const { texto, teclado } = await vistaLista();
    await ctx.reply(texto, { parse_mode: "HTML", reply_markup: teclado });
  });

  // /cancelar también anula una radicación a medias (la carpeta pasa el turno aquí).
  bot.command("cancelar", async (ctx, next) => {
    radicacion.quitar(ctx.chat.id);
    await next();
  });

  bot.callbackQuery(/^sg:(lista|ver|abrir|p|d|rad|rhoy|rsin)(?::(.+))?$/, async (ctx) => {
    const accion = ctx.match[1]!;
    const valor = ctx.match[2] ?? "";
    try {
      if (accion === "lista") {
        await ctx.answerCallbackQuery();
        const { texto, teclado } = await vistaLista();
        await editar(ctx, texto, teclado);
        return;
      }
      if (accion === "ver" || accion === "abrir") {
        await ctx.answerCallbackQuery();
        const { texto, teclado } = await vistaChecklist(valor);
        // "abrir" viene de otra pantalla (resumen, tarjeta): no se pisa ese mensaje.
        if (accion === "abrir") await ctx.reply(recortar(texto), { parse_mode: "HTML", reply_markup: teclado });
        else await editar(ctx, texto, teclado);
        return;
      }
      if (accion === "rad") {
        await ctx.answerCallbackQuery();
        const c = await checklistDe(valor);
        radicacion.poner(ctx.chat!.id, { paso: "fecha", convocatoriaId: valor });
        await ctx.reply(textoPedirFechaRadicacion(c.titulo), {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("Hoy", `sg:rhoy:${valor}`),
        });
        return;
      }
      if (accion === "rhoy") {
        await ctx.answerCallbackQuery();
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        await pedirNumero(ctx, valor, hoyEnColombia());
        return;
      }
      if (accion === "rsin") {
        const estado = radicacion.leer(ctx.chat!.id);
        if (estado?.paso !== "numero" || estado.convocatoriaId !== valor) {
          await ctx.answerCallbackQuery({ text: "Se venció el tiempo. Vuelve a tocar 🎒 Ya radicamos.", show_alert: true });
          return;
        }
        await ctx.answerCallbackQuery();
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
        await radicar(ctx, valor, estado.fecha);
        return;
      }
      const convocatoriaId = accion === "p" ? await alternarPaso(valor) : await alternarDocumento(valor);
      await ctx.answerCallbackQuery({ text: "Actualizado ✔" });
      const { texto, teclado } = await vistaChecklist(convocatoriaId);
      await editar(ctx, texto, teclado);
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 404) {
        await ctx.answerCallbackQuery({ text: "Eso ya no existe. Abre /aprobadas de nuevo.", show_alert: true }).catch(() => {});
        return;
      }
      throw err;
    }
  });

  // Lo que escribe durante la radicación: la fecha o el número de radicado.
  bot.on("message:text", async (ctx, next) => {
    const estado = radicacion.leer(ctx.chat.id);
    const texto = ctx.message.text.trim();
    if (!estado || texto.startsWith("/")) return next();

    if (estado.paso === "fecha") {
      const fecha = leerFechaEscrita(texto);
      if (!fecha) {
        await ctx.reply("No entendí la fecha. Escríbela así: 25/11/2026, o toca «Hoy».");
        return;
      }
      if (!fechaRadicacionValida(fecha)) {
        await ctx.reply("Esa fecha es futura. Escribe el día en que se radicó la propuesta.");
        return;
      }
      await pedirNumero(ctx, estado.convocatoriaId, fecha);
      return;
    }

    if (texto.length > 100) {
      await ctx.reply("Ese número es demasiado largo. Escribe solo el número de radicado.");
      return;
    }
    await radicar(ctx, estado.convocatoriaId, estado.fecha, texto);
  });
}
