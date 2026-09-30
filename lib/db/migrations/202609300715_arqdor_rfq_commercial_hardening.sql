-- ARQDOR RFQ commercial hardening
-- Separates technical cost from commercial sale price and hardens supplier quotation lifecycle.

ALTER TABLE public.arch_budgets
  ADD COLUMN IF NOT EXISTS sale_total numeric,
  ADD COLUMN IF NOT EXISTS sale_source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.arch_budget_items
  ADD COLUMN IF NOT EXISTS sale_total numeric;

ALTER TABLE public.arch_rfq_packages
  ADD COLUMN IF NOT EXISTS arch_proposal_id uuid,
  ADD COLUMN IF NOT EXISTS commercial_proposal_id text,
  ADD COLUMN IF NOT EXISTS proposal_revision text,
  ADD COLUMN IF NOT EXISTS sale_total_snapshot numeric,
  ADD COLUMN IF NOT EXISTS sale_source text,
  ADD COLUMN IF NOT EXISTS technical_documents_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Clean up any legacy duplicate invitations before enforcing uniqueness.
-- Preserve the most advanced response first, then the most recently updated row.
WITH ranked_invites AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY package_id, supplier_id
           ORDER BY
             CASE status
               WHEN 'accepted' THEN 1
               WHEN 'responded' THEN 2
               WHEN 'viewed' THEN 3
               WHEN 'sent' THEN 4
               WHEN 'draft' THEN 5
               WHEN 'failed' THEN 6
               WHEN 'rejected' THEN 7
               WHEN 'expired' THEN 8
               ELSE 9
             END,
             updated_at DESC,
             created_at DESC
         ) AS rn
    FROM public.arch_rfq_invitations
   WHERE supplier_id IS NOT NULL
)
DELETE FROM public.arch_rfq_invitations i
USING ranked_invites r
WHERE i.id=r.id AND r.rn>1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_arch_rfq_invitation_package_supplier
  ON public.arch_rfq_invitations(package_id, supplier_id)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_arch_rfq_packages_commercial_proposal
  ON public.arch_rfq_packages(commercial_proposal_id);

CREATE INDEX IF NOT EXISTS idx_arch_rfq_packages_arch_proposal
  ON public.arch_rfq_packages(arch_proposal_id);

CREATE OR REPLACE FUNCTION public.arch_rfq_public_add_document(p_token uuid, p_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_inv public.arch_rfq_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv
    FROM public.arch_rfq_invitations
   WHERE public_token = p_token
   LIMIT 1
   FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Cotação não encontrada';
  END IF;
  IF v_inv.status IN ('accepted','rejected','expired') THEN
    RAISE EXCEPTION 'Cotação encerrada';
  END IF;
  IF jsonb_array_length(COALESCE(v_inv.response_documents,'[]'::jsonb)) >= 10 THEN
    RAISE EXCEPTION 'Limite de anexos atingido';
  END IF;

  UPDATE public.arch_rfq_invitations
     SET response_documents = COALESCE(response_documents, '[]'::jsonb) || jsonb_build_array(p_document),
         updated_at = now()
   WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'document', p_document);
END $$;

REVOKE ALL ON FUNCTION public.arch_rfq_public_add_document(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.arch_rfq_public_add_document(uuid,jsonb) TO vendorai_app;

-- Public response must cover the full frozen package scope. Supplier cannot alter quantities.
CREATE OR REPLACE FUNCTION public.arch_rfq_public_submit(p_token uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_inv public.arch_rfq_invitations%ROWTYPE;
  v_item jsonb;
  v_compra_id text;
  v_quantity numeric;
  v_unit text;
  v_unit_value numeric;
  v_items_total numeric := 0;
  v_allowed_count integer;
  v_submitted_count integer;
  v_freight numeric := GREATEST(COALESCE((p_payload->>'freight')::numeric,0),0);
  v_taxes numeric := GREATEST(COALESCE((p_payload->>'taxes')::numeric,0),0);
  v_discount numeric := GREATEST(COALESCE((p_payload->>'discount')::numeric,0),0);
  v_total numeric;
BEGIN
  SELECT * INTO v_inv
    FROM public.arch_rfq_invitations
   WHERE public_token=p_token
   LIMIT 1
   FOR UPDATE;

  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Cotação não encontrada'; END IF;
  IF v_inv.status IN ('accepted','rejected','expired') THEN RAISE EXCEPTION 'Cotação encerrada'; END IF;

  SELECT COUNT(*) INTO v_allowed_count
    FROM public.arch_rfq_package_items
   WHERE package_id=v_inv.package_id;

  SELECT COUNT(DISTINCT elem->>'compraId') INTO v_submitted_count
    FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) elem;

  IF v_allowed_count = 0 OR v_submitted_count <> v_allowed_count THEN
    RAISE EXCEPTION 'A cotação deve informar todos os itens do escopo';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items')
  LOOP
    v_compra_id := v_item->>'compraId';

    SELECT c.quantidade::numeric, c.unidade
      INTO v_quantity, v_unit
      FROM public.arch_rfq_package_items pi
      JOIN public.compras_obras c ON c.id=pi.compra_id
     WHERE pi.package_id=v_inv.package_id
       AND pi.compra_id=v_compra_id
     LIMIT 1;

    IF v_quantity IS NULL THEN
      RAISE EXCEPTION 'Item fora do escopo';
    END IF;

    v_unit_value := GREATEST(COALESCE((v_item->>'unitValue')::numeric,0),0);
    IF v_unit_value <= 0 AND v_quantity > 0 THEN
      RAISE EXCEPTION 'Todos os itens precisam ter preço';
    END IF;

    v_items_total := v_items_total + (v_quantity * v_unit_value);

    INSERT INTO public.arch_rfq_quote_items
      (invitation_id,compra_id,quantity,unit,unit_value,total_value,brand_model,notes,created_at,updated_at)
    VALUES
      (v_inv.id,v_compra_id,v_quantity,COALESCE(NULLIF(v_unit,''),'un'),v_unit_value,v_quantity*v_unit_value,
       NULLIF(v_item->>'brandModel',''),NULLIF(v_item->>'notes',''),now(),now())
    ON CONFLICT(invitation_id,compra_id) DO UPDATE SET
      quantity=EXCLUDED.quantity,
      unit=EXCLUDED.unit,
      unit_value=EXCLUDED.unit_value,
      total_value=EXCLUDED.total_value,
      brand_model=EXCLUDED.brand_model,
      notes=EXCLUDED.notes,
      updated_at=now();
  END LOOP;

  v_total := GREATEST(v_items_total + v_freight + v_taxes - v_discount, 0);

  UPDATE public.arch_rfq_invitations SET
    status='responded',
    freight_value=v_freight,
    tax_value=v_taxes,
    discount_value=v_discount,
    total_value=v_total,
    lead_time_days=NULLIF(p_payload->>'leadTimeDays','')::integer,
    validity_date=NULLIF(p_payload->>'validityDate','')::date,
    payment_terms=NULLIF(p_payload->>'paymentTerms',''),
    supplier_notes=NULLIF(p_payload->>'supplierNotes',''),
    responded_at=now(),
    viewed_at=COALESCE(viewed_at,now()),
    updated_at=now()
  WHERE id=v_inv.id;

  UPDATE public.arch_rfq_packages
     SET status=CASE WHEN status='completed' THEN status ELSE 'partial' END,
         updated_at=now()
   WHERE id=v_inv.package_id;

  RETURN jsonb_build_object('ok',true,'total',v_total);
END $$;
