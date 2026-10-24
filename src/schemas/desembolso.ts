import { z } from "zod";

export const estadoDesembolso = z.enum(["programado", "recibido", "retrasado"]);

export const createDesembolsoSchema = z.object({
  adjudicacionId: z.string().uuid(),
  monto: z.coerce.number().positive(),
  fechaEsperada: z.coerce.date().optional(),
  fechaRecibida: z.coerce.date().optional(),
  estado: estadoDesembolso.default("programado"),
  nota: z.string().optional(),
});

export const updateDesembolsoSchema = createDesembolsoSchema.omit({ adjudicacionId: true }).partial();

export type CreateDesembolsoInput = z.infer<typeof createDesembolsoSchema>;
export type UpdateDesembolsoInput = z.infer<typeof updateDesembolsoSchema>;
