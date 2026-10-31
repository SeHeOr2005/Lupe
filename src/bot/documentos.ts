/**
 * Recepción de documentos en el bot: la directora descarga de SECOP el pliego
 * (o los documentos precontractuales) y, si hace falta, toma una captura del
 * cronograma; responde a la tarjeta de la convocatoria con esos archivos y el
 * bot le devuelve la fecha de cierre, el paso a paso y los documentos exigidos
 * (explorador/aplicar.ts).
 *
 * Telegram entrega un álbum (PDF + captura) como mensajes separados, así que
 * los archivos de una misma convocatoria se juntan unos segundos antes de leerlos.
 */
import type { Bot, Context } from "grammy";
import { prisma } from "../db/prisma.js";
import { archivosPrevios, explorarConvocatoria, type ArchivoGuardado } from "../explorador/aplicar.js";
import { idDeConvocatoriaEn, TEXTO_SIN_CONVOCATORIA, textoResumenExploracion } from "./formato.js";
import { mensajeErrorIa } from "../ai/reintentos.js";

/** Límite de Telegram para que un bot descargue un archivo. */
const MAX_BYTES_ARCHIVO = 20 * 1024 * 1024;
/** Lo que se le puede mandar a Gemini en una sola petición (datos en línea). */
const MAX_BYTES_LECTURA = 18 * 1024 * 1024;
const ESPERA_ALBUM_MS = 3_000;
const MIME_ACEPTADOS = /^(application\/pdf|image\/(jpeg|png|webp))$/;
const MAX_MENSAJE = 4_000; // Telegram corta en 4.096 caracteres

interface Pendiente {
  chatId: number;
  convocatoriaId: string;
  archivos: ArchivoGuardado[];
  timer: NodeJS.Timeout;
}

/** El archivo que trae el mensaje (documento o foto), con lo necesario para descargarlo después. */
function archivoDelMensaje(ctx: Context): ArchivoGuardado | undefined {
  const m = ctx.message;
  if (m?.document) {
    return {
      nombre: m.document.file_name ?? "documento",
      mimeType: m.document.mime_type ?? "application/octet-stream",
      telegramFileId: m.document.file_id,
      telegramFileUniqueId: m.document.file_unique_id,
      tamano: m.document.file_size ?? 0,
    };
  }
  const foto = m?.photo?.at(-1); // la última es la de mayor resolución
  if (foto) {
    return {
      nombre: `captura-${m!.date}.jpg`,
      mimeType: "image/jpeg",
      telegramFileId: foto.file_id,
      telegramFileUniqueId: foto.file_unique_id,
      tamano: foto.file_size ?? 0,
    };
  }
  return undefined;
}

async function descargar(bot: Bot, token: string, archivo: ArchivoGuardado): Promise<Buffer> {
  const file = await bot.api.getFile(archivo.telegramFileId);
  if (!file.file_path) throw new Error(`Telegram no entregó la ruta de "${archivo.nombre}".`);
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!res.ok) throw new Error(`No pude descargar "${archivo.nombre}" de Telegram (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

function recortarMensaje(texto: string): string {
  return texto.length <= MAX_MENSAJE ? texto : `${texto.slice(0, MAX_MENSAJE - 40)}\n…\n(resumen recortado)`;
}

export function registrarRecepcionDeDocumentos(bot: Bot, token: string) {
  const pendientes = new Map<string, Pendiente>(); // clave: chat + convocatoria
  const albumes = new Map<string, string>(); // media_group_id → convocatoria (solo el 1.er mensaje trae el pie)
  const enCurso = new Map<string, Promise<void>>(); // una lectura a la vez por convocatoria

  async function leer(p: Pendiente) {
    const aviso = await bot.api.sendMessage(p.chatId, "📖 Leyendo los documentos… puede tardar hasta un minuto.");
    const editar = (texto: string) =>
      bot.api.editMessageText(p.chatId, aviso.message_id, recortarMensaje(texto), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });

    try {
      // Se releen también los archivos que ya se habían mandado, para interpretarlos juntos.
      const todos = [...(await archivosPrevios(p.convocatoriaId))];
      for (const a of p.archivos) if (!todos.some((t) => t.telegramFileUniqueId === a.telegramFileUniqueId)) todos.push(a);

      // Si no caben todos en una lectura, se priorizan los más recientes.
      const seleccion: ArchivoGuardado[] = [];
      let bytes = 0;
      for (const a of [...todos].reverse()) {
        if (bytes + a.tamano > MAX_BYTES_LECTURA) continue;
        seleccion.unshift(a);
        bytes += a.tamano;
      }
      if (seleccion.length === 0) throw new Error("Los archivos pesan demasiado para leerlos (máximo 18 MB en total).");

      const archivos = [];
      for (const meta of seleccion) {
        archivos.push({ nombre: meta.nombre, mimeType: meta.mimeType, datos: await descargar(bot, token, meta), meta });
      }

      const r = await explorarConvocatoria(p.convocatoriaId, archivos);
      const omitidos = todos.length - seleccion.length;
      await editar(
        textoResumenExploracion({
          titulo: r.titulo,
          ...(r.plan.fechaCierre ? { fechaCierre: r.plan.fechaCierre } : {}),
          pasos: r.plan.pasos,
          documentos: r.documentos,
          requisitosHabilitantes: r.plan.requisitos.habilitantes,
          advertencias: [
            ...r.plan.advertencias,
            ...(omitidos > 0 ? [`No alcancé a leer ${omitidos} archivo(s) viejo(s) por tamaño.`] : []),
          ],
          archivosLeidos: r.archivosLeidos,
        }),
      );
    } catch (err) {
      console.error("[bot] error leyendo documentos:", err);
      await editar(`⚠ No pude leer los documentos.\n<i>${mensajeErrorIa(err).replace(/[<>&]/g, "")}</i>`).catch(() => {});
    }
  }

  bot.on(["message:document", "message:photo"], async (ctx) => {
    const archivo = archivoDelMensaje(ctx);
    if (!archivo) return;

    if (!MIME_ACEPTADOS.test(archivo.mimeType)) {
      await ctx.reply("Solo puedo leer PDF o imágenes (JPG, PNG). Descarga el documento en PDF y vuelve a enviarlo.");
      return;
    }
    if (archivo.tamano > MAX_BYTES_ARCHIVO) {
      await ctx.reply("Ese archivo pesa más de 20 MB, el máximo que Telegram me deja descargar. Envía solo el pliego o la invitación.");
      return;
    }

    const grupo = ctx.message.media_group_id;
    const convocatoriaId =
      idDeConvocatoriaEn(ctx.message.reply_to_message?.text ?? ctx.message.reply_to_message?.caption) ??
      idDeConvocatoriaEn(ctx.message.caption) ??
      (grupo ? albumes.get(grupo) : undefined);
    if (!convocatoriaId) {
      // En un álbum solo el primer archivo trae la respuesta; los demás esperan un momento a que llegue.
      if (!grupo) await ctx.reply(TEXTO_SIN_CONVOCATORIA, { parse_mode: "HTML" });
      return;
    }
    if (grupo) albumes.set(grupo, convocatoriaId);

    const existe = await prisma.convocatoria.findUnique({ where: { id: convocatoriaId }, select: { id: true } });
    if (!existe) {
      await ctx.reply("No encontré esa convocatoria. Responde a la tarjeta que aparece en /pendientes.");
      return;
    }

    const clave = `${ctx.chat.id}:${convocatoriaId}`;
    const pendiente = pendientes.get(clave);
    if (pendiente) clearTimeout(pendiente.timer);
    const p: Pendiente = pendiente ?? { chatId: ctx.chat.id, convocatoriaId, archivos: [], timer: undefined! };
    p.archivos.push(archivo);
    p.timer = setTimeout(() => {
      pendientes.delete(clave);
      const anterior = enCurso.get(convocatoriaId) ?? Promise.resolve();
      const siguiente = anterior.then(() => leer(p));
      enCurso.set(convocatoriaId, siguiente);
      void siguiente.finally(() => {
        if (enCurso.get(convocatoriaId) === siguiente) enCurso.delete(convocatoriaId);
        if (grupo) albumes.delete(grupo);
      });
    }, ESPERA_ALBUM_MS);
    pendientes.set(clave, p);
  });
}
