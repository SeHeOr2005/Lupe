import { env } from "./config/env.js";
import { buildServer } from "./http/server.js";
import { prepararBot } from "./bot/arranque.js";

const app = buildServer();
const bot = prepararBot(app);

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then(async (address) => {
    app.log.info(`Lupe backend (web) escuchando en ${address}`);
    await bot?.arrancar();
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await bot?.detener();
    await app.close();
    process.exit(0);
  });
}
