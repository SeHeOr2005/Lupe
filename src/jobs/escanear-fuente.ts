/**
 * "Pipeline de un escaneo" (ver doc "03 · Agentes de búsqueda"): disparo →
 * descarga y huella de contenido → extracción estructurada → deduplicación →
 * aviso. La verificación de citas y la elegibilidad contra el perfil de la
 * fundación quedan marcadas como TODO: hoy se guardan las citas que trae el
 * modelo, pero no se comparan carácter a carácter contra la página (ver
 * README § Pendiente).
 */
import { createHash } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { fetchHtml, fetchJsonApi } from "../scraping/fetchers.js";
import { evaluarPaginaUnica, type Candidato } from "../ai/gemini.js";
import { transicionarConvocatoria } from "../services/convocatorias.js";

function normalizarTitulo(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "La huella combina entidad, título normalizado y fecha de cierre" (doc 06 · Modelo de datos). */
function calcularHuella(entidad: string, titulo: string, fechaCierre?: string): string {
  const base = `${entidad.toLowerCase().trim()}|${normalizarTitulo(titulo)}|${fechaCierre ?? ""}`;
  return createHash("sha256").update(base).digest("hex");
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

    const candidatos: Candidato[] | typeof SIN_CAMBIOS =
      fuente.modo === "api"
        ? await escanearComoApi(fuente.urlBase)
        : await escanearComoPaginaUnica(fuenteId, fuente.urlBase, fuente.nombre, fuente.hashContenido);

    if (candidatos === SIN_CAMBIOS) {
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
    for (const candidato of candidatos) {
      const creada = await registrarHallazgo(fuenteId, candidato);
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
      tokensUsados: 0,
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
): Promise<Candidato[] | typeof SIN_CAMBIOS> {
  const { texto, hash } = await fetchHtml(url);
  if (hashAnterior && hash === hashAnterior) return SIN_CAMBIOS;

  const { candidatos } = await evaluarPaginaUnica(texto, nombreFuente);
  await prisma.fuente.update({ where: { id: fuenteId }, data: { hashContenido: hash } });
  return candidatos;
}

/** Datos abiertos (SECOP II vía datos.gov.co, etc.): ya viene estructurado, casi sin IA. */
async function escanearComoApi(url: string): Promise<Candidato[]> {
  const { data } = await fetchJsonApi(url);
  if (!Array.isArray(data)) return [];

  // Mapeo best-effort a nuestro shape; cada fuente de datos abiertos tiene sus propias
  // columnas, así que esto se ajusta por fuente cuando se conecte la primera real (SECOP II).
  return data.slice(0, 50).map((row): Candidato => {
    const r = row as Record<string, unknown>;
    return {
      titulo: String(r["nombre_del_procedimiento"] ?? r["titulo"] ?? "Sin título"),
      entidad: String(r["entidad"] ?? r["nombre_entidad"] ?? "Entidad sin identificar"),
      numeroProceso: r["id_del_proceso"] ? String(r["id_del_proceso"]) : undefined,
      fechaCierre: r["fecha_de_fin_del_proceso"] ? String(r["fecha_de_fin_del_proceso"]) : undefined,
    };
  });
}

/** Crea la convocatoria si su huella no existe, y la mueve a pendiente_aprobacion. */
async function registrarHallazgo(fuenteId: string, candidato: Candidato): Promise<boolean> {
  const huella = calcularHuella(candidato.entidad, candidato.titulo, candidato.fechaCierre);

  const existente = await prisma.convocatoria.findUnique({ where: { huella } });
  if (existente) return false; // deduplicación: ya la teníamos, no se duplica

  const convocatoria = await prisma.convocatoria.create({
    data: {
      fuenteId,
      huella,
      titulo: candidato.titulo,
      entidad: candidato.entidad,
      numeroProceso: candidato.numeroProceso,
      urlOrigen: "", // se completa cuando se construye la URL de detalle (fase "explorador")
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
