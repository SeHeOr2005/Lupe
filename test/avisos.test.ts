import { describe, expect, it } from "vitest";
import {
  horaDelCron,
  Suscripciones,
  textoEstadoAvisos,
  textoResumenDiario,
  ultimaOcurrencia,
  ventanaPendiente,
} from "../src/bot/avisosFormato.js";

const TZ = "America/Bogota";
const CRON = "30 7 * * *"; // 7:30 a. m. en Colombia = 12:30 UTC

describe("hora del resumen diario", () => {
  it("la última ocurrencia es hoy a las 7:30 si ya pasó, o ayer si todavía no", () => {
    expect(ultimaOcurrencia(CRON, new Date("2026-11-05T15:00:00Z"), TZ).toISOString()).toBe("2026-11-05T12:30:00.000Z");
    expect(ultimaOcurrencia(CRON, new Date("2026-11-05T11:00:00Z"), TZ).toISOString()).toBe("2026-11-04T12:30:00.000Z");
  });

  it("justo a la hora en punto cuenta como la de hoy", () => {
    expect(ultimaOcurrencia(CRON, new Date("2026-11-05T12:30:00Z"), TZ).toISOString()).toBe("2026-11-05T12:30:00.000Z");
  });

  it("no hay nada que enviar hasta que llegue la siguiente hora", () => {
    const ultimoEnvio = new Date("2026-11-05T12:30:00Z");
    expect(ventanaPendiente(CRON, ultimoEnvio, new Date("2026-11-05T20:00:00Z"), TZ)).toBeUndefined();
  });

  it("al día siguiente, la ventana va del envío anterior a este (sin repetir ni saltar)", () => {
    const ultimoEnvio = new Date("2026-11-05T12:30:00Z");
    expect(ventanaPendiente(CRON, ultimoEnvio, new Date("2026-11-06T12:31:00Z"), TZ)).toEqual({
      desde: new Date("2026-11-05T12:30:00Z"),
      hasta: new Date("2026-11-06T12:30:00Z"),
    });
  });

  it("se lee como hora en español", () => {
    expect(horaDelCron("30 7 * * *")).toBe("7:30 a. m.");
    expect(horaDelCron("0 18 * * *")).toBe("6:00 p. m.");
    expect(horaDelCron("0 12 * * 1-5")).toBe("«0 12 * * 1-5»");
  });
});

describe("quién recibe los avisos", () => {
  it("empieza con los de la configuración y cada quien lo cambia", () => {
    const s = new Suscripciones([111]);
    expect(s.estaActivo(111)).toBe(true);
    s.desactivar(111);
    s.activar(222);
    expect(s.lista()).toEqual([222]);
  });
});

describe("texto del resumen", () => {
  it("si no hay nada nuevo, no se manda nada", () => {
    expect(textoResumenDiario([])).toBeUndefined();
  });

  it("cuenta las abiertas y las de referencia, y pone primero las abiertas", () => {
    const t = textoResumenDiario([
      { titulo: "Convenio directo de educación", entidad: "MUNICIPIO DE MANIZALES", tipo: "referencia" },
      { titulo: "Atención a niños con discapacidad", entidad: "GOBERNACION DE CALDAS", tipo: "abierta" },
    ])!;
    expect(t).toContain("Llegaron <b>2</b> convocatorias nuevas que encajan");
    expect(t).toContain("🟢 1 abierta a propuestas");
    expect(t).toContain("🔒 1 ya asignada o de convenio directo");
    expect(t.indexOf("Atención a niños")).toBeLessThan(t.indexOf("Convenio directo de educación"));
  });

  it("lista hasta 5 y dice cuántas más hay", () => {
    const muchas = Array.from({ length: 7 }, (_, i) => ({ titulo: `Convocatoria ${i}`, entidad: "X" }));
    const t = textoResumenDiario(muchas)!;
    expect(t).toContain("… y 2 más.");
    expect(t).not.toContain("Convocatoria 5");
  });

  it("escapa el HTML de los títulos", () => {
    expect(textoResumenDiario([{ titulo: "Niños <3 & familias", entidad: "X" }])).toContain("Niños &lt;3 &amp; familias");
  });

  it("explica el estado de los avisos", () => {
    expect(textoEstadoAvisos(true, "7:30 a. m.")).toContain("Todos los días a las 7:30 a. m.");
    expect(textoEstadoAvisos(false, "7:30 a. m.")).toContain("desactivados");
  });
});
