/**
 * Perfil de la fundación: contra esto se decide si una convocatoria "le sirve"
 * (ver elegibilidad/). Es lo único que hay que tocar si cambia el foco de
 * Asisco Up; después se puede re-evaluar lo pendiente con
 * `npm run elegibilidad:reevaluar`.
 */
export const PERFIL_FUNDACION = {
  nombre: "Fundación Asisco Up",
  municipio: "Manizales",
  /** Texto que se le da al evaluador de IA. Concreto: qué hace y para quién. */
  descripcion: [
    "Fundación sin ánimo de lucro de Manizales (Caldas, Colombia) que trabaja con niños, niñas",
    "y jóvenes con síndrome de Down y sus familias: estimulación y terapias, inclusión educativa,",
    "acompañamiento a familias y cuidadores, inclusión social, cultural y deportiva, y defensa",
    "de los derechos de las personas con discapacidad cognitiva.",
  ].join(" "),
  /** Temas que, si aparecen, hacen que una convocatoria merezca revisarse. */
  temasAfines: [
    "síndrome de Down",
    "discapacidad (cognitiva o intelectual, o discapacidad en general)",
    "inclusión educativa o educación inclusiva",
    "primera infancia, niñez y adolescencia",
    "familias y cuidadores",
    "rehabilitación, terapias, estimulación temprana",
    "inclusión social, cultural o deportiva de población vulnerable",
  ],
  /**
   * Entidades cuyas convocatorias pueden ejecutarse en Manizales: el municipio
   * mismo y las del departamento (la Gobernación queda en Manizales; la IA
   * descarta las que dicen ejecutarse en otro municipio).
   */
  entidadesDelTerritorio: [/manizales/i, /gobernaci[oó]n de caldas/i, /departamento de caldas/i],
} as const;
