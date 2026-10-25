/**
 * Fuentes iniciales de Lupe. Se corre con `npm run db:seed` (o `npx prisma db seed`).
 * Es idempotente: si la fuente ya existe (por nombre), la actualiza en vez de duplicarla.
 */
import { prisma } from "../src/db/prisma.js";

/**
 * SECOP II por datos abiertos (datos.gov.co, dataset p6dx-8zbt). El filtro sale de revisar
 * los datos reales en oct-2026:
 *   - "Decreto 092 de 2017" es el régimen de contratación con entidades sin ánimo de lucro
 *     (ESAL), que es lo que puede ganar una fundación.
 *   - Solo entidades territoriales (alcaldías, municipios, Gobernación): los hospitales (ESE) y
 *     la Universidad de Caldas también marcan "Decreto 092" para sus compras, y son ruido.
 *   - Sin fecha de publicación son borradores que nunca se publicaron (su URL es la página
 *     de login de SECOP), así que se excluyen.
 *   - "Abierto" en SECOP no se cierra nunca (hay procesos de 2017 así), por eso se ordena por
 *     fecha de publicación y se toman los 100 más recientes; la huella evita duplicados.
 */
const where = [
  "departamento_entidad='Caldas'",
  "estado_de_apertura_del_proceso='Abierto'",
  "fecha_de_publicacion_del IS NOT NULL",
  "justificaci_n_modalidad_de like '%092%'",
  "(upper(entidad) like '%ALCALD%' OR upper(entidad) like '%MUNICIPIO%' OR upper(entidad) like '%GOBERNACI%')",
].join(" AND ");

const secopUrl =
  "https://www.datos.gov.co/resource/p6dx-8zbt.json?" +
  new URLSearchParams({ $where: where, $order: "fecha_de_publicacion_del DESC", $limit: "100" }).toString();

const fuentes = [
  {
    nombre: "SECOP II · Caldas · convenios con ESAL (Decreto 092)",
    urlBase: secopUrl,
    modo: "api" as const,
    dominiosPermitidos: ["www.datos.gov.co"],
    maxPaginas: 1,
    cron: "0 7 * * *", // todos los días a las 7:00 (America/Bogota)
    activa: true,
  },
];

for (const fuente of fuentes) {
  const existente = await prisma.fuente.findFirst({ where: { nombre: fuente.nombre } });
  if (existente) {
    await prisma.fuente.update({ where: { id: existente.id }, data: fuente });
    console.log(`Actualizada: ${fuente.nombre}`);
  } else {
    await prisma.fuente.create({ data: fuente });
    console.log(`Creada: ${fuente.nombre}`);
  }
}

await prisma.$disconnect();
