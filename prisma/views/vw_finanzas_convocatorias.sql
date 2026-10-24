-- Vista de solo lectura para Finanzas (ver README § Arquitectura y doc "06 · Modelo de datos").
-- Prisma no modela vistas en el schema; se crea aparte, después de `prisma migrate deploy`:
--   psql "$DATABASE_URL" -f prisma/views/vw_finanzas_convocatorias.sql
--
-- v2: ya no existe la tabla `desembolsos`; monto_recibido vive directo en `adjudicaciones`
-- (ver comentario en prisma/schema.prisma), así que la vista hace LEFT JOIN de 4 tablas,
-- tal como dice el diagrama.

CREATE OR REPLACE VIEW vw_finanzas_convocatorias AS
SELECT
  c.id AS convocatoria_id,
  c.numero_proceso,
  c.titulo,
  c.entidad,
  c.estado,
  p.fecha_radicacion,
  r.estado AS resultado,
  a.monto_adjudicado,
  a.moneda,
  a.fecha_adjudicacion,
  a.monto_recibido,
  (a.monto_adjudicado - a.monto_recibido) AS saldo_por_recibir
FROM convocatorias c
LEFT JOIN postulaciones p ON p.convocatoria_id = c.id
LEFT JOIN resultados r ON r.postulacion_id = p.id
LEFT JOIN adjudicaciones a ON a.resultado_id = r.id
WHERE c.estado IN ('postulada', 'ganada', 'no_ganada');

-- Permisos sugeridos (ver "Roles de base de datos" en el doc de diseño):
-- GRANT SELECT ON vw_finanzas_convocatorias TO lupe_finanzas;
-- GRANT SELECT ON adjudicaciones TO lupe_finanzas;
