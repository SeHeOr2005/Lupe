import { z } from "zod";

export const createPostulacionSchema = z.object({
  convocatoriaId: z.string().uuid(),
  fechaRadicacion: z.coerce.date(),
  numeroRadicado: z.string().optional(),
  notas: z.string().optional(),
});

export const updatePostulacionSchema = createPostulacionSchema.omit({ convocatoriaId: true }).partial();

export type CreatePostulacionInput = z.infer<typeof createPostulacionSchema>;
export type UpdatePostulacionInput = z.infer<typeof updatePostulacionSchema>;
