/**
 * Avisos automáticos (fase 2): todos los días, a la hora de AVISOS_CRON, el bot
 * manda un resumen con las convocatorias que llegaron a pendientes de
 * aprobación desde el resumen anterior, a quien tenga los avisos activos.
 *
 *   /avisos  → ver si están activos y prenderlos o apagarlos.
 *   /resumen → el resumen de las últimas 24 horas, ya mismo.
 *
 * Corre en el proceso del bot (main.ts), no en el worker: así solo hay un
 * proceso hablando con Telegram. Lee lo que el worker dejó en la base.
 */
import { InlineKeyboard, type Bot } from "grammy";
import { prisma } from "../db/prisma.js";
import { chatsConAvisos, env } from "../config/env.js";
import { ACCION, asignacionDe, tipoProcesoDe } from "./formato.js";
import {
  horaDelCron,
  Suscripciones,
  textoEstadoAvisos,
  textoResumenDiario,
  ultimaOcurrencia,
  ventanaPendiente,
  type ConvocatoriaDelResumen,
} from "./avisosFormato.js";

const REVISAR_CADA_MS = 60_000;

/** Convocatorias que pasaron a pendientes de aprobación en la ventana y siguen ahí. */
export async function convocatoriasNuevas(desde: Date, hasta: Date): Promise<ConvocatoriaDelResumen[]> {
  const filas = await prisma.convocatoria.findMany({
    where: {
      estado: "pendiente_aprobacion",
      eventos: { some: { estadoNuevo: "pendiente_aprobacion", createdAt: { gte: desde, lt: hasta } } },
    },
    orderBy: [{ fechaApertura: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { titulo: true, entidad: true, analisisIa: true },
  });
  return filas.map((c) => {
    const tipoProceso = tipoProcesoDe(c.analisisIa);
    const referencia = asignacionDe(c.analisisIa) !== undefined || tipoProceso === "directo";
    return {
      titulo: c.titulo,
      entidad: c.entidad,
      ...(referencia ? { tipo: "referencia" as const } : tipoProceso === "competitivo" ? { tipo: "abierta" as const } : {}),
    };
  });
}

const tecladoVerPendientes = () => new InlineKeyboard().text("📋 Ver pendientes", `${ACCION.pendientes}:0`);

export function crearAvisos(bot: Bot) {
  const suscripciones = new Suscripciones(chatsConAvisos());
  const hora = horaDelCron(env.AVISOS_CRON);
  let timer: NodeJS.Timeout | undefined;

  const tecladoAvisos = (activo: boolean) =>
    new InlineKeyboard().text(activo ? "🔕 Desactivar avisos" : "🔔 Activar avisos", activo ? "av:off" : "av:on");

  bot.command("avisos", async (ctx) => {
    const activo = suscripciones.estaActivo(ctx.chat.id);
    await ctx.reply(textoEstadoAvisos(activo, hora), { parse_mode: "HTML", reply_markup: tecladoAvisos(activo) });
  });

  bot.callbackQuery(/^av:(on|off)$/, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return ctx.answerCallbackQuery();
    if (ctx.match[1] === "on") suscripciones.activar(chatId);
    else suscripciones.desactivar(chatId);
    const activo = suscripciones.estaActivo(chatId);
    await ctx.answerCallbackQuery({ text: activo ? "Avisos activados 🔔" : "Avisos desactivados 🔕" });
    await ctx.editMessageText(textoEstadoAvisos(activo, hora), { parse_mode: "HTML", reply_markup: tecladoAvisos(activo) });
  });

  bot.command("resumen", async (ctx) => {
    const hasta = new Date();
    const nuevas = await convocatoriasNuevas(new Date(hasta.getTime() - 24 * 60 * 60 * 1000), hasta);
    const texto = textoResumenDiario(nuevas, { saludo: false });
    await ctx.reply(texto ?? "No llegaron convocatorias nuevas en las últimas 24 horas.", {
      parse_mode: "HTML",
      ...(texto ? { reply_markup: tecladoVerPendientes() } : {}),
    });
  });

  async function enviarResumen(desde: Date, hasta: Date) {
    const destinatarios = suscripciones.lista();
    if (destinatarios.length === 0) return;
    const texto = textoResumenDiario(await convocatoriasNuevas(desde, hasta));
    if (!texto) return; // sin novedades no se escribe: el silencio también es información

    for (const chatId of destinatarios) {
      try {
        await bot.api.sendMessage(chatId, texto, { parse_mode: "HTML", reply_markup: tecladoVerPendientes() });
      } catch (err) {
        // 403: la persona bloqueó el bot o nunca le escribió. Se le quitan los avisos para no insistir.
        if ((err as { error_code?: number }).error_code === 403) suscripciones.desactivar(chatId);
        console.error(`[avisos] no pude mandar el resumen a ${chatId}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  return {
    suscripciones,
    /** Arranca el reloj del resumen diario. El primer envío es en la próxima hora programada, no al arrancar. */
    iniciar() {
      let ultimoEnvio: Date;
      try {
        ultimoEnvio = ultimaOcurrencia(env.AVISOS_CRON, new Date(), env.TZ);
      } catch {
        console.error(`[avisos] AVISOS_CRON inválido ("${env.AVISOS_CRON}"): no se mandarán resúmenes.`);
        return;
      }
      timer = setInterval(() => {
        const ventana = ventanaPendiente(env.AVISOS_CRON, ultimoEnvio, new Date(), env.TZ);
        if (!ventana) return;
        ultimoEnvio = ventana.hasta;
        void enviarResumen(ventana.desde, ventana.hasta).catch((err) =>
          console.error("[avisos] error armando el resumen diario:", err),
        );
      }, REVISAR_CADA_MS);
      console.log(`[avisos] resumen diario a las ${hora} para ${suscripciones.lista().length} chat(s).`);
    },
    detener() {
      if (timer) clearInterval(timer);
    },
  };
}
