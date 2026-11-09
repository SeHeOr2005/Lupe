import { describe, expect, it } from "vitest";
import { enlaceEn, esEnlacePermitido, normalizarEnlace } from "../src/explorador/enlace.js";
import { claveArchivo } from "../src/explorador/aplicar.js";
import { TEXTO_NUEVA, TEXTO_SIN_CONVOCATORIA } from "../src/bot/formato.js";

describe("enlaces que manda la directora", () => {
  it("encuentra el enlace dentro del mensaje, sin la puntuación que lo rodea", () => {
    expect(enlaceEn("Mira esta: https://fundacion.org/convocatoria-2026.")).toBe("https://fundacion.org/convocatoria-2026");
    expect(enlaceEn("(https://ejemplo.com/a.pdf)")).toBe("https://ejemplo.com/a.pdf");
    expect(enlaceEn("hola, ¿cómo vas?")).toBeUndefined();
  });

  it("convierte los enlaces de compartir de Google Drive en descarga directa", () => {
    expect(normalizarEnlace("https://drive.google.com/file/d/1AbC_dE-f/view?usp=sharing")).toBe(
      "https://drive.google.com/uc?export=download&id=1AbC_dE-f",
    );
    expect(normalizarEnlace("https://drive.google.com/open?id=XYZ123")).toBe("https://drive.google.com/uc?export=download&id=XYZ123");
    expect(normalizarEnlace("https://icbf.gov.co/convocatoria")).toBe("https://icbf.gov.co/convocatoria");
  });
});

describe("seguridad: solo direcciones públicas", () => {
  it("acepta páginas públicas http y https", () => {
    expect(esEnlacePermitido("https://www.icbf.gov.co/convocatorias")).toBe(true);
    expect(esEnlacePermitido("http://fundacion.org/bases.pdf")).toBe(true);
  });

  it("rechaza el servidor mismo y las redes internas", () => {
    for (const url of [
      "http://localhost:3000/convocatorias",
      "http://127.0.0.1/admin",
      "http://10.0.0.5/",
      "http://192.168.1.10/",
      "http://172.20.0.1/",
      "http://169.254.169.254/latest/meta-data/", // metadatos de la nube
      "http://[::1]/",
      "http://metadata.google.internal/",
      "http://servidor.local/",
    ]) {
      expect(esEnlacePermitido(url), url).toBe(false);
    }
  });

  it("rechaza otros protocolos y textos que no son URL", () => {
    expect(esEnlacePermitido("file:///etc/passwd")).toBe(false);
    expect(esEnlacePermitido("ftp://ejemplo.com/a.pdf")).toBe(false);
    expect(esEnlacePermitido("no es un enlace")).toBe(false);
  });
});

describe("archivos de una convocatoria", () => {
  it("identifica cada archivo por su id de Telegram o por su enlace, para no leerlo dos veces", () => {
    expect(claveArchivo({ nombre: "a.pdf", mimeType: "application/pdf", telegramFileUniqueId: "AQAD", tamano: 1 })).toBe("AQAD");
    expect(claveArchivo({ nombre: "x", mimeType: "enlace", url: "https://a.org/b", tamano: 0 })).toBe("https://a.org/b");
  });
});

describe("textos del bot", () => {
  it("/nueva explica qué se puede enviar", () => {
    expect(TEXTO_NUEVA).toContain("PDF");
    expect(TEXTO_NUEVA).toContain("captura");
    expect(TEXTO_NUEVA).toContain("enlace");
  });

  it("un archivo sin contexto ofrece agregarlo como convocatoria nueva", () => {
    expect(TEXTO_SIN_CONVOCATORIA).toContain("convocatoria nueva");
  });
});
