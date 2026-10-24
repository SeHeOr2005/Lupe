import { z } from "zod";

export const createAdjudicacionSchema = z.object({
  resultadoId: z.string().uuid(),
  montoAdjudicado: z.coerce.number().positive(),
  montoRecibido: z.coerce.number().min(0).default(0),
  moneda: z.string().length(3).default("COP"),
  fechaAdjudicacion: z.coerce.date().optional(),
  entidadOtorgante: z.string().optional(),
  referenciaActo: z.string().optional(),
  observaciones: z.string().optional(),
});

export const updateAdjudicacionSchema = createAdjudicacionSchema.omit({ resultadoId: true }).partial();

export type CreateAdjudicacionInput = z.infer<typeof createAdjudicacionSchema>;
export type UpdateAdjudicacionInput = z.infer<typeof updateAdjudicacionSchema>;
