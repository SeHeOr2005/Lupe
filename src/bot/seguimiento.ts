/**
 * Seguimiento en el bot: /aprobadas lista las convocatorias en preparación y
 * cada una abre su checklist (pasos del cronograma y documentos exigidos) para
 * marcar lo que ya se hizo. El checklist se actualiza en el mismo mensaje.
 *
 * Botones "sg:...": ver (edita el mensaje), abrir (mensaje nuevo, desde otras
 * pantallas), p (paso), d (documento), lista (volver).
 */
import { GrammyError, InlineKeyboard, type Bot, type Context } from "grammy";
import { alternarDocumento, alternarPaso, checklistDe, listarEnSeguimiento } from "../services/seguimiento.js";
import { HttpError } from "../http/errors.js";
import { etiquetaConvocatoria, etiquetaDocumento, etiquetaPaso, textoChecklist, textoListaAprobadas } from "./seguimientoFormato.js";

const MAX_MENSAJE = 4_000;

/** 📋 Checklist + 📝 Borradores: para el resumen del explorador y la tarjeta de una convocatoria. */
export const botonesSeguimiento = (convocatoriaId: string) =>
  new InlineKeyboard().text("📋 Checklist", `sg:abrir:${convocatoriaId}`).text("📝 Borradores", `bd:menu:${convocatoriaId}`);

const recortar = (texto: string) => (texto.length <= MAX_MENSAJE ? texto : `${texto.slice(0, MAX_MENSAJE - 30)}\n…`);

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
  teclado.text("📝 Borradores", `bd:menu:${c.id}`).text("⬅️ Lista", "sg:lista");
  return { texto: textoChecklist(c, c.pasos, c.documentos), teclado };
}

export function registrarSeguimiento(bot: Bot) {
  bot.command(["aprobadas", "seguimiento"], async (ctx) => {
    const { texto, teclado } = await vistaLista();
    await ctx.reply(texto, { parse_mode: "HTML", reply_markup: teclado });
  });

  bot.callbackQuery(/^sg:(lista|ver|abrir|p|d)(?::(.+))?$/, async (ctx) => {
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
}
