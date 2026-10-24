import { z } from "zod";

export const tipoDocumento = z.enum([
  "rut",
  "certificado_existencia_representacion",
  "cedula_representante_legal",
  "certificado_antecedentes_fiscales",
  "certificado_antecedentes_disciplinarios",
  "certificado_antecedentes_judiciales",
  "estados_financieros",
  "hoja_vida_entidad",
  "otro",
]);

export const createDocumentoFundacionSchema = z.object({
  tipo: tipoDocumento,
  nombre: z.string().min(1),
  fechaExpedicion: z.coerce.date().optional(),
  fechaVencimiento: z.coerce.date().optional(),
  telegramFileId: z.string().optional(),
  urlArchivo: z.string().url().optional(),
  notas: z.string().optional(),
});

export const updateDocumentoFundacionSchema = createDocumentoFundacionSchema.partial();

export type CreateDocumentoFundacionInput = z.infer<typeof createDocumentoFundacionSchema>;
export type UpdateDocumentoFundacionInput = z.infer<typeof updateDocumentoFundacionSchema>;
