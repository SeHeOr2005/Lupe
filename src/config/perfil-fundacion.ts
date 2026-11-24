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
    "Organización sin ánimo de lucro de Manizales (Caldas, Colombia) dedicada al desarrollo",
    "integral de niños, niñas, jóvenes y adultos con síndrome de Down y otras discapacidades",
    "cognitivas, así como a sus familias y cuidadores de escasos recursos.",
    "Ofrece formación gratuita y personalizada en lectoescritura, idiomas (inglés, francés, portugués),",
    "artes (música, teatro, danza), deportes (tenis), tecnología (sistemas), acompañamiento psicosocial,",
    "trabajo comunitario en barrios vulnerables y defensa de los derechos humanos y la inclusión social.",
  ].join(" "),
  /** Temas que, si aparecen, hacen que una convocatoria merezca revisarse. */
  temasAfines: [
    "síndrome de Down",
    "discapacidad (cognitiva, intelectual, neurodiversidad o discapacidad en general)",
    "inclusión educativa, educación inclusiva o formación personalizada",
    "primera infancia, niñez, adolescencia y juventud",
    "familias, madres cabeza de hogar y cuidadores",
    "rehabilitación, terapias, estimulación temprana y desarrollo integral",
    "cultura, arte, música, teatro, danza y recreación inclusiva",
    "deporte adaptado, actividad física y bienestar",
    "inclusión social, trabajo comunitario y población vulnerable",
    "derechos humanos, equidad y participación ciudadana",
    "fortalecimiento institucional de ESAL / organizaciones sociales",
  ],
  /**
   * Entidades cuyas convocatorias pueden ejecutarse en Manizales: el municipio
   * mismo, las del departamento (la Gobernación queda en Manizales; la IA
   * descarta las que dicen ejecutarse en otro municipio) y algunas entidades
   * nacionales que financian a fundaciones del sector. No se acepta "nacional" o
   * "Colombia" a secas: dejaría pasar casi cualquier entidad y gastaría IA.
   */
  entidadesDelTerritorio: [
    /manizales/i,
    /gobernaci[oó]n de caldas/i,
    /departamento de caldas/i,
    /caldas/i,
    /eje cafetero/i,
    /\bicbf\b|instituto colombiano de bienestar familiar/i,
    /\bministerio\b/i,
    /prosperidad social/i,
  ],
} as const;

/**
 * Datos institucionales para los borradores (carta de presentación, propuesta).
 * Lo que quede vacío sale en el borrador como [campo entre corchetes] para que
 * la directora lo complete a mano; nunca lo inventa la IA. Llenarlos una vez
 * hace que aparezcan en todos los borradores.
 */
export const DATOS_FUNDACION = {
  nombreLegal: "Asociación de Interés Social Comunitario ASISCO UP",
  nit: "", // No público en web; completar con el RUT
  representanteLegal: "Consuelo Giraldo Zuluaga",
  cargoRepresentante: "Directora",
  direccion: "Carrera 23 # 51-57",
  ciudad: "Manizales",
  telefono: "+57 300 267 5041 / +57 323 460 9086",
  correo: "", // Verificar correo institucional oficial
  anioConstitucion: "2004", // Inició labores en 1999; constitución legal el 21 de septiembre de 2004
  /** Logros, cifras o programas que la fundación quiera que se mencionen (frases cortas, reales). */
  trayectoria: [
    "Más de 25 años de trayectoria comunitaria en Manizales (inició labores en 1999 y se constituyó legalmente en 2004).",
    "Atención y formación 100% gratuita enfocada en población con síndrome de Down, discapacidad cognitiva y familias de bajos recursos.",
    "Programas activos de formación artística (música, teatro y danza), académica (lectoescritura, sistemas e idiomas: inglés, francés y portugués) y deportiva (tenis).",
    "Estrategia de intervención 'Fundación en territorio' con acompañamiento psicosocial a familias y cuidadores en comunas y barrios vulnerables de Manizales.",
    "Producción del espacio de sensibilización y derechos 'No Somos Down, Somos UP Podcast'.",
  ],
};
