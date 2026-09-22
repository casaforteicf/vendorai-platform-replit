-- Explicitly preserve the current deny-all behavior for dormant/legacy public tables.
-- These tables had RLS enabled, zero policies, zero live rows and zero observed DML/reads.
-- A future feature activation must replace this policy with a reviewed ownership model.

BEGIN;

REVOKE ALL ON TABLE public."admin_audit_log" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."admin_audit_log";
CREATE POLICY vendorai_intentionally_blocked ON public."admin_audit_log" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."agent_execution_log" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."agent_execution_log";
CREATE POLICY vendorai_intentionally_blocked ON public."agent_execution_log" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."ambassadors" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."ambassadors";
CREATE POLICY vendorai_intentionally_blocked ON public."ambassadors" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."arch_execution_events" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."arch_execution_events";
CREATE POLICY vendorai_intentionally_blocked ON public."arch_execution_events" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."arch_post_sale_events" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."arch_post_sale_events";
CREATE POLICY vendorai_intentionally_blocked ON public."arch_post_sale_events" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."assinaturas" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."assinaturas";
CREATE POLICY vendorai_intentionally_blocked ON public."assinaturas" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."automation_logs" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."automation_logs";
CREATE POLICY vendorai_intentionally_blocked ON public."automation_logs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."campanhas" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."campanhas";
CREATE POLICY vendorai_intentionally_blocked ON public."campanhas" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."cart_items" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."cart_items";
CREATE POLICY vendorai_intentionally_blocked ON public."cart_items" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."carts" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."carts";
CREATE POLICY vendorai_intentionally_blocked ON public."carts" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."coin_transactions" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."coin_transactions";
CREATE POLICY vendorai_intentionally_blocked ON public."coin_transactions" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."consumer_addresses" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."consumer_addresses";
CREATE POLICY vendorai_intentionally_blocked ON public."consumer_addresses" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."consumer_beneficios" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."consumer_beneficios";
CREATE POLICY vendorai_intentionally_blocked ON public."consumer_beneficios" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."consumer_coupons" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."consumer_coupons";
CREATE POLICY vendorai_intentionally_blocked ON public."consumer_coupons" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."consumers" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."consumers";
CREATE POLICY vendorai_intentionally_blocked ON public."consumers" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."deliveries" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."deliveries";
CREATE POLICY vendorai_intentionally_blocked ON public."deliveries" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."delivery_events" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."delivery_events";
CREATE POLICY vendorai_intentionally_blocked ON public."delivery_events" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."delivery_partners" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."delivery_partners";
CREATE POLICY vendorai_intentionally_blocked ON public."delivery_partners" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."delivery_proofs" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."delivery_proofs";
CREATE POLICY vendorai_intentionally_blocked ON public."delivery_proofs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."disputes" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."disputes";
CREATE POLICY vendorai_intentionally_blocked ON public."disputes" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."favorites" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."favorites";
CREATE POLICY vendorai_intentionally_blocked ON public."favorites" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."influencer_conversions" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."influencer_conversions";
CREATE POLICY vendorai_intentionally_blocked ON public."influencer_conversions" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."marketplace_listings" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."marketplace_listings";
CREATE POLICY vendorai_intentionally_blocked ON public."marketplace_listings" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."nps_respostas" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."nps_respostas";
CREATE POLICY vendorai_intentionally_blocked ON public."nps_respostas" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."order_deal_links" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."order_deal_links";
CREATE POLICY vendorai_intentionally_blocked ON public."order_deal_links" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."order_items" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."order_items";
CREATE POLICY vendorai_intentionally_blocked ON public."order_items" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."orders" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."orders";
CREATE POLICY vendorai_intentionally_blocked ON public."orders" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."organizacoes" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."organizacoes";
CREATE POLICY vendorai_intentionally_blocked ON public."organizacoes" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."praca_bank_transactions" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."praca_bank_transactions";
CREATE POLICY vendorai_intentionally_blocked ON public."praca_bank_transactions" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."praca_password_reset_tokens" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."praca_password_reset_tokens";
CREATE POLICY vendorai_intentionally_blocked ON public."praca_password_reset_tokens" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."product_questions" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."product_questions";
CREATE POLICY vendorai_intentionally_blocked ON public."product_questions" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."product_reviews" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."product_reviews";
CREATE POLICY vendorai_intentionally_blocked ON public."product_reviews" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."product_views" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."product_views";
CREATE POLICY vendorai_intentionally_blocked ON public."product_views" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."scout_pra_envios_log" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."scout_pra_envios_log";
CREATE POLICY vendorai_intentionally_blocked ON public."scout_pra_envios_log" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."scout_pra_oportunidades" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."scout_pra_oportunidades";
CREATE POLICY vendorai_intentionally_blocked ON public."scout_pra_oportunidades" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."scout_pra_regras" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."scout_pra_regras";
CREATE POLICY vendorai_intentionally_blocked ON public."scout_pra_regras" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."search_logs" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."search_logs";
CREATE POLICY vendorai_intentionally_blocked ON public."search_logs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."session" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."session";
CREATE POLICY vendorai_intentionally_blocked ON public."session" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."support_points" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."support_points";
CREATE POLICY vendorai_intentionally_blocked ON public."support_points" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."tenant_switch_log" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."tenant_switch_log";
CREATE POLICY vendorai_intentionally_blocked ON public."tenant_switch_log" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."usuarios_organizacao" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."usuarios_organizacao";
CREATE POLICY vendorai_intentionally_blocked ON public."usuarios_organizacao" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."vendor_payouts" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."vendor_payouts";
CREATE POLICY vendorai_intentionally_blocked ON public."vendor_payouts" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

COMMIT;
