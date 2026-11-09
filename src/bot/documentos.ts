/**
 * Recepción de documentos en el bot. Un PDF, una captura o un enlace puede ser:
 *   - De una convocatoria que ya está en Lupe (se respondió a su tarjeta, o es la
 *     última que se aprobó en el chat): el explorador saca fecha de cierre, paso a
 *     paso y documentos exigidos (explorador/aplicar.ts).
 *   - Una convocatoria nueva que le llegó a la directora por otro lado (/nueva, o
 *     el botón "Es una convocatoria nueva"): se crea en pendientes con todo lo
 *     anterior (explorador/nueva.ts).
 *
 * Telegram entrega un álbum (PDF + captura) como mensajes separados, así que
 * los archivos de un mismo destino se juntan unos segundos antes de leerlos.
 */
import { InlineKeyboard, type Bot, type Context } from "grammy";
import { prisma } from "../db/prisma.js";
import {
  archivosPrevios,
  claveArchivo,
  explorarConvocatoria,
  type ArchivoGuardado,
  type ResultadoExploracion,
} from "../explorador/aplicar.js";
import { crearConvocatoriaDesdeDocumentos } from "../explorador/nueva.js";
import { descargarEnlace, enlaceEn, esEnlacePermitido, normalizarEnlace } from "../explorador/enlace.js";
import {
  escaparHtml,
  idDeConvocatoriaEn,
  tarjetaConvocatoria,
  TEXTO_NUEVA,
  TEXTO_SIN_CONVOCATORIA,
  textoResumenExploracion,
} from "./formato.js";
import { mensajeErrorIa } from "../ai/reintentos.js";
import { EstadoPorChat, type EsperaDeDocumentos } from "./espera.js";
import { botonesDecision } from "./teclados.js";
import { botonBorradores } from "./borradores.js";

/** Límite de Telegram para que un bot descargue un archivo. */
const MAX_BYTES_ARCHIVO = 20 * 1024 * 1024;
/** Lo que se le puede mandar a Gemini en una sola petición (datos en línea). */
const MAX_BYTES_LECTURA = 18 * 1024 * 1024;
const ESPERA_ALBUM_MS = 3_000;
const MIME_ACEPTADOS = /^(application\/pdf|image\/(jpeg|png|webp))$/;
const MAX_MENSAJE = 4_000; // Telegram corta en 4.096 caracteres
const BOTON_NUEVA = "nv:si";

/** Para qué es lo que llegó: una convocatoria que ya existe, o una nueva. */
type Destino = { tipo: "existente"; convocatoriaId: string } | { tipo: "nueva" };

interface Pendiente {
  chatId: number;
  destino: Destino;
  autor: string;
  archivos: ArchivoGuardado[];
  timer?: NodeJS.Timeout;
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

const archivoDeEnlace = (url: string): ArchivoGuardado => ({ nombre: url, mimeType: "enlace", url, tamano: 0 });

function recortarMensaje(texto: string): string {
  return texto.length <= MAX_MENSAJE ? texto : `${texto.slice(0, MAX_MENSAJE - 40)}\n…\n(resumen recortado)`;
}

const nombreDe = (ctx: Context) => ctx.from?.first_name ?? `usuario ${ctx.from?.id ?? "?"}`;

function resumenDe(r: ResultadoExploracion, omitidos = 0): string {
  return textoResumenExploracion({
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
  });
}

export function registrarRecepcionDeDocumentos(bot: Bot, token: string, espera: EsperaDeDocumentos) {
  const pendientes = new Map<string, Pendiente>(); // clave: chat + destino
  const albumes = new Map<string, Destino>(); // media_group_id → destino (solo el 1.er mensaje trae la respuesta)
  const enCurso = new Map<string, Promise<void>>(); // una lectura a la vez por destino
  const modoNueva = new EstadoPorChat<true>(30 * 60 * 1000); // /nueva: lo próximo que mande es una convocatoria nueva
  const huerfanos = new EstadoPorChat<ArchivoGuardado[]>(30 * 60 * 1000); // llegaron sin destino: ¿es nueva?
  const albumesSinDestino = new Set<string>(); // álbumes por los que ya se preguntó "¿es nueva?"
  /** Los álbumes llegan en segundos: pasado un minuto se olvidan. */
  const olvidarAlbum = (grupo: string) =>
    setTimeout(() => {
      albumes.delete(grupo);
      albumesSinDestino.delete(grupo);
    }, 60_000).unref();

  async function descargar(meta: ArchivoGuardado) {
    if (meta.url) {
      const leido = await descargarEnlace(meta.url);
      return { ...leido, meta: { ...meta, mimeType: leido.mimeType, tamano: leido.datos.length } };
    }
    const file = await bot.api.getFile(meta.telegramFileId!);
    if (!file.file_path) throw new Error(`Telegram no entregó la ruta de "${meta.nombre}".`);
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
    if (!res.ok) throw new Error(`No pude descargar "${meta.nombre}" de Telegram (${res.status}).`);
    return { nombre: meta.nombre, mimeType: meta.mimeType, datos: Buffer.from(await res.arrayBuffer()), meta };
  }

  /** Si no caben todos en una lectura, se priorizan los más recientes. */
  function seleccionar(todos: ArchivoGuardado[]) {
    const seleccion: ArchivoGuardado[] = [];
    let bytes = 0;
    for (const a of [...todos].reverse()) {
      if (bytes + a.tamano > MAX_BYTES_LECTURA) continue;
      seleccion.unshift(a);
      bytes += a.tamano;
    }
    if (seleccion.length === 0) throw new Error("Los archivos pesan demasiado para leerlos (máximo 18 MB en total).");
    return seleccion;
  }

  async function mostrarTarjeta(chatId: number, convocatoriaId: string, encabezado: string) {
    const c = await prisma.convocatoria.findUnique({ where: { id: convocatoriaId } });
    if (!c) return;
    await bot.api.sendMessage(chatId, `${encabezado}\n\n${tarjetaConvocatoria(c)}`, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(c.estado === "pendiente_aprobacion" ? { reply_markup: botonesDecision(c.id) } : {}),
    });
  }

  async function leer(p: Pendiente) {
    const aviso = await bot.api.sendMessage(
      p.chatId,
      p.destino.tipo === "nueva"
        ? "📖 Leyendo la convocatoria para agregarla… puede tardar hasta un minuto."
        : "📖 Leyendo los documentos… puede tardar hasta un minuto.",
    );
    const editar = (texto: string, teclado?: InlineKeyboard) =>
      bot.api.editMessageText(p.chatId, aviso.message_id, recortarMensaje(texto), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(teclado ? { reply_markup: teclado } : {}),
      });

    try {
      if (p.destino.tipo === "nueva") {
        const archivos = [];
        for (const meta of seleccionar(p.archivos)) archivos.push(await descargar(meta));
        const r = await crearConvocatoriaDesdeDocumentos(archivos, p.autor);
        // Lo próximo que mande sin responder (un anexo, la captura del cronograma) es para esta.
        espera.marcar(p.chatId, r.convocatoriaId);
        if (r.tipo === "duplicada") {
          await editar(`📌 Esa convocatoria ya estaba en Lupe: <b>${escaparHtml(r.titulo)}</b>`);
          await mostrarTarjeta(p.chatId, r.convocatoriaId, "Aquí está:");
          return;
        }
        await editar(`➕ <b>Convocatoria agregada.</b>\n\n${resumenDe(r.exploracion)}`, botonBorradores(r.convocatoriaId));
        await mostrarTarjeta(p.chatId, r.convocatoriaId, "Quedó en pendientes. ¿La apruebas?");
        return;
      }

      // Existente: se releen también los archivos que ya se habían mandado, para interpretarlos juntos.
      const { convocatoriaId } = p.destino;
      const todos = [...(await archivosPrevios(convocatoriaId))];
      for (const a of p.archivos) if (!todos.some((t) => claveArchivo(t) === claveArchivo(a))) todos.push(a);
      const seleccion = seleccionar(todos);
      const archivos = [];
      for (const meta of seleccion) archivos.push(await descargar(meta));
      const r = await explorarConvocatoria(convocatoriaId, archivos);
      await editar(resumenDe(r, todos.length - seleccion.length), botonBorradores(convocatoriaId));
    } catch (err) {
      console.error("[bot] error leyendo documentos:", err);
      await editar(`⚠ No pude leer los documentos.\n<i>${mensajeErrorIa(err).replace(/[<>&]/g, "")}</i>`).catch(() => {});
    }
  }

  /** Junta los archivos que llegan seguidos para un mismo destino y los lee juntos. */
  function encolar(chatId: number, destino: Destino, autor: string, archivos: ArchivoGuardado[], { esperar = true } = {}) {
    const llaveDestino = destino.tipo === "nueva" ? `nueva:${chatId}` : destino.convocatoriaId;
    const clave = `${chatId}:${llaveDestino}`;
    const p = pendientes.get(clave) ?? { chatId, destino, autor, archivos: [] };
    if (p.timer) clearTimeout(p.timer);
    for (const a of archivos) if (!p.archivos.some((t) => claveArchivo(t) === claveArchivo(a))) p.archivos.push(a);

    const lanzar = () => {
      pendientes.delete(clave);
      if (destino.tipo === "nueva") modoNueva.quitar(chatId);
      const siguiente = (enCurso.get(llaveDestino) ?? Promise.resolve()).then(() => leer(p));
      enCurso.set(llaveDestino, siguiente);
      void siguiente.finally(() => {
        if (enCurso.get(llaveDestino) === siguiente) enCurso.delete(llaveDestino);
      });
    };
    if (!esperar) return lanzar();
    p.timer = setTimeout(lanzar, ESPERA_ALBUM_MS);
    pendientes.set(clave, p);
  }

  /** ¿A qué convocatoria va? Por la tarjeta respondida, el pie, /nueva, el álbum o la última aprobada. */
  function destinoDe(ctx: Context): Destino | undefined {
    const m = ctx.message!;
    const id = idDeConvocatoriaEn(m.reply_to_message?.text ?? m.reply_to_message?.caption) ?? idDeConvocatoriaEn(m.caption);
    if (id) return { tipo: "existente", convocatoriaId: id };
    if (modoNueva.leer(ctx.chat!.id)) return { tipo: "nueva" };
    if (m.media_group_id && albumesSinDestino.has(m.media_group_id)) return undefined; // el resto del álbum también espera la respuesta
    const grupo = m.media_group_id ? albumes.get(m.media_group_id) : undefined;
    if (grupo) return grupo;
    const ultima = espera.para(ctx.chat!.id);
    return ultima ? { tipo: "existente", convocatoriaId: ultima } : undefined;
  }

  async function recibir(ctx: Context, archivo: ArchivoGuardado) {
    const chatId = ctx.chat!.id;
    const grupo = ctx.message?.media_group_id;
    const destino = destinoDe(ctx);

    if (!destino) {
      // Llegó sin decir de qué convocatoria es: se guarda y se pregunta si es una nueva.
      const yaHabia = huerfanos.leer(chatId) ?? [];
      huerfanos.poner(chatId, [...yaHabia, archivo]);
      if (!grupo || !albumesSinDestino.has(grupo)) {
        if (grupo) {
          albumesSinDestino.add(grupo); // se pregunta una sola vez por álbum
          olvidarAlbum(grupo);
        }
        await ctx.reply(TEXTO_SIN_CONVOCATORIA, {
          parse_mode: "HTML",
          reply_markup: new InlineKeyboard().text("➕ Es una convocatoria nueva", BOTON_NUEVA),
        });
      }
      return;
    }
    if (grupo && !albumes.has(grupo)) {
      albumes.set(grupo, destino);
      olvidarAlbum(grupo);
    }

    if (destino.tipo === "existente") {
      const existe = await prisma.convocatoria.findUnique({ where: { id: destino.convocatoriaId }, select: { id: true } });
      if (!existe) {
        await ctx.reply("No encontré esa convocatoria. Responde a la tarjeta que aparece en /pendientes.");
        return;
      }
    }
    encolar(chatId, destino, nombreDe(ctx), [archivo]);
  }

  bot.command("nueva", async (ctx) => {
    modoNueva.poner(ctx.chat.id, true);
    await ctx.reply(TEXTO_NUEVA, {
      parse_mode: "HTML",
      reply_markup: { force_reply: true, input_field_placeholder: "Adjunta el PDF o pega el enlace" },
    });
  });

  // /cancelar también lo atiende la carpeta (que pasa el turno aquí sin responder).
  bot.command("cancelar", async (ctx) => {
    modoNueva.quitar(ctx.chat.id);
    huerfanos.quitar(ctx.chat.id);
    await ctx.reply("Listo, cancelado.");
  });

  bot.callbackQuery(BOTON_NUEVA, async (ctx) => {
    const chatId = ctx.chat?.id;
    const archivos = chatId === undefined ? undefined : huerfanos.leer(chatId);
    if (chatId === undefined || !archivos?.length) {
      await ctx.answerCallbackQuery({ text: "Ya no tengo ese archivo: vuelve a enviarlo con /nueva.", show_alert: true });
      return;
    }
    huerfanos.quitar(chatId);
    await ctx.answerCallbackQuery({ text: "La agrego ➕" });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    encolar(chatId, { tipo: "nueva" }, nombreDe(ctx), archivos, { esperar: false });
  });

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
    await recibir(ctx, archivo);
  });

  // Un enlace (a un PDF o a la página de la convocatoria) se trata igual que un archivo.
  bot.on("message:text", async (ctx, next) => {
    const url = enlaceEn(ctx.message.text);
    if (!url) return next();
    if (!esEnlacePermitido(normalizarEnlace(url))) {
      await ctx.reply("Ese enlace no lo puedo abrir: tiene que ser una dirección pública (http o https).");
      return;
    }
    await recibir(ctx, archivoDeEnlace(url));
  });
}
