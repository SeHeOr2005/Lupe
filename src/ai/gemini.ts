/**
 * Cliente del modelo de IA. Google Gemini (AI Studio) es el proveedor por
 * defecto: se activa con una cuenta de Google, sin tarjeta, tiene un nivel
 * gratuito real y aguanta el contexto largo que necesita leer una página de
 * SECOP o de la Alcaldía (ver README § Modelo de IA para la comparación
 * completa con Groq/OpenRouter/Cerebras).
 *
 * El modelo SIEMPRE devuelve JSON (responseJsonSchema), y ese JSON se vuelve
 * a validar aquí con zod antes de tocar la base de datos — tal como pide el
 * documento de diseño ("el agente devuelve JSON y zod lo valida").
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "../config/env.js";

const candidatoSchema = z.object({
  titulo: z.string(),
  entidad: z.string(),
  numeroProceso: z.string().optional(),
  resumen: z.string().optional(),
  fechaApertura: z.string().optional(), // ISO yyyy-mm-dd
  fechaCierre: z.string().optional(), // ISO datetime
  montoMaximo: z.number().optional(),
  requisitos: z.array(z.string()).optional(),
  /** Cita textual de la página que sustenta fechaCierre (ver "Verificación de citas"). */
  citaFechaCierre: z.string().optional(),
  /** Cita textual de la página que sustenta montoMaximo. */
  citaMonto: z.string().optional(),
});

export const evaluacionSchema = z.object({
  candidatos: z.array(candidatoSchema),
});

export type Candidato = z.infer<typeof candidatoSchema>;

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    candidatos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          entidad: { type: "string" },
          numeroProceso: { type: "string" },
          resumen: { type: "string" },
          fechaApertura: { type: "string", description: "formato yyyy-mm-dd" },
          fechaCierre: { type: "string", description: "formato yyyy-mm-dd o ISO 8601" },
          montoMaximo: { type: "number" },
          requisitos: { type: "array", items: { type: "string" } },
          citaFechaCierre: { type: "string", description: "cita textual exacta de la página" },
          citaMonto: { type: "string", description: "cita textual exacta de la página" },
        },
        required: ["titulo", "entidad"],
      },
    },
  },
  required: ["candidatos"],
};

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY no está configurada (ver .env.example).");
  }
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

const PROMPT_EVALUADOR = `Eres el agente evaluador de Lupe, un servicio que busca convocatorias de
subsidio/financiación para fundaciones sin ánimo de lucro en Manizales, Colombia.

Se te da el texto limpio de UNA página que lista convocatorias de "{{fuente}}".
Devuelve SOLO las convocatorias que sigan abiertas (no vencidas) y que una
fundación comunitaria pequeña podría aplicar.

Reglas:
- Cada fecha y monto que reportes DEBE venir acompañado de una cita textual
  (citaFechaCierre / citaMonto) copiada tal cual de la página. Si no la
  encuentras, omite ese campo en vez de inventarlo.
- No inventes datos que no estén en el texto.
- Si no hay convocatorias vigentes, responde con candidatos: [].`;

export interface ResultadoEvaluacion {
  candidatos: Candidato[];
  tokensUsados: number;
}

export async function evaluarPaginaUnica(texto: string, fuenteNombre: string): Promise<ResultadoEvaluacion> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: env.MODELO_EVALUADOR,
    contents: [
      { role: "user", parts: [{ text: PROMPT_EVALUADOR.replace("{{fuente}}", fuenteNombre) }] },
      { role: "user", parts: [{ text: `--- TEXTO DE LA PÁGINA ---\n${texto.slice(0, 900_000)}` }] },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
      temperature: 0,
    },
  });

  const raw = response.text ?? "{}";
  const parsed = evaluacionSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Gemini devolvió un JSON que no cumple el esquema: ${parsed.error.message}`);
  }

  return {
    candidatos: parsed.data.candidatos,
    tokensUsados: response.usageMetadata?.totalTokenCount ?? 0,
  };
}
