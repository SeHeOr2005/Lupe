/**
 * Genera el borrador de una convocatoria: junta lo que se sabe de ella y de la
 * fundación, le pide a la IA el texto y arma el Word. El gasto de IA queda en
 * `escaneos` para que cuente en el tope diario.
 */
import { prisma } from "../db/prisma.js";
import { NotFoundError } from "../http/errors.js";
import { generarBorrador } from "../ai/borradores.js";
import { quedaCupoIa } from "../ai/presupuesto.js";
import { DATOS_FUNDACION, PERFIL_FUNDACION } from "../config/perfil-fundacion.js";
import { registrarLectura } from "../explorador/aplicar.js";
import { contextoParaBorrador, normalizarCampos, tieneDetalle, type TipoBorrador } from "./contexto.js";
import { crearWord, nombreArchivo } from "./word.js";

export interface BorradorGenerado {
  archivo: Buffer;
  nombreArchivo: string;
  camposPorCompletar: string[];
  /** false si la convocatoria no tenía documentos leídos: el borrador sale más general. */
  conDetalle: boolean;
  tokensUsados: number;
}

export async function generarBorradorDeConvocatoria(convocatoriaId: string, tipo: TipoBorrador): Promise<BorradorGenerado> {
  const c = await prisma.convocatoria.findUnique({
    where: { id: convocatoriaId },
    include: { pasos: { orderBy: { orden: "asc" }, select: { titulo: true, descripcion: true } } },
  });
  if (!c) throw new NotFoundError("convocatoria", convocatoriaId);

  const cupo = await quedaCupoIa();
  if (!cupo.queda) throw new Error(`Se alcanzó el tope diario de IA (${cupo.usados}/${cupo.tope} tokens). Intenta mañana.`);

  const inicioAt = new Date();
  try {
    const contexto = contextoParaBorrador(c, PERFIL_FUNDACION, DATOS_FUNDACION);
    const { borrador, tokensUsados } = await generarBorrador(tipo, contexto);
    const archivo = await crearWord(tipo, borrador, { titulo: c.titulo, entidad: c.entidad, datos: DATOS_FUNDACION });
    await registrarLectura(c.fuenteId, inicioAt, 0, tokensUsados);
    return {
      archivo,
      nombreArchivo: nombreArchivo(tipo, c.titulo),
      camposPorCompletar: normalizarCampos(borrador.camposPorCompletar),
      conDetalle: tieneDetalle(c),
      tokensUsados,
    };
  } catch (err) {
    await registrarLectura(c.fuenteId, inicioAt, 0, 0, err);
    throw err;
  }
}
