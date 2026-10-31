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

export const swaggerSpec: OpenAPIV3.Document = {
  openapi: "3.0.3",
  info: {
    title: "Lupe API – Asisco Up",
    version: "1.0.0",
    description:
      "API REST del sistema de gestión de convocatorias para la fundación Asisco Up (Manizales). " +
      "Incluye fuentes de datos, convocatorias con ciclo de vida, postulaciones, resultados, adjudicaciones, " +
      "documentos y recordatorios.",
    contact: { name: "Equipo Integrador" },
  },
  servers: [
    { url: "http://localhost:3000", description: "Desarrollo local" },
    { url: process.env.PUBLIC_URL ?? "https://lupe-api.onrender.com", description: "Producción" },
  ],
  components: {
    securitySchemes: {
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "Clave de API requerida en todos los endpoints (excepto /health).",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string", example: "NotFoundError" },
          message: { type: "string", example: "convocatoria con id X no existe" },
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
  security: [{ apiKey: [] }],
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
