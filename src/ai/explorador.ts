/**
 * Explorador: lee los documentos de una convocatoria (PDF del pliego, estudios
 * previos, invitación... y capturas de pantalla del cronograma de SECOP) y saca
 * lo que la fundación necesita para postularse: fecha de cierre, cronograma,
 * documentos exigidos y requisitos. Gemini lee PDF e imágenes de forma nativa.
 *
 * Igual que el evaluador, el modelo devuelve JSON y zod lo valida antes de que
 * toque la base. Las citas se verifican después contra el texto del PDF
 * (explorador/citas.ts).
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "../config/env.js";
import { conModeloDeRespaldo } from "./reintentos.js";

/** Tipos de documento del modelo de datos (enum tipo_documento). */
export const TIPOS_DOCUMENTO = [
  "rut",
  "certificado_existencia_representacion",
  "cedula_representante_legal",
  "certificado_antecedentes_fiscales",
  "certificado_antecedentes_disciplinarios",
  "certificado_antecedentes_judiciales",
  "estados_financieros",
  "hoja_vida_entidad",
  "otro",
] as const;

const extraccionSchema = z.object({
  resumen: z.string().optional(),
  presupuesto: z.number().optional(),
  /** Fecha y hora límite para presentar la propuesta, hora de Colombia: "YYYY-MM-DDTHH:mm" o "YYYY-MM-DD". */
  fechaCierre: z.string().optional(),
  citaFechaCierre: z.string().optional(),
  cronograma: z
    .array(
      z.object({
        actividad: z.string(),
        fecha: z.string().optional(),
        detalle: z.string().optional(),
      }),
    )
    .default([]),
  documentosExigidos: z
    .array(z.object({ nombre: z.string(), tipo: z.enum(TIPOS_DOCUMENTO) }))
    .default([]),
  requisitosHabilitantes: z.array(z.string()).default([]),
  criteriosEvaluacion: z.array(z.string()).default([]),
  advertencias: z.array(z.string()).default([]),
});

export type ExtraccionDocumentos = z.infer<typeof extraccionSchema>;

const EXTRACCION_JSON_SCHEMA = {
  type: "object",
  properties: {
    resumen: { type: "string", description: "qué se va a contratar o apoyar, en 1 o 2 frases" },
    presupuesto: { type: "number", description: "presupuesto oficial o valor máximo, en pesos" },
    fechaCierre: {
      type: "string",
      description: "fecha y hora límite para presentar la propuesta, hora de Colombia, formato YYYY-MM-DDTHH:mm (o YYYY-MM-DD si no hay hora)",
    },
    citaFechaCierre: { type: "string", description: "texto exacto del documento donde aparece esa fecha" },
    cronograma: {
      type: "array",
      items: {
        type: "object",
        properties: {
          actividad: { type: "string" },
          fecha: { type: "string", description: "YYYY-MM-DDTHH:mm o YYYY-MM-DD; omítela si el documento no da una fecha concreta" },
          detalle: { type: "string", description: "lugar, medio o plazo relativo, si lo hay" },
        },
        required: ["actividad"],
      },
    },
    documentosExigidos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nombre: { type: "string", description: "nombre del documento tal como lo pide la entidad" },
          tipo: { type: "string", enum: [...TIPOS_DOCUMENTO] },
        },
        required: ["nombre", "tipo"],
      },
    },
    requisitosHabilitantes: { type: "array", items: { type: "string" } },
    criteriosEvaluacion: { type: "array", items: { type: "string" } },
    advertencias: {
      type: "array",
      items: { type: "string" },
      description: "lo que falta o hay que revisar, por ejemplo que el cronograma está solo en la plataforma SECOP",
    },
  },
  required: ["cronograma", "documentosExigidos", "requisitosHabilitantes", "criteriosEvaluacion", "advertencias"],
};

const PROMPT_EXPLORADOR = `Eres el explorador de Lupe. Una fundación sin ánimo de lucro de Manizales
(Colombia) va a postularse a esta convocatoria pública y te pasa sus documentos: pliego
o invitación, estudios previos, anexos y, a veces, capturas de pantalla de la página del
proceso en SECOP II (por ejemplo, de la sección de cronograma).

Convocatoria: {{titulo}}
Entidad: {{entidad}}

Extrae lo que la fundación necesita para preparar la postulación:
- fechaCierre: fecha y hora límite para presentar la propuesta u oferta (en hora de Colombia).
- cronograma: todas las etapas en orden (publicación, observaciones, manifestación de
  interés, presentación de ofertas, evaluación, adjudicación, firma...). Si una etapa no
  tiene fecha concreta (por ejemplo "3 días hábiles después de..."), ponlo en detalle y
  omite fecha.
- documentosExigidos: lo que la fundación debe entregar. Clasifica cada uno en el tipo que
  corresponda; si no encaja en ninguno, usa "otro".
- requisitosHabilitantes y criteriosEvaluacion: frases cortas.

Reglas:
- No inventes nada. Si un dato no aparece en los archivos, omítelo.
- citaFechaCierre debe ser texto copiado tal cual del archivo donde está la fecha.
- Si el documento dice que el cronograma está en la plataforma SECOP II y no se ve en los
  archivos, agrégalo a advertencias para que la fundación envíe una captura de esa sección.
- Si los archivos se contradicen, prefiere la captura de la plataforma (es la fuente
  oficial de las fechas) y menciónalo en advertencias.`;

export interface ArchivoParaLeer {
  nombre: string;
  mimeType: string;
  datos: Buffer;
}

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY no está configurada (ver .env.example).");
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

export async function leerDocumentos(
  archivos: ArchivoParaLeer[],
  contexto: { titulo: string; entidad: string },
): Promise<{ extraccion: ExtraccionDocumentos; tokensUsados: number }> {
  const prompt = PROMPT_EXPLORADOR.replace("{{titulo}}", contexto.titulo).replace("{{entidad}}", contexto.entidad);

  // Si el explorador está saturado (503), se reintenta y luego se usa el modelo del evaluador.
  const response = await conModeloDeRespaldo([env.MODELO_EXPLORADOR, env.MODELO_EVALUADOR], (model) =>
    getClient().models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            ...archivos.flatMap((a) => [
              { text: `--- Archivo: ${a.nombre} ---` },
              { inlineData: { mimeType: a.mimeType, data: a.datos.toString("base64") } },
            ]),
            { text: prompt },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: EXTRACCION_JSON_SCHEMA,
        temperature: 0,
      },
    }),
  );

  const parsed = extraccionSchema.safeParse(JSON.parse(response.text ?? "{}"));
  if (!parsed.success) {
    throw new Error(`Gemini devolvió un JSON del explorador que no cumple el esquema: ${parsed.error.message}`);
  }
  return { extraccion: parsed.data, tokensUsados: response.usageMetadata?.totalTokenCount ?? 0 };
}
