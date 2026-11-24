/**
 * Qué hacer con un proceso que quedó guardado más de una vez (mismo número de
 * proceso, distinta huella: pasó cuando SECOP cambió el nombre de la Gobernación).
 * Puro: decide cuál copia se queda y cuáles se pueden borrar sin perder nada.
 */

export interface Copia {
  id: string;
  estado: string;
  createdAt: Date;
  tienePostulacion: boolean;
}

/** Cuánto "pesa" cada estado: lo que decidió la directora nunca se pierde. */
const PESO: Record<string, number> = {
  ganada: 6,
  no_ganada: 6,
  postulada: 5,
  en_postulacion: 4,
  aprobada: 4,
  descartada: 3,
  vencida: 2,
  pendiente_aprobacion: 1,
  detectada: 1,
  no_apta: 0,
};

/** Solo se borran copias que nadie ha tocado: el sistema las clasificó y ya. */
const BORRABLES = new Set(["pendiente_aprobacion", "no_apta", "detectada"]);

export interface PlanDuplicado {
  conservar: Copia;
  borrar: Copia[];
  /** Copias con decisiones propias que no se tocan: hay que mirarlas a mano. */
  revisar: Copia[];
}

export function planDuplicado(copias: Copia[]): PlanDuplicado {
  const ordenadas = [...copias].sort(
    (a, b) =>
      (PESO[b.estado] ?? 0) - (PESO[a.estado] ?? 0) ||
      Number(b.tienePostulacion) - Number(a.tienePostulacion) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const [conservar, ...resto] = ordenadas as [Copia, ...Copia[]];
  return {
    conservar,
    borrar: resto.filter((c) => BORRABLES.has(c.estado) && !c.tienePostulacion),
    revisar: resto.filter((c) => !BORRABLES.has(c.estado) || c.tienePostulacion),
  };
}
