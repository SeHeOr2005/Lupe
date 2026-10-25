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

    let nuevas = 0;
    for (const hallazgo of extraccion.hallazgos) {
      const creada = await registrarHallazgo(fuenteId, hallazgo);
      if (creada) nuevas += 1;
    }

    await prisma.fuente.update({
      where: { id: fuenteId },
      data: { ultimoEscaneoAt: new Date() },
    });

    const resultado: ResultadoEscaneo = {
      estado: "ok",
      paginasVisitadas: 1,
      convocatoriasNuevas: nuevas,
      tokensUsados: extraccion.tokensUsados,
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

/** Crea la convocatoria si su huella no existe, y la mueve a pendiente_aprobacion. */
async function registrarHallazgo(fuenteId: string, candidato: Hallazgo): Promise<boolean> {
  const huella = calcularHuella(candidato);

  const existente = await prisma.convocatoria.findUnique({ where: { huella } });
  if (existente) return false; // deduplicación: ya la teníamos, no se duplica

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
      },
      estado: "detectada",
    },
  });

  // Paso 6-7 del pipeline: detectada → pendiente_aprobacion, y de ahí sale el aviso
  // por Telegram (bot: fase 3 del plan, aún no implementada).
  await transicionarConvocatoria(convocatoria.id, "pendiente_aprobacion", {
    origen: "sistema",
    nota: "Detectada por el agente evaluador.",
  });

  return true;
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
