/**
 * Lo que la IA necesita para redactar un borrador: la convocatoria (lo que el
 * explorador ya guardó: objeto, requisitos, criterios de evaluación, pasos) y
 * la fundación (perfil y datos institucionales). Puro, sin base ni IA.
 */

export type TipoBorrador = "carta" | "propuesta";

export const TIPOS_BORRADOR: Record<TipoBorrador, { nombre: string; archivo: string }> = {
  carta: { nombre: "Carta de presentación", archivo: "carta-de-presentacion" },
  propuesta: { nombre: "Propuesta técnica", archivo: "propuesta-tecnica" },
};

export interface ConvocatoriaParaBorrador {
  titulo: string;
  entidad: string;
  resumen: string | null;
  montoMaximo: { toString(): string } | number | null;
  fechaCierre: Date | null;
  /** convocatorias.requisitos: { habilitantes, criteriosEvaluacion, documentosExigidos } (lo guarda el explorador). */
  requisitos: unknown;
  pasos: { titulo: string; descripcion: string | null }[];
}

export interface DatosFundacion {
  nombreLegal: string;
  nit: string;
  representanteLegal: string;
  cargoRepresentante: string;
  direccion: string;
  ciudad: string;
  telefono: string;
  correo: string;
  anioConstitucion: string;
  trayectoria: readonly string[];
}

const ETIQUETAS: Record<keyof Omit<DatosFundacion, "trayectoria">, string> = {
  nombreLegal: "Nombre legal",
  nit: "NIT",
  representanteLegal: "Nombre del representante legal",
  cargoRepresentante: "Cargo del representante legal",
  direccion: "Dirección",
  ciudad: "Ciudad",
  telefono: "Teléfono",
  correo: "Correo electrónico",
  anioConstitucion: "Año de constitución",
};

/** "[Nombre del representante legal]" si el dato está vacío: así se ve qué falta. */
export function valorOCampo(datos: DatosFundacion, campo: keyof typeof ETIQUETAS): string {
  const v = String(datos[campo] ?? "").trim();
  return v || `[${ETIQUETAS[campo]}]`;
}

const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);

/** Los requisitos guardados por el explorador, tolerando que falten o vengan en otro formato. */
export function requisitosDe(requisitos: unknown) {
  const r = (requisitos && typeof requisitos === "object" ? requisitos : {}) as Record<string, unknown>;
  return {
    habilitantes: lista(r["habilitantes"]),
    criteriosEvaluacion: lista(r["criteriosEvaluacion"]),
    documentosExigidos: lista(r["documentosExigidos"]),
  };
}

/** ¿Hay suficiente de la convocatoria para un borrador con sustancia? (si no, sale más general). */
export function tieneDetalle(c: ConvocatoriaParaBorrador): boolean {
  const r = requisitosDe(c.requisitos);
  return r.criteriosEvaluacion.length > 0 || r.habilitantes.length > 0 || c.pasos.length > 0;
}

const formatoFecha = new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" });

/** Texto con todo lo que se sabe, para el prompt. */
export function contextoParaBorrador(
  c: ConvocatoriaParaBorrador,
  perfil: { nombre: string; descripcion: string; temasAfines: readonly string[] },
  datos: DatosFundacion,
): string {
  const r = requisitosDe(c.requisitos);
  const monto = c.montoMaximo === null ? undefined : Number(String(c.montoMaximo));
  const bloques = [
    "== CONVOCATORIA ==",
    `Nombre: ${c.titulo}`,
    `Entidad que la abre: ${c.entidad}`,
    ...(c.resumen ? [`Objeto: ${c.resumen}`] : []),
    ...(monto && monto > 0 ? [`Monto máximo: $${monto.toLocaleString("es-CO")} COP`] : []),
    ...(c.fechaCierre ? [`Cierre: ${formatoFecha.format(c.fechaCierre)}`] : []),
    ...(r.habilitantes.length ? ["Requisitos habilitantes:", ...r.habilitantes.map((x) => `- ${x}`)] : []),
    ...(r.criteriosEvaluacion.length ? ["Criterios de evaluación:", ...r.criteriosEvaluacion.map((x) => `- ${x}`)] : []),
    ...(r.documentosExigidos.length ? ["Documentos que piden:", ...r.documentosExigidos.map((x) => `- ${x}`)] : []),
    ...(c.pasos.length ? ["Cronograma:", ...c.pasos.map((p) => `- ${p.titulo}${p.descripcion ? ` (${p.descripcion})` : ""}`)] : []),
    "",
    "== FUNDACIÓN QUE SE POSTULA ==",
    `Nombre: ${valorOCampo(datos, "nombreLegal")}`,
    `Qué hace: ${perfil.descripcion}`,
    `Temas: ${perfil.temasAfines.join("; ")}`,
    `Ciudad: ${valorOCampo(datos, "ciudad")}`,
    `Año de constitución: ${valorOCampo(datos, "anioConstitucion")}`,
    `Representante legal: ${valorOCampo(datos, "representanteLegal")} (${valorOCampo(datos, "cargoRepresentante")})`,
    ...(datos.trayectoria.length
      ? ["Trayectoria y logros (reales, se pueden usar tal cual):", ...datos.trayectoria.map((x) => `- ${x}`)]
      : ["Trayectoria y logros: no hay datos; usa campos entre corchetes."]),
  ];
  return bloques.join("\n");
}

/** La IA a veces lista los campos con corchetes y a veces sin ellos: siempre "[campo]", sin repetir. */
export function normalizarCampos(campos: string[]): string[] {
  const limpios = campos.map((c) => c.trim().replace(/^\[+|\]+$/g, "").trim()).filter(Boolean);
  return [...new Set(limpios)].map((c) => `[${c}]`);
}
