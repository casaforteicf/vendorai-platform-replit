-- Align legacy plan rows with the new commercial naming without removing
-- historical/inactive plans. The small USD quota on Free is a temporary
-- compatibility guard for the legacy AI Gateway while the new business-unit
-- quotas remain in measure-only mode.

UPDATE plans
SET
  name = 'Vendor CRM Free',
  monthly_price_cents = 0,
  implantation_price_cents = 0,
  max_users = 1,
  ai_quota_usd = 1.00,
  active = true,
  updated_at = now()
WHERE slug = 'start';

UPDATE plans
SET
  name = 'VendorAI Growth',
  monthly_price_cents = 149000,
  max_users = NULL,
  active = true,
  updated_at = now()
WHERE slug = 'growth';
