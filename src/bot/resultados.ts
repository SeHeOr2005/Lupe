/**
 * /resultado en el bot: lista las postulaciones radicadas que esperan respuesta
 * y registra si se ganaron o no. Si se ganó, pide el monto adjudicado (o toma el
 * monto máximo con un botón) y deja creada la adjudicación.
 *
 * Botones "rs:...": lista, ver (una postulación), g (ganada), gmax (ganada por
 * el monto máximo), n (no ganada).
 */
import { InlineKeyboard, type Bot, type Context } from "grammy";
import { esperandoResultado, listarEsperandoResultado, registrarResultadoDesdeBot } from "../services/resultados.js";
import { HttpError } from "../http/errors.js";
import { EstadoPorChat } from "./espera.js";
import {
  etiquetaEsperando,
  leerMonto,
  textoListaResultados,
  textoPedirMonto,
  textoPreguntaResultado,
  textoResultadoRegistrado,
} from "./resultadosFormato.js";

const nombreDe = (ctx: Context) => ctx.from?.first_name ?? `usuario ${ctx.from?.id ?? "?"}`;

async function vistaLista() {
  const lista = await listarEsperandoResultado();
  const teclado = new InlineKeyboard();
  for (const e of lista) teclado.text(etiquetaEsperando(e), `rs:ver:${e.resultadoId}`).row();
  return { texto: textoListaResultados(lista.length), teclado };
}

export function registrarResultados(bot: Bot) {
  const esperandoMonto = new EstadoPorChat<string>(30 * 60 * 1000); // resultadoId que espera el monto

  async function registrar(ctx: Context, resultadoId: string, ganada: boolean, monto?: number) {
    esperandoMonto.quitar(ctx.chat!.id);
    try {
      const e = ganada
        ? await registrarResultadoDesdeBot(resultadoId, { ganada: true, montoAdjudicado: monto!, autor: nombreDe(ctx) })
        : await registrarResultadoDesdeBot(resultadoId, { ganada: false, autor: nombreDe(ctx) });
      await ctx.reply(textoResultadoRegistrado(e.titulo, ganada, monto), { parse_mode: "HTML" });
    } catch (err) {
      // 404: ya no está pendiente (alguien lo registró antes). 409: ya tenía resultado.
      if (err instanceof HttpError && (err.statusCode === 404 || err.statusCode === 409)) {
        await ctx.reply("Esa postulación ya tiene resultado registrado. Revisa /resultado para ver las que faltan.");
        return;
      }
      throw err;
    }
  }

  bot.command(["resultado", "resultados"], async (ctx) => {
    const { texto, teclado } = await vistaLista();
    await ctx.reply(texto, { parse_mode: "HTML", reply_markup: teclado });
  });

  bot.command("cancelar", async (ctx, next) => {
    esperandoMonto.quitar(ctx.chat.id);
    await next();
  });

  bot.callbackQuery(/^rs:(lista|ver|g|gmax|n)(?::(.+))?$/, async (ctx) => {
    const accion = ctx.match[1]!;
    const resultadoId = ctx.match[2] ?? "";
    try {
      if (accion === "lista") {
        await ctx.answerCallbackQuery();
        const { texto, teclado } = await vistaLista();
        await ctx.editMessageText(texto, { parse_mode: "HTML", reply_markup: teclado });
        return;
      }
      const e = await esperandoResultado(resultadoId);
      if (accion === "ver") {
        await ctx.answerCallbackQuery();
        await ctx.editMessageText(textoPreguntaResultado(e), {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard()
            .text("🏆 La ganamos", `rs:g:${resultadoId}`)
            .text("No fue seleccionada", `rs:n:${resultadoId}`)
            .row()
            .text("⬅️ Volver", "rs:lista"),
        });
        return;
      }
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      if (accion === "n") {
        await registrar(ctx, resultadoId, false);
        return;
      }
      if (accion === "gmax") {
        const maximo = e.montoMaximo === null ? undefined : Number(String(e.montoMaximo));
        if (!maximo) return;
        await registrar(ctx, resultadoId, true, maximo);
        return;
      }
      // "g": se pregunta el monto antes de registrar nada.
      esperandoMonto.poner(ctx.chat!.id, resultadoId);
      const maximo = e.montoMaximo === null ? 0 : Number(String(e.montoMaximo));
      await ctx.reply(textoPedirMonto(e), {
        parse_mode: "HTML",
        ...(maximo > 0 ? { reply_markup: new InlineKeyboard().text("Fue el monto máximo", `rs:gmax:${resultadoId}`) } : {}),
      });
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 404) {
        await ctx.answerCallbackQuery({ text: "Esa postulación ya tiene resultado. Abre /resultado de nuevo.", show_alert: true }).catch(() => {});
        return;
      }
      throw err;
    }
  });

  // El monto adjudicado que escribe después de tocar "La ganamos".
  bot.on("message:text", async (ctx, next) => {
    const resultadoId = esperandoMonto.leer(ctx.chat.id);
    const texto = ctx.message.text.trim();
    if (!resultadoId || texto.startsWith("/")) return next();
    const monto = leerMonto(texto);
    if (!monto) {
      await ctx.reply("No entendí el monto. Escríbelo así: 38.500.000 o 38,5 millones.");
      return;
    }
    await registrar(ctx, resultadoId, true, monto);
  });
}
