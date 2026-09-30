-- ARQDOR RFQ guest suppliers and optional Vendor.ai conversion

ALTER TABLE public.arch_rfq_invitations
  ADD COLUMN IF NOT EXISTS supplier_email text,
  ADD COLUMN IF NOT EXISTS supplier_phone text,
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'registered',
  ADD COLUMN IF NOT EXISTS converted_tenant_id text,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='arch_rfq_invitations_access_mode_check'
  ) THEN
    ALTER TABLE public.arch_rfq_invitations
      ADD CONSTRAINT arch_rfq_invitations_access_mode_check
      CHECK (access_mode IN ('registered','guest','converted'));
  END IF;
END $$;

UPDATE public.arch_rfq_invitations i
SET supplier_email = COALESCE(i.supplier_email, f.email),
    supplier_phone = COALESCE(i.supplier_phone, f.telefone),
    access_mode = CASE WHEN i.supplier_id IS NULL THEN 'guest' ELSE 'registered' END
FROM public.fornecedores f
WHERE i.supplier_id=f.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_arch_rfq_guest_package_email
  ON public.arch_rfq_invitations(package_id, lower(supplier_email))
  WHERE supplier_id IS NULL AND supplier_email IS NOT NULL AND supplier_email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_arch_rfq_guest_package_phone
  ON public.arch_rfq_invitations(
    package_id,
    regexp_replace(COALESCE(supplier_phone,''),'[^0-9]','','g')
  )
  WHERE supplier_id IS NULL AND supplier_phone IS NOT NULL AND supplier_phone <> '';

CREATE INDEX IF NOT EXISTS idx_arch_rfq_invitations_converted_tenant
  ON public.arch_rfq_invitations(converted_tenant_id)
  WHERE converted_tenant_id IS NOT NULL;
