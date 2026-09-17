-- Bridge legacy tenants.plan_id into the new entitlement layer.
-- Existing plan assignments remain the billing/access source during rollout, but
-- the commercial UI/provisioning can now see CRM Free and Growth consistently.

CREATE OR REPLACE FUNCTION sync_tenant_plan_entitlement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan_slug text;
  v_commercial_key text;
  v_source text;
BEGIN
  -- Only touch entitlements created by this plan bridge. Purchased modules,
  -- prepaid passes, promotions and manual/courtesy grants stay untouched.
  UPDATE tenant_entitlements
     SET active = false,
         updated_at = now()
   WHERE tenant_id = NEW.id
     AND active = true
     AND metadata->>'planManaged' = 'true';

  IF NEW.plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT slug INTO v_plan_slug
  FROM plans
  WHERE id = NEW.plan_id
  LIMIT 1;

  CASE v_plan_slug
    WHEN 'start' THEN
      v_commercial_key := 'vendor.crm.free';
      v_source := 'free';
    WHEN 'growth' THEN
      v_commercial_key := 'vendor.growth';
      v_source := 'subscription';
    ELSE
      -- Historical inactive plans remain untouched by the new commercial model.
      RETURN NEW;
  END CASE;

  INSERT INTO tenant_entitlements (
    tenant_id,
    commercial_key,
    source,
    starts_at,
    ends_at,
    active,
    metadata
  ) VALUES (
    NEW.id,
    v_commercial_key,
    v_source,
    COALESCE(NEW.created_at, now()),
    NULL,
    true,
    jsonb_build_object(
      'planManaged', true,
      'planId', NEW.plan_id,
      'planSlug', v_plan_slug
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tenant_plan_entitlement ON tenants;
CREATE TRIGGER trg_sync_tenant_plan_entitlement
AFTER INSERT OR UPDATE OF plan_id ON tenants
FOR EACH ROW
EXECUTE FUNCTION sync_tenant_plan_entitlement();

-- Backfill the currently assigned Start/Growth tenants idempotently.
INSERT INTO tenant_entitlements (
  tenant_id,
  commercial_key,
  source,
  starts_at,
  ends_at,
  active,
  metadata
)
SELECT
  t.id,
  CASE p.slug
    WHEN 'start' THEN 'vendor.crm.free'
    WHEN 'growth' THEN 'vendor.growth'
  END,
  CASE p.slug
    WHEN 'start' THEN 'free'
    WHEN 'growth' THEN 'subscription'
  END,
  COALESCE(t.created_at, now()),
  NULL,
  true,
  jsonb_build_object(
    'planManaged', true,
    'planId', p.id,
    'planSlug', p.slug,
    'backfilled', true
  )
FROM tenants t
JOIN plans p ON p.id = t.plan_id
WHERE p.slug IN ('start', 'growth')
  AND NOT EXISTS (
    SELECT 1
    FROM tenant_entitlements e
    WHERE e.tenant_id = t.id
      AND e.commercial_key = CASE p.slug
        WHEN 'start' THEN 'vendor.crm.free'
        WHEN 'growth' THEN 'vendor.growth'
      END
      AND e.active = true
      AND e.metadata->>'planManaged' = 'true'
  );
