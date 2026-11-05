/**
 * Punto de entrada del worker: el "trigger" que revisa `fuentes` y escanea,
 * más la tarea diaria de vencimiento. La API (src/main.ts) sigue corriendo
 * aparte; en desarrollo ambos pueden correr juntos (ver doc "02 · Stack").
 */
import { createServer } from "node:http";
import { env } from "./config/env.js";
import { marcarVencidas } from "./services/convocatorias.js";
import { iniciarScheduler, tickFuentes } from "./jobs/scheduler.js";

// Render exige un puerto abierto incluso en web services que no sirven HTTP.
const port = env.PORT ?? 3001;
createServer((_, res) => res.end("ok")).listen(port, () => {
  console.log(`[worker] health check escuchando en :${port}`);
});

async function tickVencimiento() {
  const vencidas = await marcarVencidas();
  if (vencidas.length > 0) {
    console.log(`[worker] ${vencidas.length} convocatoria(s) marcada(s) como vencidas.`);
  }
}

console.log(
  `[worker] Lupe worker arrancando (TZ=${env.TZ}, tick cada ${env.SCHEDULER_TICK_MS}ms). Ctrl+C para salir.`,
);

await tickFuentes();
await tickVencimiento();

const detenerScheduler = iniciarScheduler();
const idVencimiento = setInterval(() => void tickVencimiento(), 60 * 60 * 1000); // cada hora

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    detenerScheduler();
    clearInterval(idVencimiento);
    process.exit(0);
  });
}
