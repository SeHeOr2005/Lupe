/**
 * Descarga y limpieza de una fuente (ver doc "03 · Agentes de búsqueda" §
 * "Descarga y huella de contenido"). Por ahora cubre HTML (modo `pagina_unica`
 * / `exploracion`) y JSON de datos abiertos (modo `api`, ej. SECOP II vía
 * datos.gov.co, que casi no necesita IA porque ya viene estructurado).
 *
 * PDF (Playwright) queda para cuando una fuente real lo necesite — se deja el
 * punto de extensión en `extraerTexto` para no bloquear el flujo de hoy.
 */
import * as cheerio from "cheerio";
import { createHash } from "node:crypto";

export interface ContenidoDescargado {
  /** Texto limpio, listo para pasarle al evaluador de IA. */
  texto: string;
  /** sha256 del texto, para detectar "sin_cambios" sin gastar IA. */
  hash: string;
}

const UA = "LupeBot/1.0 (+https://asiscoup.org; convocatorias para fundaciones de Manizales)";

export function hashTexto(texto: string): string {
  return createHash("sha256").update(texto.trim()).digest("hex");
}

/** HTML de una página: baja el markup y se queda solo con el texto visible. */
export async function fetchHtml(url: string): Promise<ContenidoDescargado> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  const html = await res.text();

  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer").remove();
  const texto = $("body").text().replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();

  return { texto, hash: hashTexto(texto) };
}

/** Datos abiertos (ej. datos.gov.co / SECOP II): la respuesta JSON, como texto para la huella. */
export async function fetchJsonApi(url: string): Promise<{ data: unknown; hash: string }> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  const data = (await res.json()) as unknown;
  return { data, hash: hashTexto(JSON.stringify(data)) };
}
