# Financeiro + ERP Hub — Integration Registry

Esta camada substitui o mapa de integrações puramente visual por um registry persistente e multi-tenant.

## Entidades

- `finance_integration_registry`: catálogo global de provedores/capacidades.
- `finance_integration_connections`: estado de conexão e saúde por tenant.
- `finance_data_authority`: source-of-truth por objeto (cliente, pedido, estoque, NF, pagamento etc.).
- `finance_integration_sync_logs`: trilha de sincronizações, erros e latência.

## Regras

1. Nenhuma integração financeira nova deve existir somente em código; deve ser registrada no catálogo.
2. Nenhum segredo deve ser persistido em `metadata`; credenciais continuam nos mecanismos seguros existentes.
3. Toda sincronização deve declarar direção e respeitar `finance_data_authority`.
4. Conflitos usam `reject_and_review` por padrão.
5. Dashboards expõem saúde/cobertura em percentuais; valores monetários permanecem somente na operação financeira que exige valor real.
6. Tabelas por tenant usam RLS e aceitam bypass apenas para Super Admin.

## APIs

- `GET /api/tenants/:tenantId/finance-integrations`
- `GET /api/tenants/:tenantId/finance-integrations/source-authority`
- `PUT /api/tenants/:tenantId/finance-integrations/source-authority`
- `GET /api/tenants/:tenantId/finance-integrations/:providerKey/logs`

## Próximas ligações

Conectores existentes (Asaas, Nuvem Fiscal, Meta, Google, WhatsApp, infraestrutura e demais integrações) devem gravar/atualizar `finance_integration_connections` e `finance_integration_sync_logs` durante conexão, health check, webhook e sincronização.
