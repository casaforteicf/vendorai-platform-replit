-- Oportunidades importadas do Scout entravam como "em_negociacao" mesmo sem
-- proposta ou negócio de fato associado. "em_negociacao" fica reservado para
-- registros que realmente têm um documento/processo comercial anexado.
--
-- Extraído do compat DDL que vivia em artifacts/api-server/src/index.ts
-- (rodava a cada boot da API). Agora é uma migration versionada normal:
-- roda uma vez, fica registrada em vendorai_schema_migrations, e a API só
-- verifica se já foi aplicada (ver isMigrationApplied em lib/db/src/index.ts).
DO $$
BEGIN
  IF to_regclass('public.scout_oportunidades') IS NOT NULL
    AND (SELECT count(*) = 5 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'scout_oportunidades'
           AND column_name IN ('pipeline_stage', 'approved_by', 'approved_at', 'proposta_id', 'deal_id'))
  THEN
    UPDATE scout_oportunidades
    SET status = 'pendente',
        pipeline_stage = 'identificada',
        approved_by = NULL,
        approved_at = NULL
    WHERE status = 'em_negociacao'
      AND proposta_id IS NULL
      AND deal_id IS NULL;
  END IF;
END $$;
