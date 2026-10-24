import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { NotFoundError } from "./errors.js";
import { serializeBigInt } from "./serialize.js";

/**
 * Forma mínima que necesitamos de un delegate de Prisma Client
 * (prisma.convocatoria, prisma.fuente, etc.) para montar un CRUD genérico.
 */
interface Delegate {
  findMany(args?: Record<string, unknown>): Promise<unknown[]>;
  count(args?: Record<string, unknown>): Promise<number>;
  findUnique(args: { where: Record<string, unknown> }): Promise<unknown | null>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>;
  delete(args: { where: Record<string, unknown> }): Promise<unknown>;
}

interface CrudOptions<TCreate, TUpdate> {
  /** Nombre humano del recurso, para mensajes de error ("convocatoria", "fuente"...). */
  resource: string;
  /** Ruta base, ej. "/convocatorias". */
  basePath: string;
  delegate: Delegate;
  createSchema: z.ZodType<TCreate>;
  updateSchema: z.ZodType<TUpdate>;
  /** Nombre de la columna PK. Por defecto "id". */
  idField?: string;
  /** Convierte el :id de la URL (string) al tipo real de la PK (uuid string o bigint). */
  parseId?: (raw: string) => unknown;
  defaultOrderBy?: Record<string, "asc" | "desc">;
  /** Construye el `where` de GET /recurso a partir del querystring. */
  buildWhere?: (query: Record<string, string | undefined>) => Record<string, unknown>;
  /** Desactiva DELETE para recursos que son bitácora/historial (no se borran). */
  allowDelete?: boolean;
  /** Desactiva POST: para tablas que solo escribe el sistema (escaneos, eventos, chat_messages). */
  allowCreate?: boolean;
  /** Desactiva PATCH: idem. */
  allowUpdate?: boolean;
  include?: Record<string, unknown>;
}

export function registerCrudRoutes<TCreate, TUpdate>(
  app: FastifyInstance,
  opts: CrudOptions<TCreate, TUpdate>,
): void {
  const {
    resource,
    basePath,
    delegate,
    createSchema,
    updateSchema,
    idField = "id",
    parseId = (raw: string) => raw,
    defaultOrderBy,
    buildWhere,
    allowDelete = true,
    allowCreate = true,
    allowUpdate = true,
    include,
  } = opts;

  // Listar (con paginación simple por take/skip)
  app.get(basePath, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const take = query.take ? Math.min(Math.max(Number(query.take), 1), 200) : 50;
    const skip = query.skip ? Math.max(Number(query.skip), 0) : 0;
    const where = buildWhere ? buildWhere(query) : {};

    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        take,
        skip,
        orderBy: defaultOrderBy ?? { [idField]: "desc" },
        ...(include ? { include } : {}),
      }),
      delegate.count({ where }),
    ]);

    return serializeBigInt({ items, total, take, skip });
  });

  // Obtener uno
  app.get(`${basePath}/:id`, async (request) => {
    const { id } = request.params as { id: string };
    const item = await delegate.findUnique({
      where: { [idField]: parseId(id) },
      ...(include ? { include } : {}),
    } as never);
    if (!item) throw new NotFoundError(resource, id);
    return serializeBigInt(item);
  });

  // Crear
  if (allowCreate) {
    app.post(basePath, async (request, reply) => {
      const data = createSchema.parse(request.body) as Record<string, unknown>;
      const item = await delegate.create({ data });
      reply.code(201);
      return serializeBigInt(item);
    });
  }

  // Actualizar parcialmente
  if (allowUpdate) {
    app.patch(`${basePath}/:id`, async (request) => {
      const { id } = request.params as { id: string };
      const data = updateSchema.parse(request.body) as Record<string, unknown>;
      await ensureExists(delegate, idField, parseId(id), resource, id);
      const item = await delegate.update({ where: { [idField]: parseId(id) }, data });
      return serializeBigInt(item);
    });
  }

  // Borrar (no disponible en tablas de bitácora)
  if (allowDelete) {
    app.delete(`${basePath}/:id`, async (request, reply) => {
      const { id } = request.params as { id: string };
      await ensureExists(delegate, idField, parseId(id), resource, id);
      await delegate.delete({ where: { [idField]: parseId(id) } });
      reply.code(204);
      return null;
    });
  }
}

async function ensureExists(
  delegate: Delegate,
  idField: string,
  idValue: unknown,
  resource: string,
  raw: string,
): Promise<void> {
  const existing = await delegate.findUnique({ where: { [idField]: idValue } });
  if (!existing) throw new NotFoundError(resource, raw);
}

/** Convierte el :id de la URL a bigint, para las tablas de bitácora (bigserial). */
export function parseBigIntId(raw: string): bigint {
  try {
    return BigInt(raw);
  } catch {
    throw new NotFoundError("recurso", raw);
  }
}
