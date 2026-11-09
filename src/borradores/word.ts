/**
 * Arma el archivo Word (.docx) de un borrador. Los [campos entre corchetes]
 * salen resaltados en amarillo para que se vea de un vistazo qué falta llenar.
 */
import { AlignmentType, Document, Footer, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { Borrador } from "../ai/borradores.js";
import { TIPOS_BORRADOR, valorOCampo, type DatosFundacion, type TipoBorrador } from "./contexto.js";

const AVISO = "Borrador generado por Lupe con IA. Revísalo y completa los campos resaltados entre [corchetes] antes de enviarlo.";

/** Parte un texto en trozos normales y [campos] resaltados. */
export function trozosConCampos(texto: string): { texto: string; campo: boolean }[] {
  const trozos: { texto: string; campo: boolean }[] = [];
  let desde = 0;
  for (const m of texto.matchAll(/\[[^\]\n]{1,120}\]/g)) {
    if (m.index! > desde) trozos.push({ texto: texto.slice(desde, m.index), campo: false });
    trozos.push({ texto: m[0], campo: true });
    desde = m.index! + m[0].length;
  }
  if (desde < texto.length) trozos.push({ texto: texto.slice(desde), campo: false });
  return trozos;
}

function parrafo(texto: string, opciones: { negrita?: boolean; alineacion?: (typeof AlignmentType)[keyof typeof AlignmentType]; espacioDespues?: number } = {}) {
  return new Paragraph({
    alignment: opciones.alineacion ?? AlignmentType.JUSTIFIED,
    spacing: { after: opciones.espacioDespues ?? 160, line: 300 },
    children: trozosConCampos(texto).map(
      (t) => new TextRun({ text: t.texto, bold: opciones.negrita, ...(t.campo ? { highlight: "yellow" } : {}) }),
    ),
  });
}

const vacio = () => new Paragraph({ text: "" });

const formatoFecha = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" });

function cuerpoCarta(borrador: Borrador, meta: { entidad: string; datos: DatosFundacion; hoy: Date }): Paragraph[] {
  const d = meta.datos;
  return [
    parrafo(`${valorOCampo(d, "ciudad")}, ${formatoFecha.format(meta.hoy)}`, { alineacion: AlignmentType.LEFT }),
    vacio(),
    parrafo("Señores", { alineacion: AlignmentType.LEFT, espacioDespues: 0 }),
    parrafo(meta.entidad, { negrita: true, alineacion: AlignmentType.LEFT, espacioDespues: 0 }),
    parrafo("[Ciudad de la entidad]", { alineacion: AlignmentType.LEFT }),
    vacio(),
    ...(borrador.asunto ? [parrafo(`Asunto: ${borrador.asunto}`, { negrita: true, alineacion: AlignmentType.LEFT })] : []),
    vacio(),
    parrafo("Respetados señores:", { alineacion: AlignmentType.LEFT }),
    ...borrador.secciones.flatMap((s) => s.parrafos.map((p) => parrafo(p))),
    vacio(),
    parrafo("Atentamente,", { alineacion: AlignmentType.LEFT }),
    vacio(),
    vacio(),
    parrafo("______________________________", { alineacion: AlignmentType.LEFT, espacioDespues: 0 }),
    parrafo(valorOCampo(d, "representanteLegal"), { negrita: true, alineacion: AlignmentType.LEFT, espacioDespues: 0 }),
    parrafo(`${valorOCampo(d, "cargoRepresentante")} · ${valorOCampo(d, "nombreLegal")}`, { alineacion: AlignmentType.LEFT, espacioDespues: 0 }),
    parrafo(`NIT ${valorOCampo(d, "nit")}`, { alineacion: AlignmentType.LEFT, espacioDespues: 0 }),
    parrafo(`${valorOCampo(d, "direccion")} · ${valorOCampo(d, "telefono")} · ${valorOCampo(d, "correo")}`, {
      alineacion: AlignmentType.LEFT,
    }),
  ];
}

function cuerpoPropuesta(borrador: Borrador, meta: { titulo: string; entidad: string; datos: DatosFundacion; hoy: Date }): Paragraph[] {
  return [
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun("Propuesta técnica")] }),
    parrafo(meta.titulo, { negrita: true, alineacion: AlignmentType.CENTER, espacioDespues: 0 }),
    parrafo(meta.entidad, { alineacion: AlignmentType.CENTER }),
    parrafo(`Presenta: ${valorOCampo(meta.datos, "nombreLegal")} · ${formatoFecha.format(meta.hoy)}`, {
      alineacion: AlignmentType.CENTER,
    }),
    vacio(),
    ...borrador.secciones.flatMap((s) => [
      ...(s.titulo.trim() ? [new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun(s.titulo)] })] : []),
      ...s.parrafos.map((p) => parrafo(p)),
    ]),
  ];
}

export async function crearWord(
  tipo: TipoBorrador,
  borrador: Borrador,
  meta: { titulo: string; entidad: string; datos: DatosFundacion; hoy?: Date },
): Promise<Buffer> {
  const hoy = meta.hoy ?? new Date();
  const doc = new Document({
    title: `${TIPOS_BORRADOR[tipo].nombre} – ${meta.titulo}`,
    creator: "Lupe",
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } }, // 11 pt
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: AVISO, italics: true, size: 16, color: "888888" })],
              }),
            ],
          }),
        },
        children: tipo === "carta" ? cuerpoCarta(borrador, { ...meta, hoy }) : cuerpoPropuesta(borrador, { ...meta, hoy }),
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/** "carta-de-presentacion-fondo-semillas-de-inclusion-2026.docx" */
export function nombreArchivo(tipo: TipoBorrador, tituloConvocatoria: string): string {
  const slug = tituloConvocatoria
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50)
    .replace(/-$/, "");
  return `${TIPOS_BORRADOR[tipo].archivo}${slug ? `-${slug}` : ""}.docx`;
}
