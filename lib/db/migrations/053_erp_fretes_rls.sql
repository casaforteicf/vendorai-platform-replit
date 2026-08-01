-- Garante isolamento por tenant para as tabelas financeiras e para o
-- histórico de localização de fretes criado antes do auditor RLS estrito.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  erp_titulos,
  erp_pagamentos,
  erp_documentos_fiscais,
  fretes_localizacoes_historico
TO vendorai_app;

DO $tenant_rls$
DECLARE
  table_name text;
  tenant_expression text := '(app_security.is_super_admin() OR tenant_id::text = app_security.current_tenant_id())';
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'erp_titulos',
    'erp_pagamentos',
    'erp_documentos_fiscais',
    'fretes_localizacoes_historico'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS vendorai_tenant_access ON %I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS vendorai_tenant_guard ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY vendorai_tenant_access ON %I AS PERMISSIVE FOR ALL TO vendorai_app USING (%s) WITH CHECK (%s)',
      table_name, tenant_expression, tenant_expression
    );
    EXECUTE format(
      'CREATE POLICY vendorai_tenant_guard ON %I AS RESTRICTIVE FOR ALL TO vendorai_app USING (%s) WITH CHECK (%s)',
      table_name, tenant_expression, tenant_expression
    );
  END LOOP;
END
$tenant_rls$;
