/** Botones que se usan en más de un módulo del bot. */
import { InlineKeyboard } from "grammy";
import { ACCION } from "./formato.js";

/** ✅ Aprobar / ❌ Descartar de una convocatoria pendiente. */
export function botonesDecision(id: string) {
  return new InlineKeyboard().text("✅ Aprobar", `${ACCION.aprobar}:${id}`).text("❌ Descartar", `${ACCION.descartar}:${id}`);
}
