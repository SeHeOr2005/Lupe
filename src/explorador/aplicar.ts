/**
 * Explorar una convocatoria a partir de sus documentos: leerlos con IA,
 * verificar la fecha de cierre contra el PDF y guardar fecha, pasos,
 * documentos exigidos y requisitos. Lo usa el bot cuando la directora le
 * manda el pliego (y capturas del cronograma) de una convocatoria.
 *
 * Cada vez se leen TODOS los archivos que se han mandado para esa convocatoria
 * (los anteriores se vuelven a descargar de Telegram), así un anexo o una
 * captura que llega después se interpreta junto con el pliego.
 */
import { prisma } from "../db/prisma.js";
import { NotFoundError } from "../http/errors.js";
import { leerDocumentos, validarAplicabilidad, type Aplicabilidad, type ArchivoParaLeer, type ExtraccionDocumentos } from "../ai/explorador.js";
import { quedaCupoIa } from "../ai/presupuesto.js";
import { PERFIL_FUNDACION } from "../config/perfil-fundacion.js";
import { normalizarParaCita, textoNormalizadoDePdf } from "./citas.js";
import { armarPlan, type PlanDeGuardado, type TipoDocumento } from "./plan.js";

/**
 * Lo que se guarda de cada archivo para poder volver a leerlo: o viene de
 * Telegram (su file_id) o de un enlace que mandó la directora (su url).
 */
export interface ArchivoGuardado {
  nombre: string;
  mimeType: string;
  telegramFileId?: string;
  telegramFileUniqueId?: string;
  url?: string;
  tamano: number;
}

/** Identifica un archivo para no leerlo dos veces. */
export const claveArchivo = (a: ArchivoGuardado) => a.telegramFileUniqueId ?? a.url ?? a.nombre;

/** Una lectura con IA ya hecha (para no pagarla dos veces, ver explorador/nueva.ts). */
export interface LecturaPrevia {
  extraccion: ExtraccionDocumentos;
  tokensUsados: number;
}

export interface ResultadoExploracion {
  titulo: string;
  plan: PlanDeGuardado;
  documentos: { tipo: TipoDocumento; descripcion: string; listo: boolean }[];
  archivosLeidos: number;
  tokensUsados: number;
  /** Segunda revisión: ¿encaja con la fundación? Ausente si la IA no pudo hacerla. */
  aplicabilidad?: Aplicabilidad;
}

const comoObjeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Archivos que ya se habían mandado para esta convocatoria (guardados en analisis_ia.exploracion). */
export async function archivosPrevios(convocatoriaId: string): Promise<ArchivoGuardado[]> {
  const c = await prisma.convocatoria.findUnique({ where: { id: convocatoriaId }, select: { analisisIa: true } });
  const archivos = comoObjeto(comoObjeto(c?.analisisIa)["exploracion"])["archivos"];
  return Array.isArray(archivos) ? (archivos as ArchivoGuardado[]) : [];
}

/** Documento vigente de la fundación del mismo tipo (para marcar el exigido como listo). */
async function documentoVigente(tipo: TipoDocumento) {
  if (tipo === "otro") return null; // "otro" es demasiado genérico para emparejarlo solo
  return prisma.documentoFundacion.findFirst({
    where: { tipo, OR: [{ fechaVencimiento: null }, { fechaVencimiento: { gte: new Date() } }] },
    orderBy: { fechaExpedicion: { sort: "desc", nulls: "last" } },
    select: { id: true },
  });
}

/** El texto de los archivos que se puede comparar con las citas: PDF y páginas web (no imágenes). */
async function textoVerificable(archivos: ArchivoParaLeer[]): Promise<string> {
  const textos = await Promise.all(
    archivos.map((a) =>
      a.mimeType === "application/pdf"
        ? textoNormalizadoDePdf(a.datos).catch(() => "")
        : a.mimeType === "text/plain"
          ? normalizarParaCita(a.datos.toString("utf8"))
          : "",
    ),
  );
  return textos.join(" ");
}

export async function explorarConvocatoria(
  convocatoriaId: string,
  archivos: (ArchivoParaLeer & { meta: ArchivoGuardado })[],
  lecturaPrevia?: LecturaPrevia,
): Promise<ResultadoExploracion> {
  const convocatoria = await prisma.convocatoria.findUnique({ where: { id: convocatoriaId } });
  if (!convocatoria) throw new NotFoundError("convocatoria", convocatoriaId);

  if (!lecturaPrevia) {
    const cupo = await quedaCupoIa();
    if (!cupo.queda) throw new Error(`Se alcanzó el tope diario de IA (${cupo.usados}/${cupo.tope} tokens). Intenta mañana.`);
  }

  const inicioAt = new Date();
  let tokensUsados = 0;
  try {
    const { extraccion, tokensUsados: t } =
      lecturaPrevia ?? (await leerDocumentos(archivos, { titulo: convocatoria.titulo, entidad: convocatoria.entidad }));
    tokensUsados = t;

    // Segunda pasada: se vuelven a leer los documentos contra el perfil de la fundación.
    // Si falla (cupo, JSON raro) no se pierde la exploración: solo queda sin veredicto.
    let aplicabilidad: Aplicabilidad | undefined;
    const cupoRestante = await quedaCupoIa();
    if (cupoRestante.queda) {
      try {
        const v = await validarAplicabilidad(
          archivos,
          { titulo: convocatoria.titulo, entidad: convocatoria.entidad },
          PERFIL_FUNDACION,
        );
        aplicabilidad = v.aplicabilidad;
        tokensUsados += v.tokensUsados;
      } catch (err) {
        console.warn("[explorador] no pude validar la aplicabilidad:", err instanceof Error ? err.message : err);
      }
    }

    const textoPdf = await textoVerificable(archivos);
    const plan = armarPlan(extraccion, { textoPdf, hayCapturas: archivos.some((a) => a.mimeType.startsWith("image/")) });

    const vigentes = new Map<TipoDocumento, { id: string } | null>();
    for (const d of plan.documentos) vigentes.set(d.tipo, await documentoVigente(d.tipo));

    const documentos = await prisma.$transaction(async (tx) => {
      // Pasos: se conservan los ya completados; el resto se rehace con lo nuevo.
      const completados = await tx.convocatoriaPaso.findMany({ where: { convocatoriaId, completado: true } });
      await tx.convocatoriaPaso.deleteMany({ where: { convocatoriaId, completado: false } });
      const yaHechos = new Set(completados.map((p) => normalizarParaCita(p.titulo)));
      let orden = Math.max(0, ...completados.map((p) => p.orden));
      for (const paso of plan.pasos) {
        if (yaHechos.has(normalizarParaCita(paso.titulo))) continue;
        await tx.convocatoriaPaso.create({ data: { convocatoriaId, orden: ++orden, ...paso } });
      }

      // Documentos exigidos: se crean o se actualiza su descripción, sin pisar lo que ya esté marcado.
      const resultado: ResultadoExploracion["documentos"] = [];
      for (const d of plan.documentos) {
        const vigente = vigentes.get(d.tipo) ?? null;
        const existente = await tx.convocatoriaDocumento.findUnique({
          where: { convocatoriaId_tipo: { convocatoriaId, tipo: d.tipo } },
        });
        const guardado = existente
          ? await tx.convocatoriaDocumento.update({
              where: { id: existente.id },
              data: {
                descripcion: d.descripcion,
                ...(vigente && !existente.documentoId ? { documentoId: vigente.id, estado: "listo" as const } : {}),
              },
            })
          : await tx.convocatoriaDocumento.create({
              data: {
                convocatoriaId,
                tipo: d.tipo,
                descripcion: d.descripcion,
                estado: vigente ? "listo" : "pendiente",
                documentoId: vigente?.id,
              },
            });
        resultado.push({ tipo: d.tipo, descripcion: d.descripcion, listo: guardado.estado !== "pendiente" });
      }

      await tx.convocatoria.update({
        where: { id: convocatoriaId },
        data: {
          ...(plan.fechaCierre ? { fechaCierre: plan.fechaCierre.fecha } : {}),
          ...(plan.presupuesto && convocatoria.montoMaximo === null ? { montoMaximo: plan.presupuesto } : {}),
          requisitos: plan.requisitos,
          analisisIa: {
            ...comoObjeto(convocatoria.analisisIa),
            exploracion: {
              fecha: new Date().toISOString(),
              archivos: archivos.map((a) => ({ ...a.meta })),
              ...(plan.fechaCierre
                ? {
                    fechaCierre: {
                      valor: plan.fechaCierre.fecha.toISOString(),
                      verificada: plan.fechaCierre.verificada,
                      origen: plan.fechaCierre.origen,
                      ...(plan.fechaCierre.cita ? { cita: plan.fechaCierre.cita } : {}),
                    },
                  }
                : {}),
              ...(extraccion.resumen ? { resumen: extraccion.resumen } : {}),
              ...(aplicabilidad ? { aplicabilidad: { ...aplicabilidad, fecha: new Date().toISOString() } } : {}),
              advertencias: plan.advertencias,
              tokensUsados,
            },
          },
        },
      });
      return resultado;
    });

    await registrarLectura(convocatoria.fuenteId, inicioAt, archivos.length, tokensUsados);
    return { titulo: convocatoria.titulo, plan, documentos, archivosLeidos: archivos.length, tokensUsados, ...(aplicabilidad ? { aplicabilidad } : {}) };
  } catch (err) {
    await registrarLectura(convocatoria.fuenteId, inicioAt, archivos.length, tokensUsados, err);
    throw err;
  }
}

/** La lectura gasta IA: queda en `escaneos` para que cuente en el tope diario (ver ai/presupuesto.ts). */
export async function registrarLectura(fuenteId: string, inicioAt: Date, archivos: number, tokensUsados: number, error?: unknown) {
  await prisma.escaneo.create({
    data: {
      fuenteId,
      inicioAt,
      finAt: new Date(),
      estado: error ? "error" : "ok",
      paginasVisitadas: archivos,
      tokensUsados,
      ...(error ? { error: `Explorador: ${error instanceof Error ? error.message : String(error)}` } : {}),
    },
  });
}
