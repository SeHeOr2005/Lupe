import type { OpenAPIV3 } from "openapi-types";

const paginatedResponse = (schemaRef: string): OpenAPIV3.SchemaObject => ({
  type: "object",
  properties: {
    items: { type: "array", items: { $ref: schemaRef } },
    total: { type: "integer", example: 1 },
    take: { type: "integer", example: 50 },
    skip: { type: "integer", example: 0 },
  },
});

const idParam: OpenAPIV3.ParameterObject = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
};

const paginationParams: OpenAPIV3.ParameterObject[] = [
  { name: "take", in: "query", schema: { type: "integer", default: 50, minimum: 1, maximum: 200 }, description: "Cantidad de resultados" },
  { name: "skip", in: "query", schema: { type: "integer", default: 0, minimum: 0 }, description: "Cuántos resultados saltear" },
];

const spec: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "Lupe API – Asisco Up",
    version: "1.0.0",
    description:
      "API REST del sistema de gestión de convocatorias para la fundación Asisco Up (Manizales). " +
      "Incluye fuentes de datos, convocatorias con ciclo de vida, postulaciones, resultados, adjudicaciones, " +
      "documentos y recordatorios. " +
      "**Autenticación:** toda ruta, salvo `/health`, `/api-docs*` y el webhook de Telegram, exige la clave " +
      "en el header `x-api-key` (o `Authorization: Bearer <clave>`). Sin ella responde `401`. " +
      "En Swagger UI usa el botón **Authorize**. " +
      "**Errores:** todos comparten el cuerpo `{ error, message, details? }`. `400` datos inválidos (zod), " +
      "`401` sin clave, `404` recurso inexistente, `409` transición o estado no permitido, `500` error interno. " +
      "**Integración:** otros servicios consumen Lupe por esta API REST con la API key; el bot de Telegram " +
      "es el cliente principal y comparte la misma base de datos.",
    contact: { name: "Equipo Integrador" },
  },
  servers: [
    // Swagger UI preselecciona el primer servidor: producción va primero.
    ...(process.env.PUBLIC_URL ? [{ url: process.env.PUBLIC_URL.replace(/\/$/, ""), description: "Producción" }] : []),
    { url: "http://localhost:3000", description: "Desarrollo local" },
  ],
  components: {
    securitySchemes: {
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "Clave de API requerida en todos los endpoints (excepto /health).",
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Alternativa a x-api-key: `Authorization: Bearer <API_KEY>`.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string", example: "NotFoundError" },
          message: { type: "string", example: "convocatoria con id X no existe" },
          details: { description: "Detalle opcional, p. ej. los errores de validación por campo." },
        },
      },
      Fuente: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          nombre: { type: "string", example: "SECOP II" },
          urlBase: { type: "string", format: "uri" },
          modo: { type: "string", enum: ["api", "pagina_unica", "exploracion"] },
          dominiosPermitidos: { type: "array", items: { type: "string" } },
          maxPaginas: { type: "integer", example: 10 },
          cron: { type: "string", example: "0 7 * * *" },
          activa: { type: "boolean", example: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      FuenteInput: {
        type: "object",
        required: ["nombre", "urlBase", "modo", "cron"],
        properties: {
          nombre: { type: "string", example: "SECOP II" },
          urlBase: { type: "string", format: "uri", example: "https://www.contratos.gov.co" },
          modo: { type: "string", enum: ["api", "pagina_unica", "exploracion"] },
          dominiosPermitidos: { type: "array", items: { type: "string" }, default: [] },
          maxPaginas: { type: "integer", minimum: 1, maximum: 50, default: 10 },
          cron: { type: "string", example: "0 7 * * *" },
          activa: { type: "boolean", default: true },
        },
      },
      Convocatoria: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          fuenteId: { type: "string", format: "uuid" },
          huella: { type: "string" },
          numeroProceso: { type: "string", example: "MC-001-2025" },
          titulo: { type: "string", example: "Apoyo a proyectos culturales 2025" },
          entidad: { type: "string", example: "Ministerio de Cultura" },
          urlOrigen: { type: "string", format: "uri" },
          resumen: { type: "string" },
          estado: {
            type: "string",
            enum: ["detectada","pendiente_aprobacion","aprobada","en_postulacion","postulada","ganada","no_ganada","no_apta","descartada","vencida"],
          },
          fechaApertura: { type: "string", format: "date-time", nullable: true },
          fechaCierre: { type: "string", format: "date-time", nullable: true },
          fechaResultadoEstimada: { type: "string", format: "date-time", nullable: true },
          montoMaximo: { type: "number", nullable: true },
          requisitos: {},
          analisisIa: {},
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ConvocatoriaInput: {
        type: "object",
        required: ["fuenteId", "huella", "titulo", "entidad", "urlOrigen"],
        properties: {
          fuenteId: { type: "string", format: "uuid" },
          huella: { type: "string", example: "secop-MC001-2025" },
          numeroProceso: { type: "string" },
          titulo: { type: "string" },
          entidad: { type: "string" },
          urlOrigen: { type: "string", format: "uri" },
          resumen: { type: "string" },
          fechaApertura: { type: "string", format: "date-time" },
          fechaCierre: { type: "string", format: "date-time" },
          fechaResultadoEstimada: { type: "string", format: "date-time" },
          montoMaximo: { type: "number", minimum: 0 },
          estadoInicial: { type: "string", enum: ["detectada", "no_apta"], default: "detectada" },
        },
      },
      ConvocatoriaEvento: {
        type: "object",
        properties: {
          id: { type: "string" },
          convocatoriaId: { type: "string", format: "uuid" },
          estadoAnterior: { type: "string", nullable: true },
          estadoNuevo: { type: "string" },
          origen: { type: "string", enum: ["sistema", "usuaria"] },
          nota: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      ConvocatoriaPaso: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          convocatoriaId: { type: "string", format: "uuid" },
          descripcion: { type: "string" },
          orden: { type: "integer" },
          completado: { type: "boolean" },
          completadoAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      Postulacion: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          convocatoriaId: { type: "string", format: "uuid" },
          fechaRadicacion: { type: "string", format: "date-time" },
          numeroRadicado: { type: "string", nullable: true },
          notas: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      PostulacionInput: {
        type: "object",
        required: ["convocatoriaId", "fechaRadicacion"],
        properties: {
          convocatoriaId: { type: "string", format: "uuid" },
          fechaRadicacion: { type: "string", format: "date-time" },
          numeroRadicado: { type: "string" },
          notas: { type: "string" },
        },
      },
      Resultado: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          postulacionId: { type: "string", format: "uuid" },
          estado: { type: "string", enum: ["pendiente", "ganada", "no_ganada"] },
          fechaResultado: { type: "string", format: "date-time", nullable: true },
          observaciones: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Adjudicacion: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          resultadoId: { type: "string", format: "uuid" },
          montoAdjudicado: { type: "number", example: 50000000 },
          montoRecibido: { type: "number", example: 0 },
          moneda: { type: "string", example: "COP" },
          fechaAdjudicacion: { type: "string", format: "date-time", nullable: true },
          entidadOtorgante: { type: "string", nullable: true },
          referenciaActo: { type: "string", nullable: true },
          observaciones: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      AdjudicacionInput: {
        type: "object",
        required: ["resultadoId", "montoAdjudicado"],
        properties: {
          resultadoId: { type: "string", format: "uuid" },
          montoAdjudicado: { type: "number", minimum: 0 },
          montoRecibido: { type: "number", minimum: 0, default: 0 },
          moneda: { type: "string", minLength: 3, maxLength: 3, default: "COP" },
          fechaAdjudicacion: { type: "string", format: "date-time" },
          entidadOtorgante: { type: "string" },
          referenciaActo: { type: "string" },
          observaciones: { type: "string" },
        },
      },
      DocumentoFundacion: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          tipo: {
            type: "string",
            enum: ["rut","certificado_existencia_representacion","cedula_representante_legal","certificado_antecedentes_fiscales","certificado_antecedentes_disciplinarios","certificado_antecedentes_judiciales","estados_financieros","hoja_vida_entidad","otro"],
          },
          nombre: { type: "string" },
          fechaExpedicion: { type: "string", format: "date-time", nullable: true },
          fechaVencimiento: { type: "string", format: "date-time", nullable: true },
          telegramFileId: { type: "string", nullable: true },
          urlArchivo: { type: "string", format: "uri", nullable: true },
          notas: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      DocumentoFundacionInput: {
        type: "object",
        required: ["tipo", "nombre"],
        properties: {
          tipo: {
            type: "string",
            enum: ["rut","certificado_existencia_representacion","cedula_representante_legal","certificado_antecedentes_fiscales","certificado_antecedentes_disciplinarios","certificado_antecedentes_judiciales","estados_financieros","hoja_vida_entidad","otro"],
          },
          nombre: { type: "string" },
          fechaExpedicion: { type: "string", format: "date-time" },
          fechaVencimiento: { type: "string", format: "date-time" },
          telegramFileId: { type: "string" },
          urlArchivo: { type: "string", format: "uri" },
          notas: { type: "string" },
        },
      },
      Recordatorio: {
        type: "object",
        properties: {
          id: { type: "string" },
          convocatoriaId: { type: "string", format: "uuid" },
          diasAntes: { type: "integer", enum: [1, 3, 7] },
          enviadoAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Escaneo: {
        type: "object",
        properties: {
          id: { type: "string" },
          fuenteId: { type: "string", format: "uuid" },
          estado: { type: "string", enum: ["pendiente", "en_curso", "completado", "fallido"] },
          hallazgos: { type: "integer" },
          error: { type: "string", nullable: true },
          iniciadoAt: { type: "string", format: "date-time", nullable: true },
          finalizadoAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "Datos inválidos (falló la validación)",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: "ValidationError", message: "El cuerpo de la petición no es válido.", details: { formErrors: [], fieldErrors: { titulo: ["Required"] } } } } },
      },
      Conflict: {
        description: "Conflicto con el estado actual del recurso (transición no permitida, ya registrado...)",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      ServerError: {
        description: "Error interno del servidor",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" }, example: { error: "InternalServerError", message: "Error interno del servidor." } } },
      },
      NotFound: {
        description: "Recurso no encontrado",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      Unauthorized: {
        description: "API key ausente o inválida",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
  security: [{ apiKey: [] }, { bearerAuth: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["Sistema"],
        summary: "Estado del servidor",
        description: "Ruta pública — no requiere API key.",
        security: [],
        responses: {
          200: { description: "Servidor activo", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string", example: "ok" }, env: { type: "string" } } } } } },
        },
      },
    },

    // ── Fuentes ────────────────────────────────────────────────────────────
    "/fuentes": {
      get: {
        tags: ["Fuentes"],
        summary: "Listar fuentes",
        parameters: [
          ...paginationParams,
          { name: "activa", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "modo", in: "query", schema: { type: "string", enum: ["api", "pagina_unica", "exploracion"] } },
        ],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: paginatedResponse("#/components/schemas/Fuente") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Fuentes"],
        summary: "Crear fuente",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/FuenteInput" } } } },
        responses: {
          201: { description: "Creada", content: { "application/json": { schema: { $ref: "#/components/schemas/Fuente" } } } },
          400: { description: "Datos inválidos" },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/fuentes/{id}": {
      get: {
        tags: ["Fuentes"],
        summary: "Obtener fuente",
        parameters: [idParam],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Fuente" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Fuentes"],
        summary: "Actualizar fuente (parcial)",
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/FuenteInput" } } } },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Fuente" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Fuentes"],
        summary: "Eliminar fuente",
        parameters: [idParam],
        responses: {
          204: { description: "Eliminada" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Convocatorias ───────────────────────────────────────────────────────
    "/convocatorias": {
      get: {
        tags: ["Convocatorias"],
        summary: "Listar convocatorias",
        parameters: [
          ...paginationParams,
          { name: "estado", in: "query", schema: { type: "string", enum: ["detectada","pendiente_aprobacion","aprobada","en_postulacion","postulada","ganada","no_ganada","no_apta","descartada","vencida"] } },
          { name: "fuenteId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: paginatedResponse("#/components/schemas/Convocatoria") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Convocatorias"],
        summary: "Crear convocatoria",
        description: "Crea la convocatoria. El campo `estadoInicial` decide si nace como `detectada` (por defecto) o `no_apta`.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ConvocatoriaInput" } } } },
        responses: {
          201: { description: "Creada", content: { "application/json": { schema: { $ref: "#/components/schemas/Convocatoria" } } } },
          400: { description: "Datos inválidos" },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/convocatorias/{id}": {
      get: {
        tags: ["Convocatorias"],
        summary: "Obtener convocatoria",
        parameters: [idParam],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Convocatoria" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Convocatorias"],
        summary: "Actualizar convocatoria (parcial)",
        description: "Solo actualiza campos de datos. Para cambiar de estado usa `POST /convocatorias/{id}/transiciones`.",
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ConvocatoriaInput" } } } },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Convocatoria" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Convocatorias"],
        summary: "Eliminar convocatoria",
        parameters: [idParam],
        responses: {
          204: { description: "Eliminada" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/convocatorias/{id}/eventos": {
      get: {
        tags: ["Convocatorias"],
        summary: "Historial de eventos de una convocatoria",
        parameters: [idParam],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/ConvocatoriaEvento" } } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/convocatorias/{id}/transiciones": {
      get: {
        tags: ["Convocatorias"],
        summary: "Transiciones válidas desde el estado actual",
        parameters: [idParam],
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    estadoActual: { type: "string" },
                    siguientes: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      post: {
        tags: ["Convocatorias"],
        summary: "Ejecutar una transición de estado",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["estado"],
                properties: {
                  estado: { type: "string", enum: ["detectada","pendiente_aprobacion","aprobada","en_postulacion","postulada","ganada","no_ganada","no_apta","descartada","vencida"] },
                  origen: { type: "string", enum: ["sistema", "usuaria"], default: "usuaria" },
                  nota: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Convocatoria" } } } },
          400: { description: "Transición no permitida" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/convocatorias/{id}/aprobar": {
      post: {
        tags: ["Convocatorias"],
        summary: "Aprobar convocatoria (directora)",
        description: "Atajo: mueve la convocatoria a `aprobada`. Equivale a POST /transiciones con estado=aprobada.",
        parameters: [idParam],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { nota: { type: "string" } } } } },
        },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Convocatoria" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/convocatorias/{id}/descartar": {
      post: {
        tags: ["Convocatorias"],
        summary: "Descartar convocatoria (directora)",
        description: "Atajo: mueve la convocatoria a `descartada`.",
        parameters: [idParam],
        requestBody: {
          content: { "application/json": { schema: { type: "object", properties: { nota: { type: "string" } } } } },
        },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Convocatoria" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/convocatorias/{id}/pasos": {
      get: {
        tags: ["Convocatorias"],
        summary: "Listar pasos de postulación",
        parameters: [idParam],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/ConvocatoriaPaso" } } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Convocatorias"],
        summary: "Agregar paso de postulación",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["descripcion", "orden"], properties: { descripcion: { type: "string" }, orden: { type: "integer" } } },
            },
          },
        },
        responses: {
          201: { description: "Creado", content: { "application/json": { schema: { $ref: "#/components/schemas/ConvocatoriaPaso" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/convocatorias/{id}/pasos/{pasoId}": {
      patch: {
        tags: ["Convocatorias"],
        summary: "Actualizar paso de postulación",
        parameters: [idParam, { name: "pasoId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", properties: { descripcion: { type: "string" }, orden: { type: "integer" }, completado: { type: "boolean" } } },
            },
          },
        },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ConvocatoriaPaso" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/convocatorias/{id}/pasos/{pasoId}/completar": {
      post: {
        tags: ["Convocatorias"],
        summary: "Marcar paso como completado",
        description: "Marca el paso y, si todos están listos, avanza la convocatoria de `aprobada` a `en_postulacion`.",
        parameters: [idParam, { name: "pasoId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ConvocatoriaPaso" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/convocatorias/{id}/documentos": {
      get: {
        tags: ["Convocatorias"],
        summary: "Documentos requeridos por la convocatoria",
        parameters: [idParam],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { type: "object" } } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    // ── Postulaciones ───────────────────────────────────────────────────────
    "/postulaciones": {
      get: {
        tags: ["Postulaciones"],
        summary: "Listar postulaciones",
        parameters: [...paginationParams, { name: "convocatoriaId", in: "query", schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: paginatedResponse("#/components/schemas/Postulacion") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Postulaciones"],
        summary: "Radicar postulación",
        description: "Crea la postulación + resultado pendiente y mueve la convocatoria de `en_postulacion` a `postulada`, todo en una transacción.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PostulacionInput" } } } },
        responses: {
          201: {
            description: "Radicada",
            content: {
              "application/json": {
                schema: { type: "object", properties: { postulacion: { $ref: "#/components/schemas/Postulacion" }, resultado: { $ref: "#/components/schemas/Resultado" } } },
              },
            },
          },
          400: { description: "Datos inválidos" },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/postulaciones/{id}": {
      get: {
        tags: ["Postulaciones"],
        summary: "Obtener postulación",
        parameters: [idParam],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Postulacion" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Postulaciones"],
        summary: "Actualizar postulación (parcial)",
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PostulacionInput" } } } },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Postulacion" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Resultados ──────────────────────────────────────────────────────────
    "/resultados": {
      get: {
        tags: ["Resultados"],
        summary: "Listar resultados",
        parameters: [
          ...paginationParams,
          { name: "estado", in: "query", schema: { type: "string", enum: ["pendiente", "ganada", "no_ganada"] } },
        ],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: paginatedResponse("#/components/schemas/Resultado") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/resultados/{id}": {
      get: {
        tags: ["Resultados"],
        summary: "Obtener resultado",
        parameters: [idParam],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Resultado" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/resultados/{id}/registrar": {
      post: {
        tags: ["Resultados"],
        summary: "Registrar resultado final",
        description: "Marca el resultado como ganada/no_ganada y avanza el estado de la convocatoria.",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["estado"],
                properties: {
                  estado: { type: "string", enum: ["ganada", "no_ganada"] },
                  observaciones: { type: "string" },
                  fechaResultado: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Resultado" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Adjudicaciones ──────────────────────────────────────────────────────
    "/adjudicaciones": {
      get: {
        tags: ["Adjudicaciones"],
        summary: "Listar adjudicaciones",
        parameters: paginationParams,
        responses: {
          200: { description: "OK", content: { "application/json": { schema: paginatedResponse("#/components/schemas/Adjudicacion") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Adjudicaciones"],
        summary: "Crear adjudicación",
        description: "Solo se puede adjudicar un resultado en estado `ganada`.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AdjudicacionInput" } } } },
        responses: {
          201: { description: "Creada", content: { "application/json": { schema: { $ref: "#/components/schemas/Adjudicacion" } } } },
          400: { description: "Datos inválidos" },
          401: { $ref: "#/components/responses/Unauthorized" },
          409: { description: "El resultado no está en estado 'ganada'" },
        },
      },
    },
    "/adjudicaciones/{id}": {
      get: {
        tags: ["Adjudicaciones"],
        summary: "Obtener adjudicación",
        parameters: [idParam],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Adjudicacion" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Adjudicaciones"],
        summary: "Actualizar adjudicación (parcial)",
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AdjudicacionInput" } } } },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Adjudicacion" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Adjudicaciones"],
        summary: "Eliminar adjudicación",
        parameters: [idParam],
        responses: {
          204: { description: "Eliminada" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Documentos fundación ────────────────────────────────────────────────
    "/documentos-fundacion": {
      get: {
        tags: ["Documentos"],
        summary: "Listar documentos de la fundación",
        parameters: [
          ...paginationParams,
          { name: "tipo", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: paginatedResponse("#/components/schemas/DocumentoFundacion") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Documentos"],
        summary: "Registrar documento de la fundación",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/DocumentoFundacionInput" } } } },
        responses: {
          201: { description: "Registrado", content: { "application/json": { schema: { $ref: "#/components/schemas/DocumentoFundacion" } } } },
          400: { description: "Datos inválidos" },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/documentos-fundacion/{id}": {
      get: {
        tags: ["Documentos"],
        summary: "Obtener documento",
        parameters: [idParam],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/DocumentoFundacion" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Documentos"],
        summary: "Actualizar documento (parcial)",
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/DocumentoFundacionInput" } } } },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/DocumentoFundacion" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Documentos"],
        summary: "Eliminar documento",
        parameters: [idParam],
        responses: {
          204: { description: "Eliminado" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Convocatoria-documentos ─────────────────────────────────────────────
    "/convocatoria-documentos": {
      get: {
        tags: ["Documentos"],
        summary: "Listar relaciones convocatoria-documento",
        parameters: [
          ...paginationParams,
          { name: "convocatoriaId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "estado", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: paginatedResponse("#/components/schemas/DocumentoFundacion") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Documentos"],
        summary: "Asociar documento a convocatoria",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["convocatoriaId"],
                properties: {
                  convocatoriaId: { type: "string", format: "uuid" },
                  documentoId: { type: "string", format: "uuid" },
                  nombre: { type: "string" },
                  estado: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Asociado" },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/convocatoria-documentos/{id}": {
      get: {
        tags: ["Documentos"],
        summary: "Obtener relación convocatoria-documento",
        parameters: [idParam],
        responses: {
          200: { description: "OK" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Documentos"],
        summary: "Actualizar relación convocatoria-documento",
        parameters: [idParam],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: {
          200: { description: "OK" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Documentos"],
        summary: "Eliminar relación convocatoria-documento",
        parameters: [idParam],
        responses: {
          204: { description: "Eliminada" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Recordatorios ───────────────────────────────────────────────────────
    "/recordatorios": {
      get: {
        tags: ["Recordatorios"],
        summary: "Listar recordatorios",
        parameters: [
          ...paginationParams,
          { name: "convocatoriaId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "pendientes", in: "query", schema: { type: "string", enum: ["true"] }, description: "Solo los no enviados" },
        ],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: paginatedResponse("#/components/schemas/Recordatorio") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Recordatorios"],
        summary: "Crear recordatorio",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["convocatoriaId", "diasAntes"],
                properties: {
                  convocatoriaId: { type: "string", format: "uuid" },
                  diasAntes: { type: "integer", enum: [1, 3, 7] },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Creado", content: { "application/json": { schema: { $ref: "#/components/schemas/Recordatorio" } } } },
          400: { description: "Datos inválidos" },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/recordatorios/{id}": {
      get: {
        tags: ["Recordatorios"],
        summary: "Obtener recordatorio",
        parameters: [idParam],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Recordatorio" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Recordatorios"],
        summary: "Actualizar recordatorio",
        parameters: [idParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { enviadoAt: { type: "string", format: "date-time" } } } } },
        },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Recordatorio" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Recordatorios"],
        summary: "Eliminar recordatorio",
        parameters: [idParam],
        responses: {
          204: { description: "Eliminado" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // ── Bitácora (readonly) ─────────────────────────────────────────────────
    "/convocatoria-eventos": {
      get: {
        tags: ["Bitácora"],
        summary: "Listar eventos de convocatorias",
        description: "Solo lectura — el sistema escribe estos registros automáticamente.",
        parameters: [
          ...paginationParams,
          { name: "convocatoriaId", in: "query", schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: paginatedResponse("#/components/schemas/ConvocatoriaEvento") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/convocatoria-eventos/{id}": {
      get: {
        tags: ["Bitácora"],
        summary: "Obtener evento de convocatoria",
        parameters: [idParam],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/ConvocatoriaEvento" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/escaneos": {
      get: {
        tags: ["Bitácora"],
        summary: "Listar escaneos de fuentes",
        description: "Solo lectura — el worker escribe estos registros.",
        parameters: [
          ...paginationParams,
          { name: "fuenteId", in: "query", schema: { type: "string", format: "uuid" } },
          { name: "estado", in: "query", schema: { type: "string", enum: ["pendiente", "en_curso", "completado", "fallido"] } },
        ],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: paginatedResponse("#/components/schemas/Escaneo") } } },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/escaneos/{id}": {
      get: {
        tags: ["Bitácora"],
        summary: "Obtener escaneo",
        parameters: [idParam],
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Escaneo" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
        },
      },
    },
  },
};

// Completa en cada operación los errores que la API realmente puede devolver
// (400 por validación, 404 por id inexistente, 409 por estado, 500 genérico)
// para no repetirlos a mano en las ~50 rutas.
const METODOS_CON_CUERPO = new Set(["post", "patch", "put"]);
const RUTAS_CON_CONFLICTO = [
  "/convocatorias/{id}/transiciones",
  "/convocatorias/{id}/aprobar",
  "/convocatorias/{id}/descartar",
  "/postulaciones",
  "/resultados/{id}/registrar",
  "/adjudicaciones",
];

spec.paths["/telegram/webhook"] = {
  post: {
    tags: ["Sistema"],
    summary: "Webhook de Telegram",
    description:
      "Lo llama Telegram, no los clientes de la API. Se protege con el header `X-Telegram-Bot-Api-Secret-Token` " +
      "(`TELEGRAM_WEBHOOK_SECRET`), no con la API key. Solo existe si hay `PUBLIC_URL` y secreto configurados.",
    security: [],
    requestBody: { content: { "application/json": { schema: { type: "object", description: "Update de Telegram" } } } },
    responses: { 200: { description: "Update procesado" }, 401: { description: "Secreto del webhook inválido" } },
  },
};

for (const [ruta, item] of Object.entries(spec.paths)) {
  for (const [metodo, op] of Object.entries(item ?? {})) {
    if (!op || typeof op !== "object" || !("responses" in op)) continue;
    const operacion = op as OpenAPIV3.OperationObject;
    const r = operacion.responses as Record<string, unknown>;
    const protegida = operacion.security === undefined || operacion.security.length > 0;
    if (protegida) r["401"] ??= { $ref: "#/components/responses/Unauthorized" };
    if (METODOS_CON_CUERPO.has(metodo) || (operacion.parameters ?? []).some((p) => "in" in p && p.in === "query"))
      r["400"] ??= { $ref: "#/components/responses/BadRequest" };
    if (ruta.includes("{") && ruta !== "/telegram/webhook") r["404"] ??= { $ref: "#/components/responses/NotFound" };
    if (RUTAS_CON_CONFLICTO.includes(ruta) && metodo === "post") r["409"] ??= { $ref: "#/components/responses/Conflict" };
    r["500"] ??= { $ref: "#/components/responses/ServerError" };
  }
}

export const swaggerSpec: OpenAPIV3.Document = spec;
