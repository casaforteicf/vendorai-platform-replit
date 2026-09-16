-- VendorAI App Builder — checkout executável para App Product.
-- Reaproveita o lifecycle financeiro já existente de site_checkout_orders/Asaas,
-- mas identifica pedidos originados de app e mantém isolamento por tenant/app/user.

ALTER TABLE site_checkout_orders
  ALTER COLUMN site_id DROP NOT NULL;

ALTER TABLE site_checkout_orders
  ADD COLUMN IF NOT EXISTS app_instance_id text REFERENCES app_instances(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS app_user_id text REFERENCES app_users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS checkout_source text NOT NULL DEFAULT 'generated_site',
  ADD COLUMN IF NOT EXISTS stock_reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_released_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS site_checkout_orders_app_idempotency_uidx
  ON site_checkout_orders (tenant_id, app_instance_id, app_user_id, idempotency_key)
  WHERE app_instance_id IS NOT NULL
    AND app_user_id IS NOT NULL
    AND idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS site_checkout_orders_app_user_idx
  ON site_checkout_orders (tenant_id, app_instance_id, app_user_id, created_at DESC)
  WHERE app_instance_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_runtime_commerce_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_instance_id text NOT NULL REFERENCES app_instances(id) ON DELETE CASCADE,
  app_user_id text REFERENCES app_users(id) ON DELETE SET NULL,
  order_id text NOT NULL REFERENCES site_checkout_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_runtime_commerce_events_order_type_uidx
  ON app_runtime_commerce_events (order_id, event_type);

CREATE INDEX IF NOT EXISTS app_runtime_commerce_events_delivery_idx
  ON app_runtime_commerce_events (delivery_status, created_at)
  WHERE delivery_status <> 'delivered';

-- Reserva física simples: ao iniciar checkout de um App Product com estoque local
-- controlado, a quantidade é abatida de produtos_catalogo. Se o pagamento falhar,
-- vencer ou for cancelado, este trigger devolve exatamente uma vez.
CREATE OR REPLACE FUNCTION release_app_runtime_reserved_stock()
RETURNS trigger AS $$
DECLARE
  line jsonb;
  product_id text;
  qty integer;
  was_stock_controlled boolean;
BEGIN
  IF NEW.app_instance_id IS NULL
     OR NEW.stock_reserved_at IS NULL
     OR NEW.stock_released_at IS NOT NULL
     OR NEW.status NOT IN ('failed', 'cancelled', 'overdue') THEN
    RETURN NEW;
  END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.items, '[]'::jsonb))
  LOOP
    product_id := NULLIF(line->>'productId', '');
    was_stock_controlled := COALESCE((line->>'stockControlled')::boolean, false);
    BEGIN
      qty := GREATEST(COALESCE((line->>'quantity')::integer, 0), 0);
    EXCEPTION WHEN invalid_text_representation THEN
      qty := 0;
    END;

    IF was_stock_controlled AND product_id IS NOT NULL AND qty > 0 THEN
      UPDATE produtos_catalogo
         SET estoque_quantidade = COALESCE(estoque_quantidade, 0) + qty,
             updated_at = now()
       WHERE id = product_id
         AND tenant_id = NEW.tenant_id;
    END IF;
  END LOOP;

  NEW.stock_released_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_release_app_runtime_reserved_stock ON site_checkout_orders;
CREATE TRIGGER trg_release_app_runtime_reserved_stock
BEFORE UPDATE OF status ON site_checkout_orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION release_app_runtime_reserved_stock();

-- Outbox universal. ERP, financeiro, CRM/Customer Intelligence e automações
-- podem consumir estes eventos por adapter sem acoplar o App Product ao fornecedor.
CREATE OR REPLACE FUNCTION emit_app_runtime_commerce_event()
RETURNS trigger AS $$
DECLARE
  next_event text;
BEGIN
  IF NEW.app_instance_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    next_event := 'commerce.checkout.created';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    next_event := 'commerce.checkout.' || NEW.status;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO app_runtime_commerce_events (
    tenant_id, app_instance_id, app_user_id, order_id, event_type, payload
  ) VALUES (
    NEW.tenant_id,
    NEW.app_instance_id,
    NEW.app_user_id,
    NEW.id,
    next_event,
    jsonb_build_object(
      'orderId', NEW.id,
      'status', NEW.status,
      'source', NEW.checkout_source,
      'oneTimeTotal', NEW.one_time_total,
      'recurringTotal', NEW.recurring_total,
      'dueNow', NEW.first_charge_total,
      'items', NEW.items,
      'paidAt', NEW.paid_at,
      'paymentProvider', CASE WHEN NEW.asaas_charge_id IS NOT NULL THEN 'asaas' ELSE NULL END
    )
  )
  ON CONFLICT (order_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emit_app_runtime_commerce_event ON site_checkout_orders;
CREATE TRIGGER trg_emit_app_runtime_commerce_event
AFTER INSERT OR UPDATE OF status ON site_checkout_orders
FOR EACH ROW
EXECUTE FUNCTION emit_app_runtime_commerce_event();
