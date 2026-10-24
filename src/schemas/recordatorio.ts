import { z } from "zod";

export const createRecordatorioSchema = z.object({
  convocatoriaId: z.string().uuid(),
  diasAntes: z.number().int().refine((v) => [1, 3, 7].includes(v), {
    message: "diasAntes debe ser 7, 3 o 1 (acordado con Consuelo)",
  }),
});

export const updateRecordatorioSchema = z.object({
  enviadoAt: z.coerce.date().optional(),
});

export type CreateRecordatorioInput = z.infer<typeof createRecordatorioSchema>;
export type UpdateRecordatorioInput = z.infer<typeof updateRecordatorioSchema>;
