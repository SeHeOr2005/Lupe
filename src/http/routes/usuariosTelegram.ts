import type { FastifyInstance } from "fastify";
import { prisma } from "../../db/prisma.js";
import {
  createUsuarioTelegramSchema,
  updateUsuarioTelegramSchema,
} from "../../schemas/usuarioTelegram.js";
import { registerCrudRoutes } from "../crud.js";

export function registerUsuariosTelegramRoutes(app: FastifyInstance) {
  registerCrudRoutes(app, {
    resource: "usuario_telegram",
    basePath: "/usuarios-telegram",
    delegate: prisma.usuarioTelegram,
    createSchema: createUsuarioTelegramSchema,
    updateSchema: updateUsuarioTelegramSchema,
    defaultOrderBy: { nombre: "asc" },
    buildWhere: (q) => ({
      ...(q.activo !== undefined ? { activo: q.activo === "true" } : {}),
      ...(q.rol ? { rol: q.rol } : {}),
    }),
  });
}
