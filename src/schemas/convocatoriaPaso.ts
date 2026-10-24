import { z } from "zod";

export const createConvocatoriaPasoSchema = z.object({
  convocatoriaId: z.string().uuid(),
  orden: z.number().int().min(1),
  titulo: z.string().min(1),
  descripcion: z.string().optional(),
  urlReferencia: z.string().url().optional(),
});

export const updateConvocatoriaPasoSchema = z.object({
  titulo: z.string().min(1).optional(),
  descripcion: z.string().optional(),
  urlReferencia: z.string().url().optional(),
});

export type CreateConvocatoriaPasoInput = z.infer<typeof createConvocatoriaPasoSchema>;
export type UpdateConvocatoriaPasoInput = z.infer<typeof updateConvocatoriaPasoSchema>;
