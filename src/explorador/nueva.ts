/**
 * Convocatorias que la directora agrega desde el bot: le llegó una por correo o
 * WhatsApp (de una fundación empresarial, el ICBF, cooperación...) y le manda a
 * Lupe el PDF, una captura o el enlace. Una sola lectura con IA sirve para
 * identificar la convocatoria (título, entidad) y para armar su paso a paso.
 *
 * Quedan en pendientes de aprobación, bajo una fuente fija y desactivada
 * ("Agregadas desde Telegram"): el scheduler no la escanea y la re-evaluación
 * por perfil no las toca, porque las escogió una persona.
 */
import { prisma } from "../db/prisma.js";
import { leerDocumentos, type ArchivoParaLeer } from "../ai/explorador.js";
import { quedaCupoIa } from "../ai/presupuesto.js";
import { calcularHuella } from "../jobs/hallazgo.js";
import { transicionarConvocatoria } from "../services/convocatorias.js";
import { explorarConvocatoria, registrarLectura, type ArchivoGuardado, type ResultadoExploracion } from "./aplicar.js";

export const FUENTE_MANUAL = "Agregadas desde Telegram";

/** La fuente de las convocatorias agregadas a mano (se crea la primera vez). */
export async function fuenteManual() {
  const existente = await prisma.fuente.findFirst({ where: { nombre: FUENTE_MANUAL } });
  if (existente) return existente;
  return prisma.fuente.create({
    data: {
      nombre: FUENTE_MANUAL,
      urlBase: "https://t.me",
      modo: "pagina_unica",
      dominiosPermitidos: [],
      maxPaginas: 1,
      cron: "0 0 1 1 *", // no importa: la fuente está desactivada
      activa: false,
    },
  });
}

export type ResultadoNueva =
  | { tipo: "creada"; convocatoriaId: string; exploracion: ResultadoExploracion }
  | { tipo: "duplicada"; convocatoriaId: string; titulo: string };

export async function crearConvocatoriaDesdeDocumentos(
  archivos: (ArchivoParaLeer & { meta: ArchivoGuardado })[],
  autor: string,
): Promise<ResultadoNueva> {
  const cupo = await quedaCupoIa();
  if (!cupo.queda) throw new Error(`Se alcanzó el tope diario de IA (${cupo.usados}/${cupo.tope} tokens). Intenta mañana.`);

  const fuente = await fuenteManual();
  const inicioAt = new Date();
  const lectura = await leerDocumentos(archivos).catch(async (err) => {
    await registrarLectura(fuente.id, inicioAt, archivos.length, 0, err);
    throw err;
  });

  const titulo = lectura.extraccion.titulo?.trim();
  if (!titulo) {
    await registrarLectura(fuente.id, inicioAt, archivos.length, lectura.tokensUsados);
    throw new Error("No encontré una convocatoria en lo que me mandaste. Envíame el documento o la página donde se publica.");
  }
  const entidad = lectura.extraccion.entidad?.trim() || "Entidad sin identificar";

  // Misma huella que el escaneo (entidad + título + cierre): si ya la tenía, no se duplica.
  const huella = calcularHuella({ titulo, entidad, fechaCierre: lectura.extraccion.fechaCierre });
  const existente = await prisma.convocatoria.findUnique({ where: { huella }, select: { id: true, titulo: true } });
  if (existente) {
    await registrarLectura(fuente.id, inicioAt, archivos.length, lectura.tokensUsados);
    return { tipo: "duplicada", convocatoriaId: existente.id, titulo: existente.titulo };
  }

  const enlace = archivos.find((a) => a.meta.url)?.meta.url;
  const convocatoria = await prisma.convocatoria.create({
    data: {
      fuenteId: fuente.id,
      huella,
      titulo,
      entidad,
      urlOrigen: enlace ?? "",
      ...(lectura.extraccion.resumen ? { resumen: lectura.extraccion.resumen } : {}),
      analisisIa: { origen: { tipo: "manual", agregadaPor: autor } },
      estado: "detectada",
    },
  });
  await transicionarConvocatoria(convocatoria.id, "pendiente_aprobacion", {
    origen: "usuaria",
    nota: `Agregada desde Telegram por ${autor}.`,
  });

  // Con la misma lectura: fecha de cierre, pasos, documentos exigidos y requisitos.
  const exploracion = await explorarConvocatoria(convocatoria.id, archivos, lectura);
  return { tipo: "creada", convocatoriaId: convocatoria.id, exploracion };
}
