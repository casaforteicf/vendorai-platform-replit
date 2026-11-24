-- 569_insumos_catalogo_restaurante.sql
--
-- O catálogo `insumos` é compartilhado por construção e Restaurante/A&B.
-- Sem uma marcação explícita, o de-para do Restaurante lista aço, argamassa,
-- mão de obra etc. no mesmo select dos alimentos.
--
-- `catalogo` separa os dois catálogos:
--   construcao (default, preserva os itens existentes)
--   restaurante (ingredientes cadastrados/importados pelo Restaurante)
--
-- Backfill: itens já usados por ficha técnica ou por de-para produto→insumo
-- são alimentos e viram `restaurante`. O restante continua `construcao`.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

ALTER TABLE "insumos"
  ADD COLUMN IF NOT EXISTS "catalogo" text NOT NULL DEFAULT 'construcao';

UPDATE "insumos" i
SET "catalogo" = 'restaurante'
WHERE i."catalogo" = 'construcao'
  AND (
    EXISTS (
      SELECT 1 FROM "ab_ficha_insumos" fi
      WHERE fi."tenant_id" = i."tenant_id" AND fi."insumo_id" = i."id"
    )
    OR EXISTS (
      SELECT 1 FROM "ab_insumo_produto" m
      WHERE m."tenant_id" = i."tenant_id" AND m."insumo_id" = i."id"
    )
  );

CREATE INDEX IF NOT EXISTS "insumos_tenant_catalogo_idx"
  ON "insumos" ("tenant_id", "catalogo");
