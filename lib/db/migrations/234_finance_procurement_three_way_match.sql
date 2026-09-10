-- Financeiro + ERP Hub — Compras, fornecedores e conferência tripla

CREATE TABLE IF NOT EXISTS finance_purchase_matches (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purchase_order_id text NOT NULL REFERENCES varejo_pedidos_compra(id) ON DELETE CASCADE,
  receipt_id text REFERENCES compra_recebimentos(id) ON DELETE SET NULL,
  fiscal_document_id text REFERENCES erp_documentos_fiscais(id) ON DELETE SET NULL,
  payable_title_id text REFERENCES erp_titulos(id) ON DELETE SET NULL,
  supplier_id text REFERENCES varejo_fornecedores(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  order_match_percent numeric(5,2) NOT NULL DEFAULT 0,
  receipt_match_percent numeric(5,2) NOT NULL DEFAULT 0,
  fiscal_match_percent numeric(5,2) NOT NULL DEFAULT 0,
  payable_match_percent numeric(5,2) NOT NULL DEFAULT 0,
  overall_match_percent numeric(5,2) NOT NULL DEFAULT 0,
  order_total numeric(14,2),
  receipt_total numeric(14,2),
  fiscal_total numeric(14,2),
  payable_total numeric(14,2),
  divergences jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_purchase_matches_status_chk CHECK (status IN ('pending','matched','review','blocked','approved')),
  CONSTRAINT finance_purchase_matches_percent_chk CHECK (
    order_match_percent BETWEEN 0 AND 100 AND receipt_match_percent BETWEEN 0 AND 100 AND
    fiscal_match_percent BETWEEN 0 AND 100 AND payable_match_percent BETWEEN 0 AND 100 AND
    overall_match_percent BETWEEN 0 AND 100
  ),
  CONSTRAINT finance_purchase_matches_unique UNIQUE (tenant_id, purchase_order_id, receipt_id, fiscal_document_id, payable_title_id)
);

CREATE INDEX IF NOT EXISTS finance_purchase_matches_tenant_idx ON finance_purchase_matches(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_purchase_matches_status_idx ON finance_purchase_matches(tenant_id, status);
CREATE INDEX IF NOT EXISTS finance_purchase_matches_supplier_idx ON finance_purchase_matches(tenant_id, supplier_id);

CREATE TABLE IF NOT EXISTS finance_supplier_scores (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES varejo_fornecedores(id) ON DELETE CASCADE,
  delivery_percent numeric(5,2) NOT NULL DEFAULT 100,
  quality_percent numeric(5,2) NOT NULL DEFAULT 100,
  fiscal_compliance_percent numeric(5,2) NOT NULL DEFAULT 100,
  price_adherence_percent numeric(5,2) NOT NULL DEFAULT 100,
  reconciliation_percent numeric(5,2) NOT NULL DEFAULT 100,
  overall_score_percent numeric(5,2) NOT NULL DEFAULT 100,
  risk_level text NOT NULL DEFAULT 'low',
  incidents integer NOT NULL DEFAULT 0,
  last_assessed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_supplier_scores_risk_chk CHECK (risk_level IN ('low','medium','high','critical')),
  CONSTRAINT finance_supplier_scores_percent_chk CHECK (
    delivery_percent BETWEEN 0 AND 100 AND quality_percent BETWEEN 0 AND 100 AND
    fiscal_compliance_percent BETWEEN 0 AND 100 AND price_adherence_percent BETWEEN 0 AND 100 AND
    reconciliation_percent BETWEEN 0 AND 100 AND overall_score_percent BETWEEN 0 AND 100
  ),
  CONSTRAINT finance_supplier_scores_unique UNIQUE (tenant_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS finance_supplier_scores_tenant_idx ON finance_supplier_scores(tenant_id, overall_score_percent);

GRANT SELECT, INSERT, UPDATE, DELETE ON finance_purchase_matches TO vendorai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON finance_supplier_scores TO vendorai_app;

ALTER TABLE finance_purchase_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_supplier_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_purchase_matches_tenant_policy ON finance_purchase_matches;
CREATE POLICY finance_purchase_matches_tenant_policy ON finance_purchase_matches
  FOR ALL TO vendorai_app
  USING (tenant_id = app_security.current_tenant_id() OR app_security.is_super_admin())
  WITH CHECK (tenant_id = app_security.current_tenant_id() OR app_security.is_super_admin());

DROP POLICY IF EXISTS finance_supplier_scores_tenant_policy ON finance_supplier_scores;
CREATE POLICY finance_supplier_scores_tenant_policy ON finance_supplier_scores
  FOR ALL TO vendorai_app
  USING (tenant_id = app_security.current_tenant_id() OR app_security.is_super_admin())
  WITH CHECK (tenant_id = app_security.current_tenant_id() OR app_security.is_super_admin());

CREATE OR REPLACE FUNCTION finance_refresh_purchase_match(p_match_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_order numeric := 0;
  v_receipt numeric := 0;
  v_fiscal numeric := 0;
  v_payable numeric := 0;
  v_receipt_pct numeric := 0;
  v_fiscal_pct numeric := 0;
  v_payable_pct numeric := 0;
  v_overall numeric := 0;
  v_divergences jsonb := '[]'::jsonb;
BEGIN
  SELECT COALESCE(po.valor_total,0), COALESCE(f.valor,0),
         COALESCE(t.valor_original + t.juros + t.multa - t.desconto,0)
    INTO v_order, v_fiscal, v_payable
    FROM finance_purchase_matches m
    JOIN varejo_pedidos_compra po ON po.id=m.purchase_order_id AND po.tenant_id=m.tenant_id
    LEFT JOIN erp_documentos_fiscais f ON f.id=m.fiscal_document_id AND f.tenant_id=m.tenant_id
    LEFT JOIN erp_titulos t ON t.id=m.payable_title_id AND t.tenant_id=m.tenant_id AND t.tipo='pagar'
   WHERE m.id=p_match_id;

  SELECT COALESCE(SUM(ri.quantidade * COALESCE(ri.custo_unitario,0)),0)
    INTO v_receipt
    FROM finance_purchase_matches m
    LEFT JOIN compra_recebimento_itens ri ON ri.recebimento_id=m.receipt_id AND ri.tenant_id=m.tenant_id
   WHERE m.id=p_match_id;

  IF v_order > 0 THEN
    v_receipt_pct := GREATEST(0, 100 - LEAST(100, ABS(v_receipt-v_order)/v_order*100));
    v_fiscal_pct := GREATEST(0, 100 - LEAST(100, ABS(v_fiscal-v_order)/v_order*100));
    v_payable_pct := GREATEST(0, 100 - LEAST(100, ABS(v_payable-v_order)/v_order*100));
  END IF;

  IF v_receipt = 0 THEN v_divergences := v_divergences || jsonb_build_array('recebimento_sem_valor'); END IF;
  IF v_fiscal = 0 THEN v_divergences := v_divergences || jsonb_build_array('documento_fiscal_ausente'); END IF;
  IF v_payable = 0 THEN v_divergences := v_divergences || jsonb_build_array('conta_pagar_ausente'); END IF;
  IF v_order > 0 AND ABS(v_receipt-v_order)/v_order > 0.02 THEN v_divergences := v_divergences || jsonb_build_array('divergencia_recebimento'); END IF;
  IF v_order > 0 AND ABS(v_fiscal-v_order)/v_order > 0.02 THEN v_divergences := v_divergences || jsonb_build_array('divergencia_fiscal'); END IF;
  IF v_order > 0 AND ABS(v_payable-v_order)/v_order > 0.02 THEN v_divergences := v_divergences || jsonb_build_array('divergencia_conta_pagar'); END IF;

  v_overall := ROUND((100 + v_receipt_pct + v_fiscal_pct + v_payable_pct) / 4, 2);

  UPDATE finance_purchase_matches
     SET order_total=v_order,
         receipt_total=v_receipt,
         fiscal_total=v_fiscal,
         payable_total=v_payable,
         order_match_percent=100,
         receipt_match_percent=ROUND(v_receipt_pct,2),
         fiscal_match_percent=ROUND(v_fiscal_pct,2),
         payable_match_percent=ROUND(v_payable_pct,2),
         overall_match_percent=v_overall,
         divergences=v_divergences,
         status=CASE
           WHEN jsonb_array_length(v_divergences)=0 AND v_overall >= 98 THEN 'matched'
           WHEN v_overall >= 90 THEN 'review'
           ELSE 'blocked'
         END,
         updated_at=now()
   WHERE id=p_match_id;
END;
$$;

GRANT EXECUTE ON FUNCTION finance_refresh_purchase_match(text) TO vendorai_app;
