-- ATR-02: allocation ledger; additive, does not touch legacy commission tables.
CREATE TABLE IF NOT EXISTS public.atr_commission_allocations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  origin_id text NOT NULL REFERENCES public.atr_identity_origins(id) ON DELETE RESTRICT,
  agreement_id text NOT NULL REFERENCES public.atr_origin_agreements(id) ON DELETE RESTRICT,
  beneficiary_tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  source_tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  source_type text NOT NULL,
  source_id text NOT NULL,
  receipt_id text NOT NULL,
  category_code text NOT NULL,
  agreement_version integer NOT NULL,
  received_platform_commission_cents bigint NOT NULL CHECK(received_platform_commission_cents >= 0),
  share_percent numeric(7,4) NOT NULL CHECK(share_percent BETWEEN 0 AND 100),
  allocated_cents bigint NOT NULL CHECK(allocated_cents >= 0 AND allocated_cents <= received_platform_commission_cents),
  status text NOT NULL DEFAULT 'accrued' CHECK(status IN ('accrued','approved','paid','reversed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_tenant_id, receipt_id, origin_id, agreement_id)
);
CREATE TABLE IF NOT EXISTS public.atr_commission_adjustments (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  allocation_id text NOT NULL REFERENCES public.atr_commission_allocations(id) ON DELETE RESTRICT,
  adjustment_type text NOT NULL CHECK(adjustment_type IN ('refund','chargeback','manual_correction')),
  external_reference text NOT NULL,
  delta_cents bigint NOT NULL CHECK(delta_cents <> 0),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(allocation_id, adjustment_type, external_reference)
);
CREATE INDEX IF NOT EXISTS atr_commission_allocations_beneficiary_idx
 ON public.atr_commission_allocations(beneficiary_tenant_id,status,created_at);
ALTER TABLE public.atr_commission_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atr_commission_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atr_commission_allocations FROM anon, authenticated;
REVOKE ALL ON public.atr_commission_adjustments FROM anon, authenticated;
