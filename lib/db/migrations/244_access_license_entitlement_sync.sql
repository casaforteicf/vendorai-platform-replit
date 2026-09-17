-- Align the already-existing 5-day access engine with the new commercial layer.
-- Keeps old annual/legacy rows compatible while making prepaid/free Growth
-- windows visible as `vendor.growth` entitlements.

ALTER TABLE access_pass_purchases
  ALTER COLUMN amount SET DEFAULT 399.00;

CREATE OR REPLACE FUNCTION sync_access_license_growth_entitlement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_source text;
  v_ends_at timestamp;
BEGIN
  -- Close the previous entitlement snapshot created from this access license.
  UPDATE tenant_entitlements
     SET active = false,
         updated_at = now()
   WHERE tenant_id = NEW.tenant_id
     AND commercial_key = 'vendor.growth'
     AND metadata->>'accessLicenseId' = NEW.id
     AND active = true;

  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  IF NEW.mode = 'annual' THEN
    v_source := 'subscription';
    v_ends_at := COALESCE(NEW.annual_ends_at, NEW.access_ends_at);
  ELSIF NEW.mode = 'prepaid' THEN
    v_source := 'prepaid_pass';
    v_ends_at := NEW.access_ends_at;
  ELSE
    -- Legacy access remains governed by the legacy access engine and is not
    -- reclassified as a new Growth sale.
    RETURN NEW;
  END IF;

  IF v_ends_at IS NULL OR v_ends_at <= now() THEN
    RETURN NEW;
  END IF;

  INSERT INTO tenant_entitlements (
    tenant_id,
    commercial_key,
    source,
    starts_at,
    ends_at,
    active,
    metadata
  ) VALUES (
    NEW.tenant_id,
    'vendor.growth',
    v_source,
    COALESCE(NEW.free_activated_at, NEW.annual_starts_at, now()),
    v_ends_at,
    true,
    jsonb_build_object(
      'accessLicenseId', NEW.id,
      'accessMode', NEW.mode,
      'freeBenefitMonth', NEW.free_benefit_month
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_access_license_growth_entitlement ON access_licenses;
CREATE TRIGGER trg_sync_access_license_growth_entitlement
AFTER INSERT OR UPDATE OF status, mode, access_ends_at, annual_ends_at, free_activated_at
ON access_licenses
FOR EACH ROW
EXECUTE FUNCTION sync_access_license_growth_entitlement();

-- Backfill active non-legacy licenses without mutating their access window.
INSERT INTO tenant_entitlements (
  tenant_id, commercial_key, source, starts_at, ends_at, active, metadata
)
SELECT
  l.tenant_id,
  'vendor.growth',
  CASE WHEN l.mode = 'annual' THEN 'subscription' ELSE 'prepaid_pass' END,
  COALESCE(l.free_activated_at, l.annual_starts_at, l.created_at),
  COALESCE(l.annual_ends_at, l.access_ends_at),
  true,
  jsonb_build_object(
    'accessLicenseId', l.id,
    'accessMode', l.mode,
    'freeBenefitMonth', l.free_benefit_month,
    'backfilled', true
  )
FROM access_licenses l
WHERE l.status = 'active'
  AND l.mode IN ('prepaid', 'annual')
  AND COALESCE(l.annual_ends_at, l.access_ends_at) > now()
  AND NOT EXISTS (
    SELECT 1 FROM tenant_entitlements e
    WHERE e.tenant_id = l.tenant_id
      AND e.commercial_key = 'vendor.growth'
      AND e.active = true
      AND e.metadata->>'accessLicenseId' = l.id
  );
