ALTER TABLE "obra_orcamentos" ADD COLUMN IF NOT EXISTS "modo_precificacao" text DEFAULT 'bdi' NOT NULL;
ALTER TABLE "obra_orcamentos" ADD COLUMN IF NOT EXISTS "custos_indiretos_pct" numeric(6, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "obra_orcamentos" ADD COLUMN IF NOT EXISTS "administracao_pct" numeric(6, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "obra_orcamentos" ADD COLUMN IF NOT EXISTS "risco_pct" numeric(6, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "obra_orcamentos" ADD COLUMN IF NOT EXISTS "financeiro_pct" numeric(6, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "obra_orcamentos" ADD COLUMN IF NOT EXISTS "impostos_pct" numeric(6, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "obra_orcamentos" ADD COLUMN IF NOT EXISTS "comissao_pct" numeric(6, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "obra_orcamentos" ADD COLUMN IF NOT EXISTS "margem_pct" numeric(6, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "obra_orcamentos" ADD COLUMN IF NOT EXISTS "desconto_pct" numeric(6, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "obra_orcamentos" ADD COLUMN IF NOT EXISTS "area_referencia" numeric(15, 2);

ALTER TABLE "obra_orcamento_itens" ADD COLUMN IF NOT EXISTS "codigo" text;
ALTER TABLE "obra_orcamento_itens" ADD COLUMN IF NOT EXISTS "composicao_id" text;
ALTER TABLE "obra_orcamento_itens" ADD COLUMN IF NOT EXISTS "origem" text DEFAULT 'manual' NOT NULL;
ALTER TABLE "obra_orcamento_itens" ADD COLUMN IF NOT EXISTS "origem_referencia" text;

CREATE INDEX IF NOT EXISTS "obra_orcamento_itens_composicao_id_idx" ON "obra_orcamento_itens" ("composicao_id");
