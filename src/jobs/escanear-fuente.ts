/**
 * "Pipeline de un escaneo" (ver doc "03 · Agentes de búsqueda"): disparo →
 * descarga y huella de contenido → extracción estructurada → deduplicación →
 * aviso. La verificación de citas y la elegibilidad contra el perfil de la
 * fundación quedan marcadas como TODO: hoy se guardan las citas que trae el
 * modelo, pero no se comparan carácter a carácter contra la página (ver
 * README § Pendiente).
 */
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { fetchHtml, fetchJsonApi } from "../scraping/fetchers.js";
import { mapearRespuestaSecop } from "../scraping/secop.js";
import { evaluarPaginaUnica } from "../ai/gemini.js";
import { transicionarConvocatoria } from "../services/convocatorias.js";
import { calcularHuella, type Hallazgo } from "./hallazgo.js";
import { elegibilidadComoJson, evaluarLote, type Elegibilidad } from "../elegibilidad/evaluar.js";

/** Lo que devuelve cada modo de escaneo cuando hubo contenido nuevo. */
interface Extraccion {
  hallazgos: Hallazgo[];
  tokensUsados: number;
}

export interface ResultadoEscaneo {
  estado: "ok" | "sin_cambios" | "error";
  paginasVisitadas: number;
  convocatoriasNuevas: number;
  tokensUsados: number;
  error?: string;
}

/**
 * Escanea una fuente (modo pagina_unica o api) y registra lo que encuentre.
 * Siempre deja una fila en `escaneos`, pase lo que pase, para la bitácora.
 */
export async function escanearFuente(fuenteId: string): Promise<ResultadoEscaneo> {
  const inicioAt = new Date();
  const fuente = await prisma.fuente.findUniqueOrThrow({ where: { id: fuenteId } });

  try {
    if (fuente.modo === "exploracion") {
      // Agente explorador multi-página: fase 5 del plan, aún no implementada.
      throw new Error('modo "exploracion" todavía no está implementado (ver README § Pendiente).');
    }

    const extraccion: Extraccion | typeof SIN_CAMBIOS =
      fuente.modo === "api"
        ? await escanearComoApi(fuente.urlBase)
        : await escanearComoPaginaUnica(fuenteId, fuente.urlBase, fuente.nombre, fuente.hashContenido);

    if (extraccion === SIN_CAMBIOS) {
      await registrarEscaneo({
        fuenteId,
        inicioAt,
        estado: "sin_cambios",
        paginasVisitadas: 1,
        convocatoriasNuevas: 0,
        tokensUsados: 0,
      });
      await prisma.fuente.update({ where: { id: fuenteId }, data: { ultimoEscaneoAt: new Date() } });
      return { estado: "sin_cambios", paginasVisitadas: 1, convocatoriasNuevas: 0, tokensUsados: 0 };
    }

    const nuevos = await soloNuevos(extraccion.hallazgos);
    // La elegibilidad usa IA solo si queda cupo del día; si no, pasa lo que no
    // descartaron las reglas (ver elegibilidad/evaluar.ts).
    const usarIa = (await tokensUsadosHoy()) + extraccion.tokensUsados < env.MAX_TOKENS_DIA;
    const elegibilidad = await evaluarLote(
      nuevos.map((n) => n.hallazgo),
      { usarIa },
    );
    if (elegibilidad.errorIa) console.warn(`[escaneo] elegibilidad sin IA para "${fuente.nombre}": ${elegibilidad.errorIa}`);

    for (const [i, nuevo] of nuevos.entries()) {
      await registrarHallazgo(fuenteId, nuevo, elegibilidad.resultados[i]!);
    }
    const nuevas = nuevos.length;

    await prisma.fuente.update({
      where: { id: fuenteId },
      data: { ultimoEscaneoAt: new Date() },
    });

    const resultado: ResultadoEscaneo = {
      estado: "ok",
      paginasVisitadas: 1,
      convocatoriasNuevas: nuevas,
      tokensUsados: extraccion.tokensUsados + elegibilidad.tokensUsados,
    };
    await registrarEscaneo({ fuenteId, inicioAt, ...resultado });
    return resultado;
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    await registrarEscaneo({
      fuenteId,
      inicioAt,
      estado: "error",
      paginasVisitadas: 0,
      convocatoriasNuevas: 0,
      tokensUsados: 0,
      error: mensaje,
    });
    return { estado: "error", paginasVisitadas: 0, convocatoriasNuevas: 0, tokensUsados: 0, error: mensaje };
  }
}

const SIN_CAMBIOS = Symbol("sin_cambios");

async function escanearComoPaginaUnica(
  fuenteId: string,
  url: string,
  nombreFuente: string,
  hashAnterior: string | null,
): Promise<Extraccion | typeof SIN_CAMBIOS> {
  const { texto, hash } = await fetchHtml(url);
  if (hashAnterior && hash === hashAnterior) return SIN_CAMBIOS;

  // Se revisa justo antes de gastar IA, no antes de descargar: si la página no
  // cambió, el escaneo sigue sirviendo aunque ya no quede cupo.
  const usadosHoy = await tokensUsadosHoy();
  if (usadosHoy >= env.MAX_TOKENS_DIA) {
    throw new Error(`Se alcanzó MAX_TOKENS_DIA (${usadosHoy}/${env.MAX_TOKENS_DIA}); se reintenta mañana.`);
  }

  const { candidatos, tokensUsados } = await evaluarPaginaUnica(texto, nombreFuente);
  await prisma.fuente.update({ where: { id: fuenteId }, data: { hashContenido: hash } });
  return { hallazgos: candidatos, tokensUsados };
}

/** Suma de tokens de IA gastados desde la medianoche (hora de TZ, America/Bogota). */
async function tokensUsadosHoy(): Promise<number> {
  const inicioDelDia = new Date();
  inicioDelDia.setHours(0, 0, 0, 0);
  const { _sum } = await prisma.escaneo.aggregate({
    where: { inicioAt: { gte: inicioDelDia } },
    _sum: { tokensUsados: true },
  });
  return _sum.tokensUsados ?? 0;
}

/** Datos abiertos (SECOP II): ya viene estructurado, no gasta IA. Ver scraping/secop.ts. */
async function escanearComoApi(url: string): Promise<Extraccion> {
  const { data } = await fetchJsonApi(url);
  return { hallazgos: mapearRespuestaSecop(data), tokensUsados: 0 };
}

/**
 * Deduplicación: deja solo los hallazgos cuya huella no está en la base (ni
 * repetida dentro del mismo escaneo). Va antes de la elegibilidad para no gastar
 * IA en convocatorias que ya teníamos.
 */
async function soloNuevos(hallazgos: Hallazgo[]): Promise<{ hallazgo: Hallazgo; huella: string }[]> {
  const conHuella = hallazgos.map((hallazgo) => ({ hallazgo, huella: calcularHuella(hallazgo) }));
  const existentes = await prisma.convocatoria.findMany({
    where: { huella: { in: conHuella.map((h) => h.huella) } },
    select: { huella: true },
  });
  const vistas = new Set(existentes.map((e) => e.huella));
  return conHuella.filter(({ huella }) => (vistas.has(huella) ? false : (vistas.add(huella), true)));
}

/**
 * Crea la convocatoria. Si le sirve a la fundación pasa a pendiente_aprobacion
 * (y de ahí al bot); si no, nace no_apta con la razón y no le llega a nadie.
 */
async function registrarHallazgo(
  fuenteId: string,
  { hallazgo: candidato, huella }: { hallazgo: Hallazgo; huella: string },
  elegibilidad: Elegibilidad,
): Promise<void> {
  const elegibilidadJson = elegibilidadComoJson(elegibilidad);

  const convocatoria = await prisma.convocatoria.create({
    data: {
      fuenteId,
      huella,
      titulo: candidato.titulo,
      entidad: candidato.entidad,
      numeroProceso: candidato.numeroProceso,
      // En modo api viene de la fuente; en pagina_unica se completa en la fase "explorador".
      urlOrigen: candidato.urlOrigen ?? "",
      resumen: candidato.resumen,
      fechaApertura: candidato.fechaApertura ? new Date(candidato.fechaApertura) : undefined,
      fechaCierre: candidato.fechaCierre ? new Date(candidato.fechaCierre) : undefined,
      montoMaximo: candidato.montoMaximo,
      requisitos: candidato.requisitos ?? undefined,
      analisisIa: {
        citaFechaCierre: candidato.citaFechaCierre,
        citaMonto: candidato.citaMonto,
        verificado: false, // TODO: verificación de citas (doc 03 · pipeline, paso 4)
        elegibilidad: elegibilidadJson,
        // Lo que dijo la fuente sobre la asignación, para poder re-evaluar sin volver a consultarla.
        ...(candidato.yaSeleccionado !== undefined
          ? { fuente: { yaSeleccionado: candidato.yaSeleccionado, ...(candidato.contratista ? { contratista: candidato.contratista } : {}) } }
          : {}),
      },
      // "(nueva) → no_apta" es una entrada válida de la tabla de transiciones; se deja
      // el evento a mano porque no es un cambio de estado sino el estado inicial.
      ...(elegibilidad.apta
        ? { estado: "detectada" as const }
        : {
            estado: "no_apta" as const,
            eventos: { create: { estadoNuevo: "no_apta", origen: "sistema", nota: `No encaja: ${elegibilidad.razon}` } },
          }),
    },
  });

  if (!elegibilidad.apta) return;

  // Paso 6-7 del pipeline: detectada → pendiente_aprobacion, y de ahí la ve la
  // directora en el bot (/pendientes).
  await transicionarConvocatoria(convocatoria.id, "pendiente_aprobacion", {
    origen: "sistema",
    nota: `Detectada y apta: ${elegibilidad.razon}`,
  });
}

interface RegistrarEscaneoInput extends ResultadoEscaneo {
  fuenteId: string;
  inicioAt: Date;
}

async function registrarEscaneo(input: RegistrarEscaneoInput) {
  await prisma.escaneo.create({
    data: {
      fuenteId: input.fuenteId,
      inicioAt: input.inicioAt,
      finAt: new Date(),
      estado: input.estado,
      paginasVisitadas: input.paginasVisitadas,
      convocatoriasNuevas: input.convocatoriasNuevas,
      tokensUsados: input.tokensUsados,
      error: input.error,
    },
  });
}
