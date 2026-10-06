-- Prevent late supplier responses after a package has been awarded or cancelled.
CREATE OR REPLACE FUNCTION public.arch_rfq_public_submit(p_token uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_inv public.arch_rfq_invitations%ROWTYPE;
  v_pkg public.arch_rfq_packages%ROWTYPE;
  v_item jsonb;
  v_compra public.compras_obras%ROWTYPE;
  v_compra_id text;
  v_quantity numeric;
  v_unit text;
  v_unit_value numeric;
  v_items_total numeric := 0;
  v_payload_count integer;
  v_scope_count integer;
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

  SELECT * INTO v_pkg
    FROM public.arch_rfq_packages
   WHERE id=v_inv.package_id
   LIMIT 1;

  IF v_pkg.id IS NULL THEN RAISE EXCEPTION 'Pacote de cotação não encontrado'; END IF;
  IF v_pkg.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Cotação encerrada'; END IF;
  IF v_inv.status IN ('accepted','rejected','expired') THEN RAISE EXCEPTION 'Cotação encerrada'; END IF;

  v_payload_count := jsonb_array_length(COALESCE(p_payload->'items','[]'::jsonb));
  SELECT COUNT(*)::int INTO v_scope_count
    FROM public.arch_rfq_package_items
   WHERE package_id=v_inv.package_id;

  IF v_payload_count = 0 THEN RAISE EXCEPTION 'Informe os itens'; END IF;
  IF v_payload_count <> v_scope_count THEN
    RAISE EXCEPTION 'A cotação deve conter todos os itens do escopo';
  END IF;

  IF (
    SELECT COUNT(DISTINCT item->>'compraId')
      FROM jsonb_array_elements(p_payload->'items') item
  ) <> v_payload_count THEN
    RAISE EXCEPTION 'A cotação contém itens duplicados';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items')
  LOOP
    v_compra_id := v_item->>'compraId';

    SELECT c.* INTO v_compra
      FROM public.arch_rfq_package_items pi
      JOIN public.compras_obras c ON c.id=pi.compra_id
     WHERE pi.package_id=v_inv.package_id
       AND pi.compra_id=v_compra_id
     LIMIT 1;

    IF v_compra.id IS NULL THEN RAISE EXCEPTION 'Item fora do escopo'; END IF;
    IF v_compra.cotacao_desatualizada THEN RAISE EXCEPTION 'Escopo desatualizado; solicite uma nova cotação'; END IF;

    v_quantity := GREATEST(COALESCE((v_item->>'quantity')::numeric,0),0);
    v_unit := COALESCE(NULLIF(v_item->>'unit',''), 'un');
    v_unit_value := GREATEST(COALESCE((v_item->>'unitValue')::numeric,0),0);

    IF v_quantity <> COALESCE(v_compra.quantidade::numeric,0) THEN
      RAISE EXCEPTION 'Quantidade divergente do escopo para o item %', v_compra.descricao;
    END IF;
    IF lower(v_unit) <> lower(COALESCE(v_compra.unidade,'un')) THEN
      RAISE EXCEPTION 'Unidade divergente do escopo para o item %', v_compra.descricao;
    END IF;
    IF v_quantity > 0 AND v_unit_value <= 0 THEN
      RAISE EXCEPTION 'Todos os itens precisam ter preço';
    END IF;

    v_items_total := v_items_total + (v_quantity * v_unit_value);

    INSERT INTO public.arch_rfq_quote_items
      (invitation_id,compra_id,quantity,unit,unit_value,total_value,brand_model,notes,created_at,updated_at)
    VALUES
      (v_inv.id,v_compra_id,v_quantity,v_unit,v_unit_value,v_quantity*v_unit_value,
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

REVOKE ALL ON FUNCTION public.arch_rfq_public_submit(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.arch_rfq_public_submit(uuid,jsonb) TO vendorai_app;
