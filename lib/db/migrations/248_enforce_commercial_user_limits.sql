-- Enforce the commercial user policy at the database boundary so every user
-- creation path (invite, admin, import, future APIs) obeys the same rule.
-- Growth remains unlimited.

UPDATE commercial_product_profiles
SET max_users = 1, updated_at = now()
WHERE commercial_key = 'vendor.crm.free';

UPDATE commercial_product_profiles
SET max_users = 5, updated_at = now()
WHERE commercial_key = 'vendor.crm';

UPDATE commercial_product_profiles
SET max_users = NULL, updated_at = now()
WHERE commercial_key = 'vendor.growth';

CREATE OR REPLACE FUNCTION tenant_effective_user_limit(p_tenant_id text)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_limit integer;
BEGIN
  -- Growth has precedence and is intentionally unlimited.
  IF EXISTS (
    SELECT 1
    FROM tenant_entitlements e
    WHERE e.tenant_id = p_tenant_id
      AND e.commercial_key = 'vendor.growth'
      AND e.active = true
      AND e.starts_at <= now()
      AND (e.ends_at IS NULL OR e.ends_at > now())
  ) THEN
    RETURN NULL;
  END IF;

  -- Paid CRM/team entitlement. The limit is data-driven from the commercial
  -- profile, currently 5 users.
  SELECT p.max_users INTO v_limit
  FROM tenant_entitlements e
  JOIN commercial_product_profiles p
    ON p.commercial_key = e.commercial_key
  WHERE e.tenant_id = p_tenant_id
    AND e.commercial_key = 'vendor.crm'
    AND e.active = true
    AND e.starts_at <= now()
    AND (e.ends_at IS NULL OR e.ends_at > now())
    AND p.active = true
  ORDER BY e.starts_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_limit;
  END IF;

  -- CRM Free: complete CRM, one active user.
  SELECT p.max_users INTO v_limit
  FROM tenant_entitlements e
  JOIN commercial_product_profiles p
    ON p.commercial_key = e.commercial_key
  WHERE e.tenant_id = p_tenant_id
    AND e.commercial_key = 'vendor.crm.free'
    AND e.active = true
    AND e.starts_at <= now()
    AND (e.ends_at IS NULL OR e.ends_at > now())
    AND p.active = true
  ORDER BY e.starts_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_limit;
  END IF;

  -- Compatibility fallback while old plan_id remains present during rollout.
  SELECT p.max_users INTO v_limit
  FROM tenants t
  LEFT JOIN plans p ON p.id = t.plan_id
  WHERE t.id = p_tenant_id
  LIMIT 1;

  RETURN v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_tenant_user_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit integer;
  v_active_users integer;
BEGIN
  -- Disabled users do not consume a seat.
  IF NEW.tenant_id IS NULL OR COALESCE(NEW.active, true) = false THEN
    RETURN NEW;
  END IF;

  v_limit := tenant_effective_user_limit(NEW.tenant_id);

  -- NULL means unlimited (Growth or a deliberately unlimited legacy policy).
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::integer INTO v_active_users
  FROM users u
  WHERE u.tenant_id = NEW.tenant_id
    AND u.active = true
    AND (TG_OP = 'INSERT' OR u.id <> NEW.id);

  IF v_active_users >= v_limit THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'USER_LIMIT_REACHED',
      DETAIL = format('Tenant %s allows %s active user(s).', NEW.tenant_id, v_limit),
      HINT = 'Upgrade the CRM entitlement or activate Growth to add more users.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_user_limit ON users;
CREATE TRIGGER trg_enforce_tenant_user_limit
BEFORE INSERT OR UPDATE OF tenant_id, active ON users
FOR EACH ROW
EXECUTE FUNCTION enforce_tenant_user_limit();
