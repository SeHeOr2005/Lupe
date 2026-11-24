/**
 * Limpia convocatorias guardadas más de una vez (mismo número de proceso). Pasó
 * cuando SECOP cambió el nombre de la Gobernación y la huella dejó de coincidir;
 * el escaneo ya compara por número de proceso, así que no vuelve a pasar.
 *
 *   npm run convocatorias:duplicados              → solo muestra qué haría
 *   npm run convocatorias:duplicados -- --aplicar → borra las copias sobrantes
 *
 * De cada proceso conserva la copia que la directora ya trabajó (aprobada,
 * postulada...) o, si ninguna, la pendiente más antigua. Solo borra copias que
 * siguen en pendiente o no apta y sin postulación (con su historial, pasos y
 * documentos exigidos). Las que tienen decisiones propias las lista para revisar.
 */
import { prisma } from "../db/prisma.js";
import { planDuplicado, type Copia } from "../jobs/duplicados.js";

const aplicar = process.argv.includes("--aplicar");

const filas = await prisma.convocatoria.findMany({
  where: { numeroProceso: { not: null } },
  select: { id: true, estado: true, createdAt: true, numeroProceso: true, titulo: true, postulacion: { select: { id: true } } },
});

const grupos = new Map<string, typeof filas>();
for (const f of filas) grupos.set(f.numeroProceso!, [...(grupos.get(f.numeroProceso!) ?? []), f]);
const repetidos = [...grupos.values()].filter((g) => g.length > 1);

const aBorrar: string[] = [];
let aRevisar = 0;
for (const grupo of repetidos) {
  const copias: Copia[] = grupo.map((f) => ({ id: f.id, estado: f.estado, createdAt: f.createdAt, tienePostulacion: !!f.postulacion }));
  const plan = planDuplicado(copias);
  aBorrar.push(...plan.borrar.map((c) => c.id));
  aRevisar += plan.revisar.length;
  const titulo = grupo[0]!.titulo.slice(0, 60);
  console.log(
    `· ${grupo[0]!.numeroProceso} ${titulo}\n    se queda: ${plan.conservar.estado}` +
      (plan.borrar.length ? ` · se borran: ${plan.borrar.map((c) => c.estado).join(", ")}` : "") +
      (plan.revisar.length ? ` · REVISAR A MANO: ${plan.revisar.map((c) => `${c.estado} (${c.id})`).join(", ")}` : ""),
  );
}

if (aplicar && aBorrar.length) {
  // Cascada: se van también su historial de estados, pasos, documentos exigidos y recordatorios.
  const { count } = await prisma.convocatoria.deleteMany({ where: { id: { in: aBorrar } } });
  console.log(`\nBorradas ${count} copias sobrantes.`);
}

console.log(
  `\n${repetidos.length} procesos repetidos · ${aBorrar.length} copias para borrar · ${aRevisar} para revisar a mano.` +
    (aplicar ? "" : " No se cambió nada: corre con --aplicar para borrarlas."),
);
await prisma.$disconnect();
