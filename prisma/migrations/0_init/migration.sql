-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "modo_fuente" AS ENUM ('api', 'pagina_unica', 'exploracion');

-- CreateEnum
CREATE TYPE "estado_escaneo" AS ENUM ('ok', 'sin_cambios', 'error');

-- CreateEnum
CREATE TYPE "estado_convocatoria" AS ENUM ('detectada', 'pendiente_aprobacion', 'aprobada', 'en_postulacion', 'postulada', 'ganada', 'no_ganada', 'no_apta', 'descartada', 'vencida');

-- CreateEnum
CREATE TYPE "origen_evento" AS ENUM ('sistema', 'usuaria');

-- CreateEnum
CREATE TYPE "estado_resultado" AS ENUM ('pendiente', 'ganada', 'no_ganada');

-- CreateEnum
CREATE TYPE "tipo_documento" AS ENUM ('rut', 'certificado_existencia_representacion', 'cedula_representante_legal', 'certificado_antecedentes_fiscales', 'certificado_antecedentes_disciplinarios', 'certificado_antecedentes_judiciales', 'estados_financieros', 'hoja_vida_entidad', 'otro');

-- CreateEnum
CREATE TYPE "estado_documento_convocatoria" AS ENUM ('pendiente', 'listo', 'no_aplica');

-- CreateTable
CREATE TABLE "fuentes" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "url_base" TEXT NOT NULL,
    "modo" "modo_fuente" NOT NULL,
    "dominios_permitidos" TEXT[],
    "max_paginas" SMALLINT NOT NULL DEFAULT 10,
    "cron" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "hash_contenido" TEXT,
    "ultimo_escaneo_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fuentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escaneos" (
    "id" BIGSERIAL NOT NULL,
    "fuente_id" UUID NOT NULL,
    "inicio_at" TIMESTAMPTZ(6) NOT NULL,
    "fin_at" TIMESTAMPTZ(6),
    "estado" "estado_escaneo" NOT NULL,
    "paginas_visitadas" INTEGER NOT NULL DEFAULT 0,
    "convocatorias_nuevas" INTEGER NOT NULL DEFAULT 0,
    "tokens_usados" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "escaneos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordatorios" (
    "id" BIGSERIAL NOT NULL,
    "convocatoria_id" UUID NOT NULL,
    "dias_antes" SMALLINT NOT NULL,
    "enviado_at" TIMESTAMPTZ(6),

    CONSTRAINT "recordatorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_fundacion" (
    "id" UUID NOT NULL,
    "tipo" "tipo_documento" NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha_expedicion" DATE,
    "fecha_vencimiento" DATE,
    "telegram_file_id" TEXT,
    "url_archivo" TEXT,
    "notas" TEXT,

    CONSTRAINT "documentos_fundacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convocatoria_documentos" (
    "id" UUID NOT NULL,
    "convocatoria_id" UUID NOT NULL,
    "tipo" "tipo_documento" NOT NULL,
    "descripcion" TEXT,
    "estado" "estado_documento_convocatoria" NOT NULL DEFAULT 'pendiente',
    "documento_id" UUID,

    CONSTRAINT "convocatoria_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convocatorias" (
    "id" UUID NOT NULL,
    "fuente_id" UUID NOT NULL,
    "huella" TEXT NOT NULL,
    "numero_proceso" TEXT,
    "titulo" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "url_origen" TEXT NOT NULL,
    "resumen" TEXT,
    "fecha_apertura" DATE,
    "fecha_cierre" TIMESTAMPTZ(6),
    "fecha_resultado_estimada" DATE,
    "monto_maximo" DECIMAL(14,2),
    "requisitos" JSONB,
    "analisis_ia" JSONB,
    "estado" "estado_convocatoria" NOT NULL DEFAULT 'detectada',
    "aprobada_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "convocatorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convocatoria_pasos" (
    "id" UUID NOT NULL,
    "convocatoria_id" UUID NOT NULL,
    "orden" SMALLINT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "url_referencia" TEXT,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "completado_at" TIMESTAMPTZ(6),

    CONSTRAINT "convocatoria_pasos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convocatoria_eventos" (
    "id" BIGSERIAL NOT NULL,
    "convocatoria_id" UUID NOT NULL,
    "estado_anterior" "estado_convocatoria",
    "estado_nuevo" "estado_convocatoria" NOT NULL,
    "origen" "origen_evento" NOT NULL,
    "nota" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convocatoria_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postulaciones" (
    "id" UUID NOT NULL,
    "convocatoria_id" UUID NOT NULL,
    "fecha_radicacion" DATE NOT NULL,
    "numero_radicado" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "postulaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resultados" (
    "id" UUID NOT NULL,
    "postulacion_id" UUID NOT NULL,
    "estado" "estado_resultado" NOT NULL DEFAULT 'pendiente',
    "fecha_resultado" DATE,
    "observaciones" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "resultados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjudicaciones" (
    "id" UUID NOT NULL,
    "resultado_id" UUID NOT NULL,
    "resultado_estado" "estado_resultado" NOT NULL DEFAULT 'ganada',
    "monto_adjudicado" DECIMAL(14,2) NOT NULL,
    "monto_recibido" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "moneda" CHAR(3) NOT NULL DEFAULT 'COP',
    "fecha_adjudicacion" DATE,
    "entidad_otorgante" TEXT,
    "referencia_acto" TEXT,
    "observaciones" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adjudicaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "escaneos_fuente_id_idx" ON "escaneos"("fuente_id");

-- CreateIndex
CREATE UNIQUE INDEX "recordatorios_convocatoria_id_dias_antes_key" ON "recordatorios"("convocatoria_id", "dias_antes");

-- CreateIndex
CREATE INDEX "documentos_fundacion_tipo_idx" ON "documentos_fundacion"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "convocatoria_documentos_convocatoria_id_tipo_key" ON "convocatoria_documentos"("convocatoria_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "convocatorias_huella_key" ON "convocatorias"("huella");

-- CreateIndex
CREATE INDEX "convocatorias_estado_idx" ON "convocatorias"("estado");

-- CreateIndex
CREATE INDEX "convocatorias_fecha_cierre_idx" ON "convocatorias"("fecha_cierre");

-- CreateIndex
CREATE UNIQUE INDEX "convocatoria_pasos_convocatoria_id_orden_key" ON "convocatoria_pasos"("convocatoria_id", "orden");

-- CreateIndex
CREATE INDEX "convocatoria_eventos_convocatoria_id_idx" ON "convocatoria_eventos"("convocatoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "postulaciones_convocatoria_id_key" ON "postulaciones"("convocatoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "resultados_postulacion_id_key" ON "resultados"("postulacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "resultados_id_estado_key" ON "resultados"("id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "adjudicaciones_resultado_id_resultado_estado_key" ON "adjudicaciones"("resultado_id", "resultado_estado");

-- AddForeignKey
ALTER TABLE "escaneos" ADD CONSTRAINT "escaneos_fuente_id_fkey" FOREIGN KEY ("fuente_id") REFERENCES "fuentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_convocatoria_id_fkey" FOREIGN KEY ("convocatoria_id") REFERENCES "convocatorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convocatoria_documentos" ADD CONSTRAINT "convocatoria_documentos_convocatoria_id_fkey" FOREIGN KEY ("convocatoria_id") REFERENCES "convocatorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convocatoria_documentos" ADD CONSTRAINT "convocatoria_documentos_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos_fundacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convocatorias" ADD CONSTRAINT "convocatorias_fuente_id_fkey" FOREIGN KEY ("fuente_id") REFERENCES "fuentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convocatoria_pasos" ADD CONSTRAINT "convocatoria_pasos_convocatoria_id_fkey" FOREIGN KEY ("convocatoria_id") REFERENCES "convocatorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convocatoria_eventos" ADD CONSTRAINT "convocatoria_eventos_convocatoria_id_fkey" FOREIGN KEY ("convocatoria_id") REFERENCES "convocatorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postulaciones" ADD CONSTRAINT "postulaciones_convocatoria_id_fkey" FOREIGN KEY ("convocatoria_id") REFERENCES "convocatorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultados" ADD CONSTRAINT "resultados_postulacion_id_fkey" FOREIGN KEY ("postulacion_id") REFERENCES "postulaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adjudicaciones" ADD CONSTRAINT "adjudicaciones_resultado_id_resultado_estado_fkey" FOREIGN KEY ("resultado_id", "resultado_estado") REFERENCES "resultados"("id", "estado") ON DELETE RESTRICT ON UPDATE CASCADE;

