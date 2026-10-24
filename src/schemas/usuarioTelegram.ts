import { z } from "zod";

export const rolUsuario = z.enum(["directora", "equipo"]);

export const createUsuarioTelegramSchema = z.object({
  telegramUserId: z.coerce.bigint(),
  nombre: z.string().min(1),
  rol: rolUsuario,
  activo: z.boolean().default(true),
});

export const updateUsuarioTelegramSchema = createUsuarioTelegramSchema
  .omit({ telegramUserId: true })
  .partial();

export type CreateUsuarioTelegramInput = z.infer<typeof createUsuarioTelegramSchema>;
export type UpdateUsuarioTelegramInput = z.infer<typeof updateUsuarioTelegramSchema>;
