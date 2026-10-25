/**
 * Primer filtro de elegibilidad: reglas fijas, sin IA y sin costo. Solo descarta
 * lo que es seguro que no sirve; lo que pase sigue al evaluador de IA, que es el
 * que compara contra el perfil de la fundación.
 */
import { PERFIL_FUNDACION } from "../config/perfil-fundacion.js";
import type { Hallazgo } from "../jobs/hallazgo.js";

export type VeredictoReglas = { apta: false; razon: string } | { apta: "por_evaluar" };

/** Objetos de contrato que nunca son una oportunidad para una fundación. */
const OBJETOS_EXCLUIDOS: { patron: RegExp; razon: string }[] = [
  { patron: /empr[eé]stito|deuda p[uú]blica|pignoraci/i, razon: "Es un préstamo de deuda pública, no una convocatoria." },
  { patron: /compraventa|\bpredio\b|arrendamiento|comodato/i, razon: "Es una compra, venta o arriendo de inmuebles." },
  { patron: /\bobra(s)? (civil|p[uú]blica)|construcci[oó]n de|pavimentaci/i, razon: "Es una obra de infraestructura." },
  { patron: /bomber/i, razon: "Es un convenio con el cuerpo de bomberos." },
  { patron: /^donar\b|^donaci[oó]n (al|a la) (departamento|municipio)/i, razon: "Es una donación hacia la entidad, no desde ella." },
];

// Los convenios ya asignados a otra organización NO se descartan aquí: la directora
// quiere verlos si son de su tema (saber con quién trabaja la entidad). Se marcan como
// "ya asignado a ..." en elegibilidad/evaluar.ts.

export function evaluarReglas(h: Hallazgo): VeredictoReglas {
  if (!PERFIL_FUNDACION.entidadesDelTerritorio.some((p) => p.test(h.entidad))) {
    return { apta: false, razon: `La entidad (${h.entidad}) no es de ${PERFIL_FUNDACION.municipio}.` };
  }

  for (const { patron, razon } of OBJETOS_EXCLUIDOS) {
    if (patron.test(h.titulo)) return { apta: false, razon };
  }

  return { apta: "por_evaluar" };
}
