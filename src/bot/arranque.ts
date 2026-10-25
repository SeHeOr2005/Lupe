/**
 * Cómo se conecta el bot con Telegram, según el entorno:
 *   - Webhook (producción): si hay PUBLIC_URL y TELEGRAM_WEBHOOK_SECRET, Telegram
 *     le hace POST a la API en RUTA_WEBHOOK, firmado con el secreto.
 *   - Long polling (desarrollo): sin URL pública, el bot le pregunta a Telegram
 *     por mensajes nuevos. No necesita exponer nada a internet.
 * Solo corre dentro del proceso web (main.ts), nunca en el worker: dos procesos
 * haciendo polling con el mismo token se pisan.
 */
import type { FastifyInstance } from "fastify";
import { webhookCallback } from "grammy";
import { env } from "../config/env.js";
import { crearBot, registrarComandos } from "./bot.js";

export const RUTA_WEBHOOK = "/telegram/webhook";

/**
 * Prepara el bot. Hay que llamarlo antes de `app.listen()` (registra la ruta del
 * webhook) y llamar a `arrancar()` después. Devuelve undefined si no hay token.
 */
export function prepararBot(app: FastifyInstance) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    app.log.warn("TELEGRAM_BOT_TOKEN no está configurado: el bot no arranca.");
    return undefined;
  }

  const bot = crearBot(env.TELEGRAM_BOT_TOKEN);
  const usarWebhook = Boolean(env.PUBLIC_URL && env.TELEGRAM_WEBHOOK_SECRET);

  if (usarWebhook) {
    app.post(RUTA_WEBHOOK, webhookCallback(bot, "fastify", { secretToken: env.TELEGRAM_WEBHOOK_SECRET }));
  }

  return {
    bot,
    async arrancar() {
      await registrarComandos(bot);
      if (usarWebhook) {
        const url = `${env.PUBLIC_URL!.replace(/\/$/, "")}${RUTA_WEBHOOK}`;
        await bot.api.setWebhook(url, { secret_token: env.TELEGRAM_WEBHOOK_SECRET });
        app.log.info(`Bot de Telegram en modo webhook: ${url}`);
      } else {
        // Si antes hubo un webhook, Telegram no entrega nada por polling hasta borrarlo.
        await bot.api.deleteWebhook();
        void bot.start({ onStart: (me) => app.log.info(`Bot de Telegram @${me.username} en modo long polling`) });
      }
    },
    async detener() {
      if (!usarWebhook) await bot.stop();
    },
  };
}
