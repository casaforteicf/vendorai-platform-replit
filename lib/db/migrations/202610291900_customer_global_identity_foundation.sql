-- Portal Unificado V1: additive foundation only.
-- Does NOT migrate legacy credentials, auto-link tenants, or change current login.
-- IMPORTANT: keep RLS enabled and grant no app access until secure API and policies are reviewed.
CREATE TABLE IF NOT EXISTS public.customer_global_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL,
  email_verified_at timestamptz,
  display_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_global_identity_email_normalized CHECK (
    email_normalized = lower(btrim(email_normalized))
    AND length(email_normalized) BETWEEN 3 AND 320
  ),
  CONSTRAINT customer_global_identity_email_unique UNIQUE (email_normalized)
);

-- An association is created ONLY after separately verified customer consent.
CREATE TABLE IF NOT EXISTS public.customer_global_tenant_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_identity_id uuid NOT NULL REFERENCES public.customer_global_identities(id) ON DELETE RESTRICT,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  legacy_portal_user_id text NOT NULL REFERENCES public.customer_portal_users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','revoked')),
  verified_at timestamptz,
  verification_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_global_tenant_verified_requires_evidence CHECK (
    status <> 'verified' OR (verified_at IS NOT NULL AND verification_method IS NOT NULL)
  ),
  CONSTRAINT customer_global_tenant_link_unique_user UNIQUE (legacy_portal_user_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_global_links_identity
  ON public.customer_global_tenant_links(global_identity_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_global_links_tenant
  ON public.customer_global_tenant_links(tenant_id, status);

-- Integrity: legacy portal account must be owned by the same tenant as the link.
CREATE OR REPLACE FUNCTION public.guard_customer_global_tenant_link()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_portal_users u
    WHERE u.id = NEW.legacy_portal_user_id AND u.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Legacy account and tenant mismatch';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_customer_global_tenant_link ON public.customer_global_tenant_links;
CREATE TRIGGER trg_guard_customer_global_tenant_link
BEFORE INSERT OR UPDATE OF legacy_portal_user_id, tenant_id
ON public.customer_global_tenant_links FOR EACH ROW
EXECUTE FUNCTION public.guard_customer_global_tenant_link();

ALTER TABLE public.customer_global_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_global_tenant_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_global_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customer_global_tenant_links FORCE ROW LEVEL SECURITY;

-- Intentionally NO policies and NO GRANT to vendorai_app / anon / authenticated:
-- default-deny until a vetted global identity service and consent flow are built.
-- No existing table, policy, session or password is modified.

-- Single-use account-link challenges, bound to the authenticated global identity
-- AND a legacy user in its original tenant. Only an audited privileged backend
-- service can issue/consume them; no direct client grants are created.
CREATE TABLE IF NOT EXISTS public.customer_global_link_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_identity_id uuid NOT NULL REFERENCES public.customer_global_identities(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  legacy_portal_user_id text NOT NULL REFERENCES public.customer_portal_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_global_challenge_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT customer_global_challenge_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_customer_global_challenge_target
  ON public.customer_global_link_challenges(global_identity_id, tenant_id, legacy_portal_user_id, expires_at);
ALTER TABLE public.customer_global_link_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_global_link_challenges FORCE ROW LEVEL SECURITY;
-- Intentionally zero RLS policies / zero GRANT to application role.

-- Global login tokens: never reusable as a tenant resource grant.
CREATE TABLE IF NOT EXISTS public.customer_global_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_identity_id uuid NOT NULL REFERENCES public.customer_global_identities(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_customer_global_sessions_identity ON public.customer_global_sessions(global_identity_id,expires_at);
ALTER TABLE public.customer_global_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_global_sessions FORCE ROW LEVEL SECURITY;
-- No RLS policy or public application grants; dedicated reviewed backend only.

-- Dormant credentials for verified global customer identities.
-- No HTTP registration or app grants. Never copy legacy tenant password hashes.
CREATE TABLE IF NOT EXISTS public.customer_global_credentials (
  global_identity_id uuid PRIMARY KEY REFERENCES public.customer_global_identities(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_global_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_global_credentials FORCE ROW LEVEL SECURITY;
-- No RLS policy and no vendorai_app/anon/authenticated grants.

-- Single-use global email verification. Created only by privileged service.
CREATE TABLE IF NOT EXISTS public.customer_global_email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_identity_id uuid NOT NULL REFERENCES public.customer_global_identities(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_customer_global_email_verifications_identity
  ON public.customer_global_email_verifications(global_identity_id,expires_at);
ALTER TABLE public.customer_global_email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_global_email_verifications FORCE ROW LEVEL SECURITY;
-- No app role grants, no RLS policies, no automated email delivery enabled here.
