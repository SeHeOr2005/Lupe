/**
 * Descarga una convocatoria a partir de un enlace que manda la directora: un
 * PDF, una imagen o la página web de la convocatoria (de esa se toma el texto).
 *
 * El bot está abierto a quien lo pruebe, así que solo se aceptan direcciones
 * públicas (http/https, nada de localhost ni redes internas): Lupe no debe servir
 * para hacer peticiones a servicios internos del servidor.
 */
import { isIP } from "node:net";
import { textoLimpioDeHtml } from "../scraping/fetchers.js";
import type { ArchivoParaLeer } from "../ai/explorador.js";

const MAX_BYTES = 18 * 1024 * 1024; // lo que cabe en una lectura de Gemini
const UA = "LupeBot/1.0 (convocatorias para fundaciones de Manizales)";

/** Primer enlace http(s) de un texto, si lo hay. */
export function enlaceEn(texto: string | undefined): string | undefined {
  return /https?:\/\/[^\s<>"']+/i.exec(texto ?? "")?.[0]?.replace(/[).,;]+$/, "");
}

/** Los enlaces de "compartir" de Google Drive llevan a un visor; este es el de descarga directa. */
export function normalizarEnlace(url: string): string {
  const drive = /drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/.exec(url);
  return drive ? `https://drive.google.com/uc?export=download&id=${drive[1]}` : url;
}

const HOST_PRIVADO = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

function ipPrivada(ip: string): boolean {
  if (isIP(ip) === 6) return /^(::1?|f[cd][0-9a-f]{2}:|fe80:)/i.test(ip);
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** ¿Es una dirección pública a la que Lupe puede ir? */
export function esEnlacePermitido(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (HOST_PRIVADO.test(host)) return false;
  if (isIP(host) && ipPrivada(host)) return false;
  return true;
}

/** Descarga el enlace y lo deja listo para el explorador. */
export async function descargarEnlace(url: string): Promise<ArchivoParaLeer> {
  const destino = normalizarEnlace(url);
  if (!esEnlacePermitido(destino)) throw new Error("Ese enlace no es una dirección pública válida (http o https).");

  const res = await fetch(destino, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`La página respondió ${res.status}: revisa que el enlace abra sin iniciar sesión.`);
  if (!esEnlacePermitido(res.url)) throw new Error("El enlace redirige a una dirección no permitida.");

  const tamano = Number(res.headers.get("content-length") ?? 0);
  if (tamano > MAX_BYTES) throw new Error("El archivo del enlace pesa más de 18 MB.");

  const tipo = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const nombre = decodeURIComponent(new URL(res.url).pathname.split("/").pop() || new URL(res.url).hostname);
  const datos = Buffer.from(await res.arrayBuffer());
  if (datos.length > MAX_BYTES) throw new Error("El archivo del enlace pesa más de 18 MB.");

  if (tipo === "application/pdf" || datos.subarray(0, 5).toString() === "%PDF-") {
    return { nombre, mimeType: "application/pdf", datos };
  }
  if (/^image\/(jpeg|png|webp)$/.test(tipo)) return { nombre, mimeType: tipo, datos };
  if (tipo.includes("html") || tipo.startsWith("text/")) {
    const texto = tipo.includes("html") ? textoLimpioDeHtml(datos.toString("utf8")) : datos.toString("utf8");
    if (texto.length < 200) throw new Error("La página casi no tiene texto (puede necesitar iniciar sesión o JavaScript). Mándame el PDF.");
    return { nombre: `${new URL(res.url).hostname} (página)`, mimeType: "text/plain", datos: Buffer.from(texto, "utf8") };
  }
  throw new Error(`No sé leer ese tipo de archivo (${tipo || "desconocido"}). Mándame un PDF, una imagen o una página web.`);
}
