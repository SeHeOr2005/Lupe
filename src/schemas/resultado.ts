import { z } from "zod";

export const estadoResultado = z.enum(["pendiente", "ganada", "no_ganada"]);

export const createResultadoSchema = z.object({
  postulacionId: z.string().uuid(),
  estado: estadoResultado.default("pendiente"),
  fechaResultado: z.coerce.date().optional(),
  observaciones: z.string().optional(),
});

export const updateResultadoSchema = createResultadoSchema.omit({ postulacionId: true }).partial();

export type CreateResultadoInput = z.infer<typeof createResultadoSchema>;
export type UpdateResultadoInput = z.infer<typeof updateResultadoSchema>;
