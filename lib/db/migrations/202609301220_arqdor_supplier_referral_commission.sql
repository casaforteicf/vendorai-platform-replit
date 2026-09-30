-- ARQDOR supplier referral attribution and activation commission

ALTER TABLE public.arch_rfq_invitations
  ADD COLUMN IF NOT EXISTS referrer_user_id text,
  ADD COLUMN IF NOT EXISTS referrer_partner_id text,
  ADD COLUMN IF NOT EXISTS referral_attributed_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_commission_id text;

CREATE INDEX IF NOT EXISTS idx_arch_rfq_invitations_referrer_user
  ON public.arch_rfq_invitations(referrer_user_id)
  WHERE referrer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_arch_rfq_invitations_referrer_partner
  ON public.arch_rfq_invitations(referrer_partner_id)
  WHERE referrer_partner_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_commission_rfq_activation
  ON public.partner_commissions(partner_id, tenant_id, tipo)
  WHERE tipo='rfq_supplier_activation';
