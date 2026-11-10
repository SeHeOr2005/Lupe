/**
 * Carpeta de la fundación en el bot (/documentos): un menú con los documentos
 * guardados (RUT, certificados, cédula...) para verlos, subir nuevos,
 * reemplazar el archivo, editar sus datos (nombre, fechas) o eliminarlos.
 *
 * Los pasos que esperan una respuesta (el archivo, una fecha, un nombre) se
 * guardan por chat en memoria; /cancelar los anula. Mientras uno está activo,
 * los archivos que llegan son para la carpeta y no para el explorador.
 */
import { InlineKeyboard, type Bot, type Context } from "grammy";
import { HttpError } from "../http/errors.js";
import {
  actualizarDatos,
  crearDocumento,
  eliminarDocumento,
  listarDocumentos,
  obtenerDocumento,
  reemplazarArchivo,
} from "../services/documentosFundacion.js";
import type { TipoDocumento } from "../explorador/plan.js";
import {
  cb,
  etiquetaBotonDocumento,
  leerAccionCarpeta,
  leerFechaEscrita,
  mostrarDia,
  nombreTipo,
  OPCIONES_TIPO,
  textoCarpeta,
  textoDetalleDocumento,
} from "./carpetaFormato.js";
import { escaparHtml } from "./formato.js";
import { EstadoPorChat } from "./espera.js";

type Paso =
  | { paso: "archivo"; tipo: TipoDocumento; reemplazaId?: string }
  | { paso: "fecha"; documentoId: string; campo: "fechaVencimiento" | "fechaExpedicion" }
  | { paso: "nombre"; documentoId: string };

const MAX_BYTES = 20 * 1024 * 1024; // lo que Telegram deja descargar a un bot
const MIME_ACEPTADOS = /^(application\/pdf|image\/(jpeg|png|webp)|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))$/;
const SIN_FECHA = /^(no\s*vence|sin\s*fecha|ninguna|no\s*tiene)$/i;

function tecladoDetalle(id: string) {
  return new InlineKeyboard()
    .text("🔄 Reemplazar archivo", cb("reemp", id))
    .text("✏️ Editar datos", cb("editar", id))
    .row()
    .text("🗑 Eliminar", cb("elim", id))
    .text("⬅️ Volver", cb("menu"));
}

/** Si el botón venía de un mensaje de texto, lo edita; si venía de un archivo (con pie), manda uno nuevo. */
async function responder(ctx: Context, texto: string, teclado?: InlineKeyboard) {
  const opciones = { parse_mode: "HTML" as const, reply_markup: teclado, link_preview_options: { is_disabled: true } };
  if (ctx.callbackQuery?.message && "text" in ctx.callbackQuery.message && ctx.callbackQuery.message.text) {
    await ctx.editMessageText(texto, opciones);
  } else {
    await ctx.reply(texto, opciones);
  }
}

async function mostrarMenu(ctx: Context) {
  const docs = await listarDocumentos();
  const teclado = new InlineKeyboard();
  for (const d of docs) teclado.text(etiquetaBotonDocumento(d), cb("ver", d.id)).row();
  teclado.text("➕ Subir documento", cb("subir"));
  await responder(ctx, textoCarpeta(docs), teclado);
}

/** Manda el archivo con su ficha. Las fotos no se pueden reenviar como documento: se intenta de las dos formas. */
async function mostrarDocumento(ctx: Context, id: string) {
  const doc = await obtenerDocumento(id);
  const opciones = { caption: textoDetalleDocumento(doc), parse_mode: "HTML" as const, reply_markup: tecladoDetalle(id) };
  if (doc.telegramFileId) {
    try {
      await ctx.replyWithDocument(doc.telegramFileId, opciones);
      return;
    } catch {
      try {
        await ctx.replyWithPhoto(doc.telegramFileId, opciones);
        return;
      } catch {
        // Archivo subido con otro bot (el file_id es por bot) o ya no disponible: se muestra solo la ficha.
      }
    }
  }
  await ctx.reply(`${textoDetalleDocumento(doc)}\n\n<i>No tengo el archivo; puedes subirlo con «Reemplazar archivo».</i>`, {
    parse_mode: "HTML",
    reply_markup: tecladoDetalle(id),
  });
}

async function pedir(ctx: Context, texto: string, placeholder: string) {
  await ctx.reply(`${texto}\n\n<i>Escribe /cancelar si te arrepientes.</i>`, {
    parse_mode: "HTML",
    reply_markup: { force_reply: true, input_field_placeholder: placeholder },
  });
}

export function registrarCarpeta(bot: Bot) {
  const pasos = new EstadoPorChat<Paso>(30 * 60 * 1000); // 30 minutos para responder

  bot.command(["documentos", "carpeta"], (ctx) => mostrarMenu(ctx));

  // Limpia el paso de la carpeta y deja que los demás módulos limpien el suyo (bot.ts responde).
  bot.command("cancelar", async (ctx, next) => {
    pasos.quitar(ctx.chat.id);
    await next();
  });

  bot.callbackQuery(/^cp:/, async (ctx) => {
    const leida = leerAccionCarpeta(ctx.callbackQuery.data);
    const chatId = ctx.chat?.id;
    if (!leida || chatId === undefined) {
      await ctx.answerCallbackQuery();
      return;
    }
    const { accion, valor } = leida;
    await ctx.answerCallbackQuery();

    try {
      switch (accion) {
        case "menu":
          pasos.quitar(chatId);
          await mostrarMenu(ctx);
          return;

        case "ver":
          await mostrarDocumento(ctx, valor);
          return;

        case "subir": {
          const teclado = new InlineKeyboard();
          OPCIONES_TIPO.forEach((o, i) => {
            teclado.text(o.nombre, cb("tipo", o.tipo));
            if (i % 2 === 1) teclado.row();
          });
          teclado.row().text("⬅️ Volver", cb("menu"));
          await responder(ctx, "➕ <b>¿Qué documento vas a subir?</b>", teclado);
          return;
        }

        case "tipo": {
          const opcion = OPCIONES_TIPO.find((o) => o.tipo === valor);
          if (!opcion) return;
          pasos.poner(chatId, { paso: "archivo", tipo: opcion.tipo });
          await pedir(ctx, `📎 Envíame el archivo de <b>${escaparHtml(opcion.nombre)}</b> (PDF o foto).`, "Adjunta el archivo");
          return;
        }

        case "reemp": {
          const doc = await obtenerDocumento(valor);
          pasos.poner(chatId, { paso: "archivo", tipo: doc.tipo, reemplazaId: doc.id });
          await pedir(
            ctx,
            `🔄 Envíame el archivo nuevo de <b>${escaparHtml(nombreTipo(doc.tipo))}</b>. Reemplazará al actual y sus fechas.`,
            "Adjunta el archivo nuevo",
          );
          return;
        }

        case "editar": {
          const doc = await obtenerDocumento(valor);
          const teclado = new InlineKeyboard()
            .text("📝 Cambiar nombre", cb("nombre", doc.id))
            .row()
            .text("⏳ Fecha de vencimiento", cb("venc", doc.id))
            .row()
            .text("📅 Fecha de expedición", cb("exp", doc.id))
            .row()
            .text("⬅️ Volver", cb("ver", doc.id));
          await ctx.reply(`✏️ <b>Editar:</b> ${escaparHtml(doc.nombre)}\n¿Qué quieres cambiar?`, {
            parse_mode: "HTML",
            reply_markup: teclado,
          });
          return;
        }

        case "nombre":
          await obtenerDocumento(valor);
          pasos.poner(chatId, { paso: "nombre", documentoId: valor });
          await pedir(ctx, "📝 Escribe el nuevo nombre del documento.", "Nombre del documento");
          return;

        case "venc":
        case "exp":
          await obtenerDocumento(valor);
          pasos.poner(chatId, { paso: "fecha", documentoId: valor, campo: accion === "venc" ? "fechaVencimiento" : "fechaExpedicion" });
          await pedir(
            ctx,
            accion === "venc"
              ? "⏳ Escribe la fecha de vencimiento (por ejemplo 15/03/2027), o «no vence»."
              : "📅 Escribe la fecha de expedición (por ejemplo 15/03/2026).",
            "dd/mm/aaaa",
          );
          return;

        case "elim": {
          const doc = await obtenerDocumento(valor);
          const teclado = new InlineKeyboard().text("🗑 Sí, eliminar", cb("borrar", doc.id)).text("Cancelar", cb("ver", doc.id));
          await ctx.reply(`¿Eliminar <b>${escaparHtml(doc.nombre)}</b> de la carpeta? No se puede deshacer.`, {
            parse_mode: "HTML",
            reply_markup: teclado,
          });
          return;
        }

        case "borrar": {
          const { doc, convocatoriasAfectadas } = await eliminarDocumento(valor);
          await ctx.editMessageText(
            `🗑 Eliminé <b>${escaparHtml(doc.nombre)}</b>.` +
              (convocatoriasAfectadas > 0
                ? `\n${convocatoriasAfectadas} convocatoria(s) que lo usaban quedaron con ese documento pendiente.`
                : ""),
            { parse_mode: "HTML" },
          );
          await mostrarMenu(ctx);
          return;
        }
      }
    } catch (err) {
      if (err instanceof HttpError && err.statusCode === 404) {
        await ctx.reply("Ese documento ya no existe. Te muestro la carpeta actualizada.");
        await mostrarMenu(ctx);
        return;
      }
      throw err;
    }
  });

  // Archivos: solo si la carpeta está esperando uno; si no, siguen al explorador de convocatorias.
  bot.on(["message:document", "message:photo"], async (ctx, next) => {
    const paso = pasos.leer(ctx.chat.id);
    if (paso?.paso !== "archivo") return next();

    const m = ctx.message;
    const foto = m.photo?.at(-1);
    const archivo = m.document
      ? { fileId: m.document.file_id, nombre: m.document.file_name, mime: m.document.mime_type ?? "", tamano: m.document.file_size ?? 0 }
      : { fileId: foto!.file_id, nombre: undefined, mime: "image/jpeg", tamano: foto!.file_size ?? 0 };

    if (!MIME_ACEPTADOS.test(archivo.mime)) {
      await ctx.reply("Solo guardo PDF, fotos o documentos de Word. Vuelve a enviarlo, o escribe /cancelar.");
      return;
    }
    if (archivo.tamano > MAX_BYTES) {
      await ctx.reply("Ese archivo pesa más de 20 MB, el máximo de Telegram para bots. Envía una versión más liviana.");
      return;
    }

    pasos.quitar(ctx.chat.id);
    const { doc, convocatoriasActualizadas } = paso.reemplazaId
      ? await reemplazarArchivo(paso.reemplazaId, archivo.fileId)
      : await crearDocumento({ tipo: paso.tipo, nombre: archivo.nombre?.trim() || nombreTipo(paso.tipo), telegramFileId: archivo.fileId });

    const teclado = new InlineKeyboard()
      .text("⏳ Poner vencimiento", cb("venc", doc.id))
      .text("📁 Ver carpeta", cb("menu"));
    await ctx.reply(
      `✅ ${paso.reemplazaId ? "Reemplacé" : "Guardé"} <b>${escaparHtml(nombreTipo(doc.tipo))}</b>.` +
        (convocatoriasActualizadas > 0
          ? `\nLo marqué como listo en ${convocatoriasActualizadas} convocatoria(s) que lo pedían.`
          : "") +
        "\n\n¿Tiene fecha de vencimiento? Así te aviso antes de que venza.",
      { parse_mode: "HTML", reply_markup: teclado },
    );
  });

  // Textos: la fecha o el nombre que el bot pidió.
  bot.on("message:text", async (ctx, next) => {
    const paso = pasos.leer(ctx.chat.id);
    if (!paso || paso.paso === "archivo") return next();
    const texto = ctx.message.text.trim();

    if (paso.paso === "nombre") {
      if (texto.length < 2 || texto.length > 120) {
        await ctx.reply("El nombre debe tener entre 2 y 120 caracteres. Escríbelo de nuevo, o /cancelar.");
        return;
      }
      pasos.quitar(ctx.chat.id);
      const doc = await actualizarDatos(paso.documentoId, { nombre: texto });
      await ctx.reply(`✅ Nombre actualizado.\n\n${textoDetalleDocumento(doc)}`, { parse_mode: "HTML", reply_markup: tecladoDetalle(doc.id) });
      return;
    }

    const sinFecha = paso.campo === "fechaVencimiento" && SIN_FECHA.test(texto);
    const fecha = sinFecha ? null : leerFechaEscrita(texto);
    if (fecha === undefined) {
      await ctx.reply("No entendí la fecha. Escríbela así: 15/03/2027" + (paso.campo === "fechaVencimiento" ? " (o «no vence»)." : "."));
      return;
    }
    pasos.quitar(ctx.chat.id);
    const doc = await actualizarDatos(paso.documentoId, { [paso.campo]: fecha });
    const que = paso.campo === "fechaVencimiento" ? "vencimiento" : "expedición";
    await ctx.reply(
      `✅ Fecha de ${que}: ${fecha ? mostrarDia(fecha) : "no vence"}.\n\n${textoDetalleDocumento(doc)}`,
      { parse_mode: "HTML", reply_markup: tecladoDetalle(doc.id) },
    );
  });
}
