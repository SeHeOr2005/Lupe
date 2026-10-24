/**
 * "Una sola puerta para cambiar de estado" (ver doc 05 · Ciclo de vida).
 *
 * Todo cambio de `convocatorias.estado` pasa por este archivo, que en una sola
 * transacción: valida que la transición esté permitida, actualiza el estado
 * y escribe la fila correspondiente en `convocatoria_eventos`. Así el estado
 * actual y su historial nunca se desfasan, venga el cambio de la API, del
 * bot o de una tarea programada.
 *
 * v2: ya no se guarda qué persona exacta hizo el cambio (no hay tabla de
 * usuarios); `convocatoria_eventos.origen` solo distingue "sistema" (cron,
 * agente, tarea) de "usuaria" (Consuelo o el equipo, por Telegram).
 */
import { prisma } from "../db/prisma.js";
import { ConflictError, NotFoundError } from "../http/errors.js";
import type { Prisma } from "../../generated/prisma/client.js";

export type EstadoConvocatoria =
  | "detectada"
  | "pendiente_aprobacion"
  | "aprobada"
  | "en_postulacion"
  | "postulada"
  | "ganada"
  | "no_ganada"
  | "no_apta"
  | "descartada"
  | "vencida";

export type OrigenEvento = "sistema" | "usuaria";

/** Tabla "Transiciones permitidas" del documento de diseño (05 · Ciclo de vida). */
const TRANSICIONES_PERMITIDAS: Record<EstadoConvocatoria, EstadoConvocatoria[]> = {
  detectada: ["pendiente_aprobacion"],
  pendiente_aprobacion: ["aprobada", "descartada", "vencida"],
  aprobada: ["en_postulacion", "vencida"],
  en_postulacion: ["postulada", "vencida"],
  postulada: ["ganada", "no_ganada"],
  ganada: [],
  no_ganada: [],
  no_apta: [],
  descartada: [],
  vencida: [],
};

export function transicionesDesde(estado: EstadoConvocatoria): EstadoConvocatoria[] {
  return TRANSICIONES_PERMITIDAS[estado];
}

interface TransicionOptions {
  origen: OrigenEvento;
  nota?: string;
  /** Campos extra a fusionar en el UPDATE de convocatorias (ej. aprobada_at). */
  dataExtra?: Prisma.ConvocatoriaUpdateInput;
}

/**
 * Cambia el estado de una convocatoria validando la tabla de transiciones
 * permitidas y dejando rastro en `convocatoria_eventos`, todo en una transacción.
 */
export async function transicionarConvocatoria(
  convocatoriaId: string,
  nuevoEstado: EstadoConvocatoria,
  opts: TransicionOptions,
) {
  return prisma.$transaction(async (tx) => {
    const actual = await tx.convocatoria.findUnique({ where: { id: convocatoriaId } });
    if (!actual) throw new NotFoundError("convocatoria", convocatoriaId);

    const permitidas = TRANSICIONES_PERMITIDAS[actual.estado as EstadoConvocatoria];
    if (!permitidas.includes(nuevoEstado)) {
      throw new ConflictError(
        `Transición no permitida: "${actual.estado}" → "${nuevoEstado}". ` +
          `Desde "${actual.estado}" solo se permite: ${permitidas.join(", ") || "(ninguna, es un estado final)"}.`,
      );
    }

    const actualizada = await tx.convocatoria.update({
      where: { id: convocatoriaId },
      data: { estado: nuevoEstado, ...opts.dataExtra },
    });

    await tx.convocatoriaEvento.create({
      data: {
        convocatoriaId,
        estadoAnterior: actual.estado,
        estadoNuevo: nuevoEstado,
        origen: opts.origen,
        nota: opts.nota,
      },
    });

    return actualizada;
  });
}

/** Botón "✅ Aprobar": pendiente_aprobacion → aprobada. Solo la directora, desde Telegram. */
export function aprobarConvocatoria(convocatoriaId: string, nota?: string) {
  return transicionarConvocatoria(convocatoriaId, "aprobada", {
    origen: "usuaria",
    nota,
    dataExtra: { aprobadaAt: new Date() },
  });
}

/** Botón "❌ Descartar": pendiente_aprobacion → descartada. Solo la directora. */
export function descartarConvocatoria(convocatoriaId: string, nota?: string) {
  return transicionarConvocatoria(convocatoriaId, "descartada", { origen: "usuaria", nota });
}

/** Tarea diaria: cierra convocatorias cuya fecha_cierre ya pasó. */
export async function marcarVencidas(ahora = new Date()) {
  const candidatas = await prisma.convocatoria.findMany({
    where: {
      estado: { in: ["pendiente_aprobacion", "aprobada", "en_postulacion"] },
      fechaCierre: { lt: ahora },
    },
    select: { id: true },
  });

  const resultados = [];
  for (const { id } of candidatas) {
    resultados.push(
      await transicionarConvocatoria(id, "vencida", {
        origen: "sistema",
        nota: "La fecha_cierre ya pasó.",
      }),
    );
  }
  return resultados;
}

/**
 * Botón "✔ Hecho" sobre un convocatoria_pasos: lo marca completado y, si es el
 * primer paso que se completa estando la convocatoria "aprobada", dispara
 * automáticamente aprobada → en_postulacion (ver tabla de transiciones).
 */
export async function completarPaso(pasoId: string) {
  return prisma.$transaction(async (tx) => {
    const paso = await tx.convocatoriaPaso.findUnique({ where: { id: pasoId } });
    if (!paso) throw new NotFoundError("convocatoria_paso", pasoId);

    const pasoActualizado = await tx.convocatoriaPaso.update({
      where: { id: pasoId },
      data: { completado: true, completadoAt: new Date() },
    });

    const convocatoria = await tx.convocatoria.findUnique({ where: { id: paso.convocatoriaId } });
    if (convocatoria?.estado === "aprobada") {
      const yaHabiaPasosCompletados = await tx.convocatoriaPaso.count({
        where: { convocatoriaId: paso.convocatoriaId, completado: true, id: { not: pasoId } },
      });
      if (yaHabiaPasosCompletados === 0) {
        await tx.convocatoria.update({
          where: { id: paso.convocatoriaId },
          data: { estado: "en_postulacion" },
        });
        await tx.convocatoriaEvento.create({
          data: {
            convocatoriaId: paso.convocatoriaId,
            estadoAnterior: "aprobada",
            estadoNuevo: "en_postulacion",
            origen: "usuaria",
            nota: `Primer paso completado: "${paso.titulo}".`,
          },
        });
      }
    }

    return pasoActualizado;
  });
}

interface RadicarPostulacionInput {
  convocatoriaId: string;
  fechaRadicacion: Date;
  numeroRadicado?: string;
  notas?: string;
}

/**
 * Botón "🎒 Ya radicamos": crea `postulaciones`, abre `resultados` en estado
 * pendiente y mueve la convocatoria en_postulacion → postulada. Una sola
 * transacción, como pide el documento de diseño.
 */
export async function radicarPostulacion(input: RadicarPostulacionInput) {
  return prisma.$transaction(async (tx) => {
    const convocatoria = await tx.convocatoria.findUnique({ where: { id: input.convocatoriaId } });
    if (!convocatoria) throw new NotFoundError("convocatoria", input.convocatoriaId);

    const permitidas = TRANSICIONES_PERMITIDAS[convocatoria.estado as EstadoConvocatoria];
    if (!permitidas.includes("postulada")) {
      throw new ConflictError(
        `No se puede radicar: la convocatoria está en "${convocatoria.estado}", no en "en_postulacion".`,
      );
    }

    const postulacion = await tx.postulacion.create({
      data: {
        convocatoriaId: input.convocatoriaId,
        fechaRadicacion: input.fechaRadicacion,
        numeroRadicado: input.numeroRadicado,
        notas: input.notas,
      },
    });

    const resultado = await tx.resultado.create({
      data: { postulacionId: postulacion.id, estado: "pendiente" },
    });

    await tx.convocatoria.update({
      where: { id: input.convocatoriaId },
      data: { estado: "postulada" },
    });

    await tx.convocatoriaEvento.create({
      data: {
        convocatoriaId: input.convocatoriaId,
        estadoAnterior: convocatoria.estado,
        estadoNuevo: "postulada",
        origen: "usuaria",
        nota: input.numeroRadicado ? `Radicado #${input.numeroRadicado}` : null,
      },
    });

    return { postulacion, resultado };
  });
}

interface RegistrarResultadoInput {
  resultadoId: string;
  estado: "ganada" | "no_ganada";
  observaciones?: string;
  fechaResultado?: Date;
}

/**
 * "/resultado": registra si la postulación fue ganada o no, y mueve la
 * convocatoria postulada → ganada/no_ganada.
 */
export async function registrarResultado(input: RegistrarResultadoInput) {
  return prisma.$transaction(async (tx) => {
    const resultado = await tx.resultado.findUnique({
      where: { id: input.resultadoId },
      include: { postulacion: true },
    });
    if (!resultado) throw new NotFoundError("resultado", input.resultadoId);
    if (resultado.estado !== "pendiente") {
      throw new ConflictError(`Este resultado ya fue registrado como "${resultado.estado}".`);
    }

    const resultadoActualizado = await tx.resultado.update({
      where: { id: input.resultadoId },
      data: {
        estado: input.estado,
        fechaResultado: input.fechaResultado ?? new Date(),
        observaciones: input.observaciones,
      },
    });

    const convocatoriaId = resultado.postulacion.convocatoriaId;
    const convocatoria = await tx.convocatoria.findUniqueOrThrow({ where: { id: convocatoriaId } });

    await tx.convocatoria.update({ where: { id: convocatoriaId }, data: { estado: input.estado } });
    await tx.convocatoriaEvento.create({
      data: {
        convocatoriaId,
        estadoAnterior: convocatoria.estado,
        estadoNuevo: input.estado,
        origen: "usuaria",
        nota: input.observaciones,
      },
    });

    return resultadoActualizado;
  });
}
