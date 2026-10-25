/**
 * Elegibilidad: ¿le sirve esta convocatoria a la fundación?
 *   1. Reglas fijas (elegibilidad/reglas.ts): descartan lo seguro, sin costo.
 *   2. IA (ai/gemini.ts#evaluarElegibilidad): compara el resto contra el perfil
 *      (config/perfil-fundacion.ts), en lotes para gastar menos llamadas.
 * Si la IA falla (sin clave, sin cupo, JSON raro), lo que no descartaron las
 * reglas queda "apta": es peor esconder una oportunidad que mostrar una de más.
 *
 * Además marca los convenios que ya tienen organización asignada (no se
 * descartan por eso: la directora quiere verlos si son de su tema).
 */
import { evaluarElegibilidad as evaluarConIa, type VeredictoIa } from "../ai/gemini.js";
import { PERFIL_FUNDACION } from "../config/perfil-fundacion.js";
import { nombreSiEsOrganizacion, type Hallazgo } from "../jobs/hallazgo.js";
import { evaluarReglas } from "./reglas.js";

export interface Elegibilidad {
  apta: boolean;
  razon: string;
  /** Quién decidió: las reglas fijas, la IA, o nadie (la IA falló y se dejó pasar). */
  fuente: "reglas" | "ia" | "sin_evaluar";
  /** Presente si el convenio ya tiene organización; `organizacion` solo si se sabe cuál. */
  asignacion?: { organizacion?: string };
}

const TAMANO_LOTE = 25;

/**
 * ¿Ya está asignado, y a quién? En orden de confianza: el contratista que publica
 * la fuente, el nombre que reconoce la IA, o el título cuando es claramente el
 * nombre de una organización. Si solo SECOP dice "Seleccionado", se sabe que está
 * asignado pero no a quién.
 */
export function detectarAsignacion(h: Hallazgo, ia?: VeredictoIa): Elegibilidad["asignacion"] {
  const organizacion = h.contratista ?? (ia?.asignadoA?.trim() || undefined) ?? nombreSiEsOrganizacion(h.titulo);
  if (organizacion) return { organizacion };
  return h.yaSeleccionado ? {} : undefined;
}

export async function evaluarLote(
  hallazgos: Hallazgo[],
  { usarIa = true }: { usarIa?: boolean } = {},
): Promise<{ resultados: Elegibilidad[]; tokensUsados: number; errorIa?: string }> {
  const resultados: (Elegibilidad | undefined)[] = hallazgos.map((h) => {
    const v = evaluarReglas(h);
    return v.apta === false ? { apta: false, razon: v.razon, fuente: "reglas" } : undefined;
  });

  const pendientes = hallazgos.map((h, i) => ({ h, i })).filter(({ i }) => resultados[i] === undefined);
  let tokensUsados = 0;
  let errorIa: string | undefined = usarIa || pendientes.length === 0 ? undefined : "Se alcanzó MAX_TOKENS_DIA.";

  for (let desde = 0; usarIa && desde < pendientes.length; desde += TAMANO_LOTE) {
    const lote = pendientes.slice(desde, desde + TAMANO_LOTE);
    try {
      const { veredictos, tokensUsados: t } = await evaluarConIa(
        lote.map(({ h, i }) => ({
          indice: i,
          titulo: h.titulo,
          entidad: h.entidad,
          resumen: h.resumen,
          yaSeleccionado: h.yaSeleccionado,
        })),
        PERFIL_FUNDACION,
      );
      tokensUsados += t;
      for (const v of veredictos) {
        const item = lote.find(({ i }) => i === v.indice);
        if (!item) continue;
        resultados[v.indice] = {
          apta: v.apta,
          razon: v.razon,
          fuente: "ia",
          asignacion: detectarAsignacion(item.h, v),
        };
      }
    } catch (err) {
      errorIa = err instanceof Error ? err.message : String(err);
      break; // si falla un lote, los siguientes casi seguro también (clave, cupo): no insistir
    }
  }

  return {
    resultados: resultados.map(
      (r, i) =>
        r ?? {
          apta: true,
          razon: "No se pudo evaluar con IA; se deja pasar para revisión.",
          fuente: "sin_evaluar",
          asignacion: detectarAsignacion(hallazgos[i]!),
        },
    ),
    tokensUsados,
    errorIa,
  };
}

/** Lo que se guarda en analisis_ia.elegibilidad (JSON plano, sin claves undefined). */
export function elegibilidadComoJson(e: Elegibilidad) {
  return {
    apta: e.apta,
    razon: e.razon,
    fuente: e.fuente,
    ...(e.asignacion ? { asignacion: e.asignacion.organizacion ? { organizacion: e.asignacion.organizacion } : {} } : {}),
  };
}
