import { describe, expect, it } from "vitest";
import {
  escaparHtml,
  estaAutorizado,
  formatearMonto,
  leerAccion,
  tarjetaConvocatoria,
  textoPaginacion,
  type ConvocatoriaParaMostrar,
} from "../src/bot/formato.js";

const convocatoria: ConvocatoriaParaMostrar = {
  id: "11111111-2222-3333-4444-555555555555",
  titulo: "AUNAR ESFUERZOS PARA BRINDAR ATENCION INTEGRAL A ADULTOS MAYORES",
  entidad: "MUNICIPIO DE MANIZALES",
  resumen: "Atención integral en vivienda, alimentación y salud.",
  urlOrigen: "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.1&x=1",
  montoMaximo: { toString: () => "84609548.00" }, // así llega un Decimal de Prisma
  fechaApertura: new Date("2026-10-21T00:00:00.000Z"),
  fechaCierre: null,
};

describe("tarjeta de convocatoria", () => {
  const tarjeta = tarjetaConvocatoria(convocatoria);

  it("muestra lo necesario para decidir", () => {
    expect(tarjeta).toContain("<b>AUNAR ESFUERZOS");
    expect(tarjeta).toContain("MUNICIPIO DE MANIZALES");
    expect(tarjeta).toContain(formatearMonto(84609548));
    expect(tarjeta).toContain("Atención integral");
    expect(tarjeta).toContain(convocatoria.id);
  });

  it("muestra la fecha sin correrla un día por la zona horaria", () => {
    expect(tarjeta).toMatch(/Publicada: 21/);
  });

  it("avisa cuando no hay fecha de cierre en vez de dejarlo en blanco", () => {
    expect(tarjeta).toContain("Cierre: no publicado");
  });

  it("escapa el & de la URL para que Telegram acepte el HTML", () => {
    expect(tarjeta).toContain("noticeUID=CO1.NTC.1&amp;x=1");
  });

  it("no repite el resumen cuando es igual al título", () => {
    const igual = tarjetaConvocatoria({ ...convocatoria, resumen: convocatoria.titulo });
    expect(igual.split(convocatoria.titulo)).toHaveLength(2);
  });
});

describe("utilidades de formato", () => {
  it("escapa HTML", () => {
    expect(escaparHtml("<b>Tom & Jerry</b>")).toBe("&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;");
  });

  it("no muestra montos vacíos o en cero", () => {
    expect(formatearMonto(null)).toBeUndefined();
    expect(formatearMonto(0)).toBeUndefined();
  });

  it("describe la página de pendientes", () => {
    expect(textoPaginacion(0, 5, 93)).toBe("Mostrando 1–5 de 93 pendientes.");
    expect(textoPaginacion(0, 0, 0)).toContain("No hay convocatorias pendientes");
  });
});

describe("botones", () => {
  it("lee las acciones válidas", () => {
    expect(leerAccion(`aprobar:${convocatoria.id}`)).toEqual({ accion: "aprobar", valor: convocatoria.id });
    expect(leerAccion("pendientes:5")).toEqual({ accion: "pendientes", valor: "5" });
  });

  it("ignora datos desconocidos", () => {
    expect(leerAccion("borrar:todo")).toBeUndefined();
    expect(leerAccion("aprobar:")).toBeUndefined();
  });
});

describe("lista blanca", () => {
  const permitidos = [111n, 222n];

  it("deja pasar solo a los IDs configurados", () => {
    expect(estaAutorizado(111, permitidos)).toBe(true);
    expect(estaAutorizado(333, permitidos)).toBe(false);
  });

  it("rechaza a todos si la lista está vacía o no hay usuario", () => {
    expect(estaAutorizado(111, [])).toBe(false);
    expect(estaAutorizado(undefined, permitidos)).toBe(false);
  });
});
