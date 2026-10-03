-- Central de Evolução: schema definitivo e idempotência de PRs.
-- Toda alteração de schema deve ocorrer por migration, nunca em runtime.

ALTER TABLE admin_improvements
  ADD COLUMN IF NOT EXISTS change_scope text,
  ADD COLUMN IF NOT EXISTS scope_reason text,
  ADD COLUMN IF NOT EXISTS tenant_context_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS acceptance_criteria text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS risk_summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dependencies text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS admin_improvements_source_ref_idx
  ON admin_improvements(source_type, source_ref_id);

CREATE TABLE IF NOT EXISTS admin_improvement_pr_registry (
  pr_number integer PRIMARY KEY,
  improvement_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Preserva todo o histórico existente e aponta o registro canônico para a cópia mais recente.
INSERT INTO admin_improvement_pr_registry (pr_number, improvement_id, created_at, updated_at)
SELECT DISTINCT ON (pr_number)
       pr_number,
       id,
       now(),
       now()
  FROM admin_improvements
 WHERE pr_number IS NOT NULL
 ORDER BY pr_number, updated_at DESC, created_at DESC
ON CONFLICT (pr_number) DO UPDATE
SET improvement_id = EXCLUDED.improvement_id,
    updated_at = now();

CREATE INDEX IF NOT EXISTS admin_improvement_pr_registry_improvement_idx
  ON admin_improvement_pr_registry(improvement_id);
