/**
 * Borradores con IA en el bot: carta de presentación y propuesta técnica de una
 * convocatoria, entregados como Word para editar.
 *
 *   /borrador (respondiendo a la tarjeta de una convocatoria) → elegir el tipo.
 *   Botón "📝 Borradores" (en el resumen del explorador y en la tarjeta) → igual.
 */
import { InlineKeyboard, InputFile, type Bot, type Context } from "grammy";
import { prisma } from "../db/prisma.js";
import { generarBorradorDeConvocatoria } from "../borradores/generar.js";
import { TIPOS_BORRADOR, type TipoBorrador } from "../borradores/contexto.js";
import { mensajeErrorIa } from "../ai/reintentos.js";
import { escaparHtml, idDeConvocatoriaEn } from "./formato.js";
import type { EsperaDeDocumentos } from "./espera.js";

const ABREV: Record<TipoBorrador, string> = { carta: "carta", propuesta: "prop" };
const DESDE_ABREV: Record<string, TipoBorrador> = { carta: "carta", prop: "propuesta" };

/** Botón que abre el menú de borradores de una convocatoria. */
export const botonBorradores = (convocatoriaId: string) => new InlineKeyboard().text("📝 Borradores", `bd:menu:${convocatoriaId}`);

function menuBorradores(convocatoriaId: string) {
  return new InlineKeyboard()
    .text("✉️ Carta de presentación", `bd:${ABREV.carta}:${convocatoriaId}`)
    .row()
    .text("📄 Propuesta técnica", `bd:${ABREV.propuesta}:${convocatoriaId}`);
}

async function mostrarMenu(ctx: Context, convocatoriaId: string) {
  const c = await prisma.convocatoria.findUnique({ where: { id: convocatoriaId }, select: { titulo: true } });
  if (!c) {
    await ctx.reply("No encontré esa convocatoria.");
    return;
  }
  await ctx.reply(
    `📝 <b>Borradores para:</b>\n${escaparHtml(c.titulo)}\n\n¿Cuál te preparo? Te lo mando en Word para que lo edites.`,
    { parse_mode: "HTML", reply_markup: menuBorradores(convocatoriaId) },
  );
}

export function registrarBorradores(bot: Bot, espera: EsperaDeDocumentos) {
  const enCurso = new Set<string>(); // evita generar dos veces el mismo borrador por doble toque

  bot.command("borrador", async (ctx) => {
    const id =
      idDeConvocatoriaEn(ctx.message?.reply_to_message?.text ?? ctx.message?.reply_to_message?.caption) ??
      idDeConvocatoriaEn(ctx.match) ??
      espera.para(ctx.chat.id); // la última convocatoria aprobada o agregada en este chat
    if (!id) {
      await ctx.reply("Mantén presionada la tarjeta de la convocatoria → <i>Responder</i>, y escribe /borrador.", {
        parse_mode: "HTML",
      });
      return;
    }
    await mostrarMenu(ctx, id);
  });

  bot.callbackQuery(/^bd:menu:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await mostrarMenu(ctx, ctx.match[1]!);
  });

  bot.callbackQuery(/^bd:(carta|prop):(.+)$/, async (ctx) => {
    const tipo = DESDE_ABREV[ctx.match[1]!]!;
    const convocatoriaId = ctx.match[2]!;
    const clave = `${tipo}:${convocatoriaId}`;
    if (enCurso.has(clave)) {
      await ctx.answerCallbackQuery({ text: "Ya lo estoy redactando…" });
      return;
    }
    enCurso.add(clave);
    await ctx.answerCallbackQuery({ text: `Redactando ${TIPOS_BORRADOR[tipo].nombre.toLowerCase()}…` });
    const aviso = await ctx.reply(`✍️ Redactando la ${TIPOS_BORRADOR[tipo].nombre.toLowerCase()}… tarda menos de un minuto.`);

    try {
      const b = await generarBorradorDeConvocatoria(convocatoriaId, tipo);
      const campos = b.camposPorCompletar.slice(0, 15).map((c) => `• ${escaparHtml(c)}`);
      const caption = [
        `📝 <b>${TIPOS_BORRADOR[tipo].nombre}</b> (borrador)`,
        ...(b.conDetalle
          ? []
          : ["⚠ Esta convocatoria no tiene sus documentos leídos: el borrador es general. Mándame el pliego y genéralo de nuevo."]),
        ...(campos.length
          ? ["", `Completa los campos resaltados en amarillo (${b.camposPorCompletar.length}):`, ...campos]
          : []),
        ...(b.camposPorCompletar.length > 15 ? ["…"] : []),
        "",
        "<i>Revísalo antes de enviarlo: lo redactó una IA.</i>",
      ].join("\n");
      await ctx.replyWithDocument(new InputFile(b.archivo, b.nombreArchivo), {
        caption: caption.length > 1000 ? `${caption.slice(0, 990)}…` : caption, // tope de Telegram: 1.024
        parse_mode: "HTML",
      });
      await ctx.api.deleteMessage(aviso.chat.id, aviso.message_id).catch(() => {});
    } catch (err) {
      console.error("[bot] error generando borrador:", err);
      await ctx.api
        .editMessageText(aviso.chat.id, aviso.message_id, `⚠ No pude redactar el borrador.\n${mensajeErrorIa(err)}`)
        .catch(() => {});
    } finally {
      enCurso.delete(clave);
    }
  });
}
