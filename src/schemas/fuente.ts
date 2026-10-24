import { z } from "zod";

export const modoFuente = z.enum(["api", "pagina_unica", "exploracion"]);

export const createFuenteSchema = z.object({
  nombre: z.string().min(1),
  urlBase: z.string().url(),
  modo: modoFuente,
  dominiosPermitidos: z.array(z.string()).default([]),
  maxPaginas: z.number().int().min(1).max(50).default(10),
  cron: z.string().min(1), // ej. "0 7 * * *"
  activa: z.boolean().default(true),
});

export const updateFuenteSchema = createFuenteSchema.partial();

export type CreateFuenteInput = z.infer<typeof createFuenteSchema>;
export type UpdateFuenteInput = z.infer<typeof updateFuenteSchema>;
