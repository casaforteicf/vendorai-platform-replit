-- Keep the commercial layer internally consistent. Sellable SKUs such as a
-- 5-day pass or a human service are not themselves runtime entitlements: they
-- produce/affect another entitlement (for example vendor.growth).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_usage_quotas_commercial_key_fk'
  ) THEN
    ALTER TABLE product_usage_quotas
      ADD CONSTRAINT product_usage_quotas_commercial_key_fk
      FOREIGN KEY (commercial_key)
      REFERENCES commercial_product_profiles(commercial_key)
      ON UPDATE CASCADE
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_entitlements_commercial_key_fk'
  ) THEN
    ALTER TABLE tenant_entitlements
      ADD CONSTRAINT tenant_entitlements_commercial_key_fk
      FOREIGN KEY (commercial_key)
      REFERENCES commercial_product_profiles(commercial_key)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usage_ledger_commercial_key_fk'
  ) THEN
    ALTER TABLE usage_ledger
      ADD CONSTRAINT usage_ledger_commercial_key_fk
      FOREIGN KEY (commercial_key)
      REFERENCES commercial_product_profiles(commercial_key)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION validate_runtime_commercial_entitlement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_offer_kind text;
  v_profile_active boolean;
BEGIN
  SELECT offer_kind, active
    INTO v_offer_kind, v_profile_active
  FROM commercial_product_profiles
  WHERE commercial_key = NEW.commercial_key
  LIMIT 1;

  IF v_offer_kind IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'COMMERCIAL_PRODUCT_NOT_FOUND',
      DETAIL = format('Unknown commercial_key: %s', NEW.commercial_key);
  END IF;

  IF NEW.active = true AND v_profile_active = false THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'COMMERCIAL_PRODUCT_INACTIVE',
      DETAIL = format('commercial_key %s is inactive.', NEW.commercial_key);
  END IF;

  IF NEW.active = true AND v_offer_kind IN ('service', 'prepaid_pass', 'consumption_pack') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'OFFER_IS_NOT_RUNTIME_ENTITLEMENT',
      DETAIL = format('%s (%s) cannot be granted directly as a runtime entitlement.', NEW.commercial_key, v_offer_kind),
      HINT = 'Apply the commercial effect instead (for example, a paid 5-day pass extends vendor.growth).';
  END IF;

  IF NEW.ends_at IS NOT NULL AND NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '22007',
      MESSAGE = 'INVALID_ENTITLEMENT_WINDOW';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_runtime_commercial_entitlement ON tenant_entitlements;
CREATE TRIGGER trg_validate_runtime_commercial_entitlement
BEFORE INSERT OR UPDATE OF commercial_key, active, starts_at, ends_at
ON tenant_entitlements
FOR EACH ROW
EXECUTE FUNCTION validate_runtime_commercial_entitlement();

-- Prevent duplicate active snapshots from the same source while allowing a
-- customer to have, for example, a paid module plus a temporary promotion.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_entitlements_active_source_uq
  ON tenant_entitlements(tenant_id, commercial_key, source)
  WHERE active = true;
