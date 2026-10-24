import { z } from "zod";
import { tipoDocumento } from "./documentoFundacion.js";

export const estadoDocumentoConvocatoria = z.enum(["pendiente", "listo", "no_aplica"]);

export const createConvocatoriaDocumentoSchema = z.object({
  convocatoriaId: z.string().uuid(),
  tipo: tipoDocumento,
  descripcion: z.string().optional(),
  estado: estadoDocumentoConvocatoria.default("pendiente"),
  documentoId: z.string().uuid().optional(),
});

export const updateConvocatoriaDocumentoSchema = z.object({
  descripcion: z.string().optional(),
  estado: estadoDocumentoConvocatoria.optional(),
  documentoId: z.string().uuid().nullable().optional(),
});

export type CreateConvocatoriaDocumentoInput = z.infer<typeof createConvocatoriaDocumentoSchema>;
export type UpdateConvocatoriaDocumentoInput = z.infer<typeof updateConvocatoriaDocumentoSchema>;
