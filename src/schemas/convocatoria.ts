import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.js";

/** Cualquier valor JSON válido para una columna `Json` de Prisma (null solo anidado). */
const jsonValue: z.ZodType<Prisma.InputJsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.array(jsonValue.nullable()), z.record(jsonValue.nullable())]),
);

/** Las 10 posiciones del ciclo de vida (ver "05 · Ciclo de vida"). */
export const estadoConvocatoria = z.enum([
  "detectada",
  "pendiente_aprobacion",
  "aprobada",
  "en_postulacion",
  "postulada",
  "ganada",
  "no_ganada",
  "no_apta",
  "descartada",
  "vencida",
]);

export const createConvocatoriaSchema = z.object({
  fuenteId: z.string().uuid(),
  huella: z.string().min(1),
  numeroProceso: z.string().optional(),
  titulo: z.string().min(1),
  entidad: z.string().min(1),
  urlOrigen: z.string().url(),
  resumen: z.string().optional(),
  fechaApertura: z.coerce.date().optional(),
  fechaCierre: z.coerce.date().optional(),
  fechaResultadoEstimada: z.coerce.date().optional(),
  montoMaximo: z.coerce.number().positive().optional(),
  requisitos: jsonValue.optional(),
  analisisIa: jsonValue.optional(),
  // `estado` se maneja a través de POST /convocatorias/:id/transiciones,
  // nunca con un PATCH libre (ver services/convocatorias.ts).
});

export const updateConvocatoriaSchema = createConvocatoriaSchema
  .omit({ fuenteId: true, huella: true })
  .partial();

export type CreateConvocatoriaInput = z.infer<typeof createConvocatoriaSchema>;
export type UpdateConvocatoriaInput = z.infer<typeof updateConvocatoriaSchema>;
