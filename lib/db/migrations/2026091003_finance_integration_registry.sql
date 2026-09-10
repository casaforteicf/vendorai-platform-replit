-- Financeiro + ERP Hub — Integration Registry persistente, health e source-of-truth

CREATE TABLE IF NOT EXISTS finance_integration_registry (
  id text PRIMARY KEY,
  provider_key text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  auth_type text NOT NULL,
  api_version text,
  documentation_url text,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  webhook_support boolean NOT NULL DEFAULT false,
  default_direction text NOT NULL DEFAULT 'bidirectional',
  rate_limit_description text,
  retry_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_integration_registry_direction_chk CHECK (default_direction IN ('in','out','bidirectional'))
);

CREATE INDEX IF NOT EXISTS finance_integration_registry_category_idx
  ON finance_integration_registry(category);

CREATE TABLE IF NOT EXISTS finance_integration_connections (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id text NOT NULL REFERENCES finance_integration_registry(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_configured',
  sync_direction text NOT NULL DEFAULT 'bidirectional',
  authentication_health_percent numeric(5,2) NOT NULL DEFAULT 0,
  sync_health_percent numeric(5,2) NOT NULL DEFAULT 0,
  webhook_health_percent numeric(5,2) NOT NULL DEFAULT 0,
  data_consistency_percent numeric(5,2) NOT NULL DEFAULT 0,
  overall_health_percent numeric(5,2) NOT NULL DEFAULT 0,
  last_health_check_at timestamptz,
  last_sync_at timestamptz,
  last_error_code text,
  last_error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_integration_connections_status_chk CHECK (status IN ('connected','partial','error','expired','disabled','not_configured')),
  CONSTRAINT finance_integration_connections_direction_chk CHECK (sync_direction IN ('in','out','bidirectional')),
  CONSTRAINT finance_integration_connections_auth_health_chk CHECK (authentication_health_percent BETWEEN 0 AND 100),
  CONSTRAINT finance_integration_connections_sync_health_chk CHECK (sync_health_percent BETWEEN 0 AND 100),
  CONSTRAINT finance_integration_connections_webhook_health_chk CHECK (webhook_health_percent BETWEEN 0 AND 100),
  CONSTRAINT finance_integration_connections_consistency_chk CHECK (data_consistency_percent BETWEEN 0 AND 100),
  CONSTRAINT finance_integration_connections_overall_health_chk CHECK (overall_health_percent BETWEEN 0 AND 100),
  CONSTRAINT finance_integration_connections_tenant_integration_unique UNIQUE (tenant_id, integration_id)
);

CREATE INDEX IF NOT EXISTS finance_integration_connections_tenant_idx
  ON finance_integration_connections(tenant_id);
CREATE INDEX IF NOT EXISTS finance_integration_connections_status_idx
  ON finance_integration_connections(status);

CREATE TABLE IF NOT EXISTS finance_data_authority (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  object_type text NOT NULL,
  authority text NOT NULL DEFAULT 'vendorai',
  integration_id text REFERENCES finance_integration_registry(id) ON DELETE SET NULL,
  sync_direction text NOT NULL DEFAULT 'bidirectional',
  conflict_policy text NOT NULL DEFAULT 'reject_and_review',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_data_authority_authority_chk CHECK (authority IN ('vendorai','integration','bank','manual')),
  CONSTRAINT finance_data_authority_direction_chk CHECK (sync_direction IN ('in','out','bidirectional')),
  CONSTRAINT finance_data_authority_tenant_object_unique UNIQUE (tenant_id, object_type)
);

CREATE INDEX IF NOT EXISTS finance_data_authority_tenant_idx
  ON finance_data_authority(tenant_id);

CREATE TABLE IF NOT EXISTS finance_integration_sync_logs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id text NOT NULL REFERENCES finance_integration_registry(id) ON DELETE CASCADE,
  connection_id text REFERENCES finance_integration_connections(id) ON DELETE SET NULL,
  direction text NOT NULL,
  object_type text,
  status text NOT NULL,
  records_processed integer NOT NULL DEFAULT 0,
  records_failed integer NOT NULL DEFAULT 0,
  latency_ms integer,
  error_code text,
  error_message text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finance_integration_sync_logs_direction_chk CHECK (direction IN ('in','out','bidirectional'))
);

CREATE INDEX IF NOT EXISTS finance_integration_sync_logs_tenant_created_idx
  ON finance_integration_sync_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_integration_sync_logs_integration_idx
  ON finance_integration_sync_logs(integration_id);
CREATE INDEX IF NOT EXISTS finance_integration_sync_logs_status_idx
  ON finance_integration_sync_logs(status);

-- Registry global: leitura permitida ao runtime; escrita fica com owner/admin da migração.
GRANT SELECT ON finance_integration_registry TO vendorai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON finance_integration_connections TO vendorai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON finance_data_authority TO vendorai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON finance_integration_sync_logs TO vendorai_app;

ALTER TABLE finance_integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_data_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_integration_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_integration_connections_tenant_policy ON finance_integration_connections;
CREATE POLICY finance_integration_connections_tenant_policy ON finance_integration_connections
  FOR ALL TO vendorai_app
  USING (tenant_id = app_security.current_tenant_id() OR app_security.is_super_admin())
  WITH CHECK (tenant_id = app_security.current_tenant_id() OR app_security.is_super_admin());

DROP POLICY IF EXISTS finance_data_authority_tenant_policy ON finance_data_authority;
CREATE POLICY finance_data_authority_tenant_policy ON finance_data_authority
  FOR ALL TO vendorai_app
  USING (tenant_id = app_security.current_tenant_id() OR app_security.is_super_admin())
  WITH CHECK (tenant_id = app_security.current_tenant_id() OR app_security.is_super_admin());

DROP POLICY IF EXISTS finance_integration_sync_logs_tenant_policy ON finance_integration_sync_logs;
CREATE POLICY finance_integration_sync_logs_tenant_policy ON finance_integration_sync_logs
  FOR ALL TO vendorai_app
  USING (tenant_id = app_security.current_tenant_id() OR app_security.is_super_admin())
  WITH CHECK (tenant_id = app_security.current_tenant_id() OR app_security.is_super_admin());

-- Catálogo inicial. IDs estáveis para facilitar seed idempotente e referências futuras.
INSERT INTO finance_integration_registry
  (id, provider_key, name, category, auth_type, capabilities, webhook_support, default_direction)
VALUES
  ('finint_omie','omie','Omie','ERP','api_key','["clientes","pedidos","financeiro","estoque","fiscal"]',true,'bidirectional'),
  ('finint_bling','bling','Bling','ERP','oauth2','["pedidos","produtos","estoque","financeiro"]',true,'bidirectional'),
  ('finint_olist_tiny','olist-tiny','Olist/Tiny','ERP','oauth2','["pedidos","produtos","estoque","financeiro"]',true,'bidirectional'),
  ('finint_totvs','totvs','TOTVS','ERP','multiple','["financeiro","fiscal","estoque","compras"]',true,'bidirectional'),
  ('finint_sankhya','sankhya','Sankhya','ERP','multiple','["financeiro","compras","estoque","fiscal"]',true,'bidirectional'),
  ('finint_senior','senior','Senior','ERP','multiple','["financeiro","fiscal","estoque"]',true,'bidirectional'),
  ('finint_conta_azul','conta-azul','Conta Azul','ERP','oauth2','["financeiro","clientes","vendas"]',true,'bidirectional'),
  ('finint_sap','sap','SAP','ERP','multiple','["financeiro","compras","estoque","fiscal"]',true,'bidirectional'),
  ('finint_netsuite','netsuite','Oracle NetSuite','ERP','oauth2','["financeiro","pedidos","estoque"]',true,'bidirectional'),
  ('finint_dynamics','dynamics','Microsoft Dynamics','ERP','oauth2','["financeiro","clientes","pedidos"]',true,'bidirectional'),
  ('finint_open_finance','open-finance','Open Finance','Bancos e Open Finance','oauth2','["contas","extratos","saldos","conciliacao"]',true,'in'),
  ('finint_pix','pix','Pix','Bancos e Open Finance','multiple','["cobranca","recebimento","baixa"]',true,'bidirectional'),
  ('finint_cnab','cnab','CNAB','Bancos e Open Finance','file','["remessa","retorno","conciliacao"]',false,'bidirectional'),
  ('finint_ofx','ofx','OFX','Bancos e Open Finance','file','["extrato","conciliacao"]',false,'in'),
  ('finint_asaas','asaas','Asaas','Pagamentos e adquirencia','api_key','["pix","boleto","cartao","recorrencia","webhook"]',true,'bidirectional'),
  ('finint_mercado_pago','mercado-pago','Mercado Pago','Pagamentos e adquirencia','oauth2','["pix","cartao","webhook"]',true,'bidirectional'),
  ('finint_pagarme','pagarme','Pagar.me','Pagamentos e adquirencia','api_key','["cartao","pix","split","recorrencia"]',true,'bidirectional'),
  ('finint_stripe','stripe','Stripe','Pagamentos e adquirencia','api_key','["cartao","assinatura","webhook"]',true,'bidirectional'),
  ('finint_pagbank','pagbank','PagBank','Pagamentos e adquirencia','oauth2','["pix","boleto","cartao"]',true,'bidirectional'),
  ('finint_stone','stone','Stone','Pagamentos e adquirencia','multiple','["cartao","pix","adquirencia"]',true,'bidirectional'),
  ('finint_cielo','cielo','Cielo','Pagamentos e adquirencia','api_key','["cartao","adquirencia"]',true,'bidirectional'),
  ('finint_rede','rede','Rede','Pagamentos e adquirencia','api_key','["cartao","adquirencia"]',true,'bidirectional'),
  ('finint_nuvem_fiscal','nuvem-fiscal','Nuvem Fiscal','Fiscal','oauth2','["nfe","nfse","nfce","cte","mdfe"]',true,'bidirectional'),
  ('finint_shopify','shopify','Shopify','E-commerce e marketplaces','oauth2','["pedidos","clientes","produtos"]',true,'bidirectional'),
  ('finint_woocommerce','woocommerce','WooCommerce','E-commerce e marketplaces','api_key','["pedidos","clientes","produtos"]',true,'bidirectional'),
  ('finint_mercado_livre','mercado-livre','Mercado Livre','E-commerce e marketplaces','oauth2','["pedidos","produtos","envios"]',true,'bidirectional'),
  ('finint_shopee','shopee','Shopee','E-commerce e marketplaces','oauth2','["pedidos","produtos","envios"]',true,'bidirectional'),
  ('finint_amazon','amazon','Amazon','E-commerce e marketplaces','oauth2','["pedidos","produtos","estoque"]',true,'bidirectional'),
  ('finint_praca','praca-ai','Praça.AI','E-commerce e marketplaces','internal','["pedidos","split","logistica","afiliados"]',true,'bidirectional'),
  ('finint_inventory','inventory','Estoque VendorAI','Logistica e estoque','internal','["saldo","lote","movimentacao","inventario"]',false,'bidirectional'),
  ('finint_clicksign','clicksign','Clicksign','Contratos e assinatura','api_key','["assinatura","documentos","webhook"]',true,'bidirectional'),
  ('finint_docusign','docusign','DocuSign','Contratos e assinatura','oauth2','["assinatura","documentos","webhook"]',true,'bidirectional'),
  ('finint_zapsign','zapsign','ZapSign','Contratos e assinatura','api_key','["assinatura","documentos","webhook"]',true,'bidirectional'),
  ('finint_whatsapp','whatsapp','WhatsApp','Comunicacao','oauth2','["cobranca","avisos","negociacao"]',true,'bidirectional'),
  ('finint_email','email','E-mail/SMTP','Comunicacao','multiple','["cobranca","documentos","avisos"]',false,'out'),
  ('finint_sms','sms','SMS','Comunicacao','api_key','["avisos","cobranca"]',true,'out'),
  ('finint_meta','meta','Meta','Marketing','oauth2','["despesas","campanhas","performance"]',true,'in'),
  ('finint_google_ads','google-ads','Google Ads','Marketing','oauth2','["despesas","campanhas","performance"]',true,'in'),
  ('finint_cloudflare','cloudflare','Cloudflare','Infraestrutura','api_key','["uso","custos_relativos","saude"]',true,'in'),
  ('finint_railway','railway','Railway','Infraestrutura','api_key','["uso","custos_relativos","deploy"]',true,'in'),
  ('finint_supabase','supabase','Supabase','Infraestrutura','api_key','["banco","storage","uso_relativo"]',false,'in'),
  ('finint_openai','openai','OpenAI','IA','api_key','["uso","tokens","agentes","custos_relativos"]',false,'in'),
  ('finint_n8n','n8n','n8n','Automacao e API','api_key','["workflows","webhooks","integracoes_customizadas"]',true,'bidirectional'),
  ('finint_public_api','public-api','API publica VendorAI','Automacao e API','api_key','["entrada","saida","webhooks"]',true,'bidirectional'),
  ('finint_csv','csv','CSV','Arquivos e intercambio','file','["importacao","exportacao"]',false,'bidirectional'),
  ('finint_xlsx','xlsx','XLSX','Arquivos e intercambio','file','["importacao","exportacao"]',false,'bidirectional')
ON CONFLICT (provider_key) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  auth_type = EXCLUDED.auth_type,
  capabilities = EXCLUDED.capabilities,
  webhook_support = EXCLUDED.webhook_support,
  default_direction = EXCLUDED.default_direction,
  updated_at = now();

-- Defaults de autoridade: VendorAI continua mestre de CRM/cliente/pedido;
-- estoque/fiscal/pagamento podem ser reconfigurados por tenant ao conectar provedor externo.
