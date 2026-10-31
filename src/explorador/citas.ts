/**
 * Verificación de citas: el modelo dice de dónde sacó un dato (la cita textual)
 * y aquí se comprueba que esa cita aparece de verdad en el PDF. Así un dato
 * inventado no pasa como cierto. Las capturas de pantalla no se pueden
 * verificar así (no hay texto que extraer): sus datos quedan "sin verificar".
 */
import { extractText, getDocumentProxy } from "unpdf";

/** Minúsculas, sin tildes, sin puntuación y con un solo espacio: así comparan igual el PDF y la cita. */
export function normalizarParaCita(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * ¿Aparece la cita en el texto? Los PDF a veces parten palabras o meten saltos
 * raros; por eso, si la cita completa no está, se acepta que aparezca su tramo
 * central (lo que suele tener la fecha), siempre que sea lo bastante largo para
 * no dar falsos positivos.
 */
export function citaAparece(cita: string | undefined, textoNormalizado: string): boolean {
  if (!cita) return false;
  const c = normalizarParaCita(cita);
  if (c.length < 8) return false; // demasiado corta para probar algo
  if (textoNormalizado.includes(c)) return true;
  if (c.length >= 40) {
    const tramo = c.slice(Math.floor(c.length * 0.2), Math.ceil(c.length * 0.8));
    return textoNormalizado.includes(tramo);
  }
  return false;
}

/** Texto plano de un PDF (todas las páginas), ya normalizado para comparar citas. */
export async function textoNormalizadoDePdf(datos: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(datos));
  const { text } = await extractText(pdf, { mergePages: true });
  return normalizarParaCita(text);
}
