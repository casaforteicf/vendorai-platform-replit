-- Keep PostgreSQL enum aligned with the TypeScript AiFeature contract.
-- ADD VALUE IF NOT EXISTS is safe and does not alter existing rows.

ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'agent_financeiro';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'agent_cobranca';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'spin_briefing';
ALTER TYPE ai_feature ADD VALUE IF NOT EXISTS 'churn_retention';
