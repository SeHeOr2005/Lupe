import { describe, expect, it } from "vitest";
import { calcularHuella, filtrarNuevos, type Hallazgo } from "../src/jobs/hallazgo.js";
import { planDuplicado, type Copia } from "../src/jobs/duplicados.js";

const proceso: Hallazgo = {
  titulo: "CORPORACION AMPLIAMENTE",
  entidad: "GOBERNACION DE CALDAS",
  numeroProceso: "CO1.REQ.11299150",
};
const conHuella = (h: Hallazgo) => ({ hallazgo: h, huella: calcularHuella(h) });

describe("el escaneo no duplica cuando SECOP cambia el nombre de la entidad", () => {
  it("con el eslogan nuevo la huella cambia, pero el número de proceso no", () => {
    const renombrado = { ...proceso, entidad: "GOBERNACION DE CALDAS - Primero la Gente" };
    expect(calcularHuella(renombrado)).not.toBe(calcularHuella(proceso));
    const existentes = [{ huella: calcularHuella(proceso), numeroProceso: proceso.numeroProceso! }];
    expect(filtrarNuevos([conHuella(renombrado)], existentes)).toEqual([]);
  });

  it("un proceso de verdad nuevo sí pasa", () => {
    const otro = { ...proceso, numeroProceso: "CO1.REQ.99999999" };
    const existentes = [{ huella: calcularHuella(proceso), numeroProceso: proceso.numeroProceso! }];
    expect(filtrarNuevos([conHuella(otro)], existentes)).toHaveLength(1);
  });

  it("tampoco se duplica dentro del mismo escaneo", () => {
    const renombrado = { ...proceso, entidad: "GOBERNACION DE CALDAS - Primero la Gente" };
    expect(filtrarNuevos([conHuella(proceso), conHuella(renombrado)], [])).toHaveLength(1);
  });

  it("sin número de proceso (convocatorias agregadas a mano) sigue mandando la huella", () => {
    const manual = { titulo: "Fondo Semillas", entidad: "Fundación Horizonte Andino" };
    expect(filtrarNuevos([conHuella(manual)], [{ huella: calcularHuella(manual), numeroProceso: null }])).toEqual([]);
    expect(filtrarNuevos([conHuella(manual)], [])).toHaveLength(1);
  });
});

describe("limpieza de copias repetidas", () => {
  const copia = (estado: string, dia: number, tienePostulacion = false): Copia => ({
    id: `${estado}-${dia}`,
    estado,
    createdAt: new Date(Date.UTC(2026, 10, dia)),
    tienePostulacion,
  });

  it("se queda la copia que la directora aprobó y borra la que sigue pendiente", () => {
    const plan = planDuplicado([copia("pendiente_aprobacion", 6), copia("aprobada", 25)]);
    expect(plan.conservar.estado).toBe("aprobada");
    expect(plan.borrar.map((c) => c.estado)).toEqual(["pendiente_aprobacion"]);
  });

  it("si nadie la tocó, prefiere la pendiente y luego la más antigua", () => {
    expect(planDuplicado([copia("no_apta", 1), copia("pendiente_aprobacion", 6)]).conservar.estado).toBe("pendiente_aprobacion");
    expect(planDuplicado([copia("no_apta", 6), copia("no_apta", 1)]).conservar.id).toBe("no_apta-1");
  });

  it("nunca borra una copia con decisiones propias: la deja para revisar", () => {
    const plan = planDuplicado([copia("aprobada", 1), copia("descartada", 6), copia("postulada", 9, true)]);
    expect(plan.conservar.estado).toBe("postulada");
    expect(plan.borrar).toEqual([]);
    expect(plan.revisar.map((c) => c.estado).sort()).toEqual(["aprobada", "descartada"]);
  });
});
