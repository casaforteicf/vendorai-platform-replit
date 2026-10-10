-- ATR-01: atribuição de origem por identidade, sem dependência de sessão/browser.
-- A migração é aditiva: não altera ou remove estruturas de comissão preexistentes.
CREATE TABLE IF NOT EXISTS public.atr_identity_origins (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  identity_kind text NOT NULL CHECK (identity_kind IN ('person','organization')),
  identity_id text NOT NULL,
  origin_tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  origin_partner_id text,
  attribution_method text NOT NULL CHECK (attribution_method IN ('invitation','partner_link','qr','partner_portal','admin_verified')),
  attribution_reference text,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atr_identity_origins_identity_uniq UNIQUE (identity_kind, identity_id),
  CONSTRAINT atr_identity_origins_nonempty_identity CHECK (length(trim(identity_id)) > 0)
);
CREATE INDEX IF NOT EXISTS atr_identity_origins_tenant_idx
  ON public.atr_identity_origins(origin_tenant_id);

CREATE TABLE IF NOT EXISTS public.atr_origin_agreements (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  origin_tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  origin_partner_id text,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended','retired')),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  currency text NOT NULL DEFAULT 'BRL',
  commission_basis text NOT NULL DEFAULT 'platform_net_commission_received'
    CHECK (commission_basis = 'platform_net_commission_received'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atr_origin_agreements_valid_period CHECK (effective_until IS NULL OR effective_until > effective_from),
  CONSTRAINT atr_origin_agreements_version_positive CHECK (version > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS atr_origin_agreements_partner_version_uniq\n  ON public.atr_origin_agreements(origin_tenant_id, COALESCE(origin_partner_id, ''), version);\nCREATE TABLE IF NOT EXISTS public.atr_origin_agreement_categories (
  agreement_id text NOT NULL REFERENCES public.atr_origin_agreements(id) ON DELETE RESTRICT,
  category_code text NOT NULL,
  share_percent numeric(7,4) NOT NULL CHECK (share_percent >= 0 AND share_percent <= 100),
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY(agreement_id, category_code),
  CONSTRAINT atr_origin_category_nonempty CHECK(length(trim(category_code)) > 0)
);
CREATE INDEX IF NOT EXISTS atr_origin_agreements_lookup_idx
  ON public.atr_origin_agreements(origin_tenant_id, status, effective_from);

-- Apenas backend autorizado com conexão privilegiada pode operar no núcleo de atribuição.
-- Nenhum acesso genérico via cliente Supabase.
ALTER TABLE public.atr_identity_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atr_origin_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atr_origin_agreement_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atr_identity_origins FROM anon, authenticated;
REVOKE ALL ON public.atr_origin_agreements FROM anon, authenticated;
REVOKE ALL ON public.atr_origin_agreement_categories FROM anon, authenticated;
