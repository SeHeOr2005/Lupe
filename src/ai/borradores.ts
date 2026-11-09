/**
 * Redacción de borradores con IA: carta de presentación y propuesta técnica
 * para una convocatoria, a partir de lo que Lupe ya sabe de ella y de la
 * fundación (borradores/contexto.ts). Devuelve JSON (secciones y párrafos)
 * validado con zod; el archivo Word lo arma borradores/word.ts.
 *
 * Regla de oro: no inventar. Cifras, logros, nombres o fechas que no estén en
 * el contexto van como [campo entre corchetes] para que la directora los llene.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "../config/env.js";
import { conModeloDeRespaldo } from "./reintentos.js";
import type { TipoBorrador } from "../borradores/contexto.js";

const borradorSchema = z.object({
  asunto: z.string().optional(),
  secciones: z.array(z.object({ titulo: z.string(), parrafos: z.array(z.string()) })).min(1),
  camposPorCompletar: z.array(z.string()).default([]),
});

export type Borrador = z.infer<typeof borradorSchema>;

const BORRADOR_JSON_SCHEMA = {
  type: "object",
  properties: {
    asunto: { type: "string", description: "asunto de la carta (solo para la carta de presentación)" },
    secciones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "título de la sección; vacío en la carta" },
          parrafos: { type: "array", items: { type: "string" } },
        },
        required: ["titulo", "parrafos"],
      },
    },
    camposPorCompletar: {
      type: "array",
      items: { type: "string" },
      description: "cada [campo entre corchetes] que dejaste en el texto, sin repetir",
    },
  },
  required: ["secciones", "camposPorCompletar"],
};

const REGLAS = `Reglas:
- Español formal de Colombia, claro y concreto. Sin adornos ni frases vacías.
- NO inventes nada: ni cifras (beneficiarios, años, montos), ni logros, ni nombres, ni fechas,
  ni alianzas. Si un dato no está en el contexto, escribe un campo entre corchetes que diga
  qué va ahí, por ejemplo [número de niños atendidos en 2025] o [nombre del coordinador].
- De la fundación solo sabes lo que dice el bloque "FUNDACIÓN QUE SE POSTULA". No le
  atribuyas experiencia, sectores de trabajo, equipo humano, capacidad financiera,
  certificaciones ni cumplimiento de requisitos que no estén ahí.
- Los requisitos y criterios de la convocatoria describen lo que SE PIDE, no lo que la
  fundación TIENE. Cuando el texto deba afirmar que la fundación cumple algo que pide la
  convocatoria, escríbelo como campo de verificación: [confirmar: equipo de dos entrenadores
  deportivos] o [confirmar: índice de liquidez ≥ 1,2]. Nunca lo des por hecho.
- Puedes usar tal cual lo que el contexto dice de la fundación y de la convocatoria.
- No menciones que el texto fue escrito por una IA.
- En camposPorCompletar lista cada campo entre corchetes que usaste.`;

const INSTRUCCIONES: Record<TipoBorrador, string> = {
  carta: `Redacta el CUERPO de una carta de presentación de la fundación para esta convocatoria
(el encabezado, el saludo y la firma los pone el sistema). Una sola sección con titulo vacío
y de 3 a 5 párrafos: quién es la fundación y a quién atiende; su interés en la convocatoria y
cómo encaja con su misión; el compromiso de cumplir los requisitos y el cronograma; la
relación de los documentos que se anexan (según los que pide la convocatoria). En asunto,
una línea: "Presentación de propuesta – <nombre de la convocatoria>".`,
  propuesta: `Redacta un BORRADOR de propuesta técnica con estas secciones, en este orden:
1. Presentación de la organización
2. Justificación (el problema que atiende el proyecto en su territorio y población)
3. Objetivos (uno general y tres o cuatro específicos)
4. Población beneficiaria
5. Metodología y actividades
6. Cronograma de trabajo (por meses o fases, con [fechas] por completar)
7. Presupuesto (rubros principales, con [valores] por completar)
8. Resultados esperados e indicadores
9. Experiencia de la organización
Si la convocatoria trae criterios de evaluación, asegúrate de que cada criterio quede
respondido de forma explícita en la sección que corresponda: es lo que se califica.
Cada sección, de 1 a 4 párrafos.`,
};

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY no está configurada (ver .env.example).");
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

export async function generarBorrador(
  tipo: TipoBorrador,
  contexto: string,
): Promise<{ borrador: Borrador; tokensUsados: number }> {
  const response = await conModeloDeRespaldo([env.MODELO_EXPLORADOR, env.MODELO_EVALUADOR], (model) =>
    getClient().models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: `Eres quien redacta los documentos de postulación de una fundación sin ánimo de lucro.\n\n${INSTRUCCIONES[tipo]}\n\n${REGLAS}` },
            { text: contexto },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: BORRADOR_JSON_SCHEMA,
        temperature: 0.4, // algo de variedad en la redacción; los datos los controla el contexto
      },
    }),
  );

  const parsed = borradorSchema.safeParse(JSON.parse(response.text ?? "{}"));
  if (!parsed.success) {
    throw new Error(`Gemini devolvió un borrador que no cumple el esquema: ${parsed.error.message}`);
  }
  return { borrador: parsed.data, tokensUsados: response.usageMetadata?.totalTokenCount ?? 0 };
}
