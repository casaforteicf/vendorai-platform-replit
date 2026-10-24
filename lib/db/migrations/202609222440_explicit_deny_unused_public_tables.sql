-- Explicitly preserve the current deny-all behavior for dormant/legacy public tables.
-- These tables had RLS enabled, zero policies, zero live rows and zero observed DML/reads.
-- A future feature activation must replace this policy with a reviewed ownership model.

BEGIN;

REVOKE ALL ON TABLE public."admin_audit_log" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."admin_audit_log" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."admin_audit_log" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."admin_audit_log";
CREATE POLICY vendorai_intentionally_blocked ON public."admin_audit_log" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."agent_execution_log" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."agent_execution_log" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."agent_execution_log" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."agent_execution_log";
CREATE POLICY vendorai_intentionally_blocked ON public."agent_execution_log" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."ambassadors" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."ambassadors" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."ambassadors" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."ambassadors";
CREATE POLICY vendorai_intentionally_blocked ON public."ambassadors" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."arch_execution_events" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."arch_execution_events" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."arch_execution_events" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."arch_execution_events";
CREATE POLICY vendorai_intentionally_blocked ON public."arch_execution_events" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."arch_post_sale_events" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."arch_post_sale_events" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."arch_post_sale_events" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."arch_post_sale_events";
CREATE POLICY vendorai_intentionally_blocked ON public."arch_post_sale_events" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."assinaturas" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."assinaturas" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."assinaturas" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."assinaturas";
CREATE POLICY vendorai_intentionally_blocked ON public."assinaturas" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."automation_logs" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."automation_logs" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."automation_logs" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."automation_logs";
CREATE POLICY vendorai_intentionally_blocked ON public."automation_logs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."campanhas" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."campanhas" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."campanhas" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."campanhas";
CREATE POLICY vendorai_intentionally_blocked ON public."campanhas" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."cart_items" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."cart_items" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."cart_items" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."cart_items";
CREATE POLICY vendorai_intentionally_blocked ON public."cart_items" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."carts" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."carts" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."carts" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."carts";
CREATE POLICY vendorai_intentionally_blocked ON public."carts" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."coin_transactions" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."coin_transactions" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."coin_transactions" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."coin_transactions";
CREATE POLICY vendorai_intentionally_blocked ON public."coin_transactions" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."consumer_addresses" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."consumer_addresses" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."consumer_addresses" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."consumer_addresses";
CREATE POLICY vendorai_intentionally_blocked ON public."consumer_addresses" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."consumer_beneficios" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."consumer_beneficios" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."consumer_beneficios" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."consumer_beneficios";
CREATE POLICY vendorai_intentionally_blocked ON public."consumer_beneficios" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."consumer_coupons" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."consumer_coupons" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."consumer_coupons" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."consumer_coupons";
CREATE POLICY vendorai_intentionally_blocked ON public."consumer_coupons" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."consumers" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."consumers" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."consumers" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."consumers";
CREATE POLICY vendorai_intentionally_blocked ON public."consumers" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."deliveries" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."deliveries" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."deliveries" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."deliveries";
CREATE POLICY vendorai_intentionally_blocked ON public."deliveries" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."delivery_events" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."delivery_events" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."delivery_events" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."delivery_events";
CREATE POLICY vendorai_intentionally_blocked ON public."delivery_events" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."delivery_partners" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."delivery_partners" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."delivery_partners" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."delivery_partners";
CREATE POLICY vendorai_intentionally_blocked ON public."delivery_partners" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."delivery_proofs" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."delivery_proofs" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."delivery_proofs" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."delivery_proofs";
CREATE POLICY vendorai_intentionally_blocked ON public."delivery_proofs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."disputes" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."disputes" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."disputes" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."disputes";
CREATE POLICY vendorai_intentionally_blocked ON public."disputes" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."favorites" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."favorites" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."favorites" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."favorites";
CREATE POLICY vendorai_intentionally_blocked ON public."favorites" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."influencer_conversions" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."influencer_conversions" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."influencer_conversions" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."influencer_conversions";
CREATE POLICY vendorai_intentionally_blocked ON public."influencer_conversions" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."marketplace_listings" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."marketplace_listings" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."marketplace_listings" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."marketplace_listings";
CREATE POLICY vendorai_intentionally_blocked ON public."marketplace_listings" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."nps_respostas" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."nps_respostas" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."nps_respostas" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."nps_respostas";
CREATE POLICY vendorai_intentionally_blocked ON public."nps_respostas" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."order_deal_links" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."order_deal_links" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."order_deal_links" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."order_deal_links";
CREATE POLICY vendorai_intentionally_blocked ON public."order_deal_links" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."order_items" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."order_items" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."order_items" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."order_items";
CREATE POLICY vendorai_intentionally_blocked ON public."order_items" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."orders" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."orders" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."orders" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."orders";
CREATE POLICY vendorai_intentionally_blocked ON public."orders" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."organizacoes" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."organizacoes" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."organizacoes" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."organizacoes";
CREATE POLICY vendorai_intentionally_blocked ON public."organizacoes" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."praca_bank_transactions" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."praca_bank_transactions" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."praca_bank_transactions" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."praca_bank_transactions";
CREATE POLICY vendorai_intentionally_blocked ON public."praca_bank_transactions" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."praca_password_reset_tokens" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."praca_password_reset_tokens" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."praca_password_reset_tokens" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."praca_password_reset_tokens";
CREATE POLICY vendorai_intentionally_blocked ON public."praca_password_reset_tokens" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."product_questions" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."product_questions" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."product_questions" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."product_questions";
CREATE POLICY vendorai_intentionally_blocked ON public."product_questions" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."product_reviews" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."product_reviews" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."product_reviews" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."product_reviews";
CREATE POLICY vendorai_intentionally_blocked ON public."product_reviews" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."product_views" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."product_views" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."product_views" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."product_views";
CREATE POLICY vendorai_intentionally_blocked ON public."product_views" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."scout_pra_envios_log" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."scout_pra_envios_log" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."scout_pra_envios_log" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."scout_pra_envios_log";
CREATE POLICY vendorai_intentionally_blocked ON public."scout_pra_envios_log" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."scout_pra_oportunidades" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."scout_pra_oportunidades" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."scout_pra_oportunidades" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."scout_pra_oportunidades";
CREATE POLICY vendorai_intentionally_blocked ON public."scout_pra_oportunidades" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."scout_pra_regras" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."scout_pra_regras" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."scout_pra_regras" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."scout_pra_regras";
CREATE POLICY vendorai_intentionally_blocked ON public."scout_pra_regras" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."search_logs" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."search_logs" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."search_logs" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."search_logs";
CREATE POLICY vendorai_intentionally_blocked ON public."search_logs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."session" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."session" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."session" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."session";
CREATE POLICY vendorai_intentionally_blocked ON public."session" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."support_points" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."support_points" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."support_points" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."support_points";
CREATE POLICY vendorai_intentionally_blocked ON public."support_points" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."tenant_switch_log" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."tenant_switch_log" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."tenant_switch_log" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."tenant_switch_log";
CREATE POLICY vendorai_intentionally_blocked ON public."tenant_switch_log" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."usuarios_organizacao" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."usuarios_organizacao" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."usuarios_organizacao" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."usuarios_organizacao";
CREATE POLICY vendorai_intentionally_blocked ON public."usuarios_organizacao" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."vendor_payouts" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."vendor_payouts" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."vendor_payouts" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."vendor_payouts";
CREATE POLICY vendorai_intentionally_blocked ON public."vendor_payouts" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

COMMIT;
