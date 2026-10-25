import "dotenv/config";
import { z } from "zod";

/**
 * `PUBLIC_URL=` (sin valor) en un .env lo lee dotenv como `""`, no como
 * `undefined`, y `.url().optional()` de zod solo perdona `undefined`. Este
 * helper trata la cadena vacía como "no configurada" para cualquier campo
 * opcional con formato (url, etc.), que es lo que casi siempre se quiere.
 */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatorio"),

  /// Clave que toda petición a la API debe mandar en `x-api-key` (o `Authorization: Bearer`).
  /// Obligatoria en producción; en desarrollo, si falta, la API queda abierta con un aviso.
  API_KEY: optional(z.string().min(32, "API_KEY debe tener al menos 32 caracteres")),

  // Telegram (bot web + webhook)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  PUBLIC_URL: optional(z.string().url()),
  /// IDs numéricos de Telegram autorizados a usar el bot (coma-separados). Sin tabla de
  /// usuarios en v2, esta es la "lista blanca" (ver README § Autorización sin tabla de usuarios).
  TELEGRAM_ALLOWED_USER_IDS: z.string().optional(),

  // IA — Google AI Studio / Gemini es el proveedor por defecto (gratis, sin tarjeta,
  // contexto largo para leer páginas/PDF de convocatorias). Ver README § Modelo de IA.
  IA_PROVIDER: z.enum(["gemini", "groq", "openrouter", "cerebras"]).default("gemini"),
  GEMINI_API_KEY: z.string().optional(),
  MODELO_EVALUADOR: z.string().default("gemini-3.5-flash-lite"),
  MODELO_EXPLORADOR: z.string().default("gemini-3.5-flash"),
  MAX_TOKENS_DIA: z.coerce.number().int().positive().default(2_000_000),

  // Plan B si Gemini se queda sin cupo (ver README § Alternativas). No se usan a menos
  // que IA_PROVIDER los seleccione.
  GROQ_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  CEREBRAS_API_KEY: z.string().optional(),

  // Supabase: API/SDK, reservadas para cuando se conecte Storage o Auth (ver
  // README § Conectar a Supabase). La base de datos ya se resuelve con
  // DATABASE_URL arriba; estas 4 no las usa Prisma.
  SUPABASE_URL: optional(z.string().url()),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_JWKS_URL: optional(z.string().url()),

  // Cada cuánto el worker revisa qué fuentes tienen el cron vencido (ver src/worker.ts).
  SCHEDULER_TICK_MS: z.coerce.number().int().positive().default(60_000),

  TZ: z.string().default("America/Bogota"),
}).refine((e) => e.NODE_ENV !== "production" || e.API_KEY, {
  message: "API_KEY es obligatoria en producción",
  path: ["API_KEY"],
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variables de entorno inválidas:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Configuración de entorno inválida. Revisa tu .env contra .env.example.");
}

export const env = parsed.data;

/** Lista de telegram_user_id autorizados, ya parseada a bigint. */
export function allowedTelegramUserIds(): bigint[] {
  if (!env.TELEGRAM_ALLOWED_USER_IDS) return [];
  return env.TELEGRAM_ALLOWED_USER_IDS.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s));
}