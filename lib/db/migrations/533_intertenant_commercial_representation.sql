-- Inter-tenant commercial representation, deal responsibility and synchronized commissions.
-- Default partnership commission is 15%, but each deal can override it.

CREATE TABLE IF NOT EXISTS public.tenant_commercial_partnerships (
  id text PRIMARY KEY,
  owner_tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'representante_comercial',
  status text NOT NULL DEFAULT 'active',
  default_commission_percent numeric(7,4) NOT NULL DEFAULT 15,
  default_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  authorized_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  distribution_mode text NOT NULL DEFAULT 'partner_queue',
  notes text,
  created_by_user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_commercial_partnership_distinct_tenants CHECK (owner_tenant_id <> partner_tenant_id),
  CONSTRAINT tenant_commercial_partnership_status_check CHECK (status IN ('active','inactive','suspended')),
  CONSTRAINT tenant_commercial_partnership_commission_check CHECK (default_commission_percent >= 0 AND default_commission_percent <= 100),
  CONSTRAINT tenant_commercial_partnership_permissions_array CHECK (jsonb_typeof(default_permissions) = 'array'),
  CONSTRAINT tenant_commercial_partnership_users_array CHECK (jsonb_typeof(authorized_user_ids) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_commercial_partnership_unique
  ON public.tenant_commercial_partnerships(owner_tenant_id, partner_tenant_id, relationship_type);
CREATE INDEX IF NOT EXISTS tenant_commercial_partnership_owner_idx
  ON public.tenant_commercial_partnerships(owner_tenant_id, status);
CREATE INDEX IF NOT EXISTS tenant_commercial_partnership_partner_idx
  ON public.tenant_commercial_partnerships(partner_tenant_id, status);

CREATE TABLE IF NOT EXISTS public.deal_tenant_participations (
  id text PRIMARY KEY,
  deal_id text NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  owner_tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partnership_id text REFERENCES public.tenant_commercial_partnerships(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'responsible',
  status text NOT NULL DEFAULT 'active',
  operational_user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  commission_type text NOT NULL DEFAULT 'percent',
  commission_percent numeric(7,4) NOT NULL DEFAULT 15,
  commission_fixed_amount numeric(14,2),
  shared_by_user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  shared_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_tenant_participation_distinct_tenants CHECK (owner_tenant_id <> partner_tenant_id),
  CONSTRAINT deal_tenant_participation_role_check CHECK (role IN ('responsible','participant')),
  CONSTRAINT deal_tenant_participation_status_check CHECK (status IN ('active','ended')),
  CONSTRAINT deal_tenant_participation_commission_type_check CHECK (commission_type IN ('percent','fixed')),
  CONSTRAINT deal_tenant_participation_commission_percent_check CHECK (commission_percent >= 0 AND commission_percent <= 100),
  CONSTRAINT deal_tenant_participation_permissions_array CHECK (jsonb_typeof(permissions) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS deal_tenant_participation_unique
  ON public.deal_tenant_participations(deal_id, partner_tenant_id);
CREATE INDEX IF NOT EXISTS deal_tenant_participation_partner_idx
  ON public.deal_tenant_participations(partner_tenant_id, status);
CREATE INDEX IF NOT EXISTS deal_tenant_participation_owner_idx
  ON public.deal_tenant_participations(owner_tenant_id, status);

CREATE TABLE IF NOT EXISTS public.intercompany_commissions (
  id text PRIMARY KEY,
  deal_id text NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  participation_id text NOT NULL REFERENCES public.deal_tenant_participations(id) ON DELETE CASCADE,
  payer_tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  beneficiary_tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  commission_type text NOT NULL DEFAULT 'percent',
  percent numeric(7,4) NOT NULL DEFAULT 15,
  fixed_amount numeric(14,2),
  base_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'prevista',
  due_at timestamptz,
  payer_title_id text REFERENCES public.erp_titulos(id) ON DELETE SET NULL,
  beneficiary_title_id text REFERENCES public.erp_titulos(id) ON DELETE SET NULL,
  adjusted_by_user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  adjustment_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intercompany_commission_distinct_tenants CHECK (payer_tenant_id <> beneficiary_tenant_id),
  CONSTRAINT intercompany_commission_type_check CHECK (commission_type IN ('percent','fixed')),
  CONSTRAINT intercompany_commission_percent_check CHECK (percent >= 0 AND percent <= 100),
  CONSTRAINT intercompany_commission_amounts_check CHECK (base_amount >= 0 AND amount >= 0 AND paid_amount >= 0),
  CONSTRAINT intercompany_commission_status_check CHECK (status IN ('prevista','confirmada','parcialmente_paga','paga','cancelada','contestada'))
);

CREATE UNIQUE INDEX IF NOT EXISTS intercompany_commission_participation_unique
  ON public.intercompany_commissions(participation_id);
CREATE INDEX IF NOT EXISTS intercompany_commission_payer_idx
  ON public.intercompany_commissions(payer_tenant_id, status);
CREATE INDEX IF NOT EXISTS intercompany_commission_beneficiary_idx
  ON public.intercompany_commissions(beneficiary_tenant_id, status);

CREATE TABLE IF NOT EXISTS public.intercompany_commission_payments (
  id text PRIMARY KEY,
  commission_id text NOT NULL REFERENCES public.intercompany_commissions(id) ON DELETE CASCADE,
  payer_tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  beneficiary_tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  payer_account text NOT NULL,
  beneficiary_account text NOT NULL,
  payment_method text,
  proof_url text,
  notes text,
  payer_payment_id text REFERENCES public.erp_pagamentos(id) ON DELETE SET NULL,
  beneficiary_payment_id text REFERENCES public.erp_pagamentos(id) ON DELETE SET NULL,
  paid_by_user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intercompany_commission_payment_amount_check CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS intercompany_commission_payment_commission_idx
  ON public.intercompany_commission_payments(commission_id, paid_at);
