# Registro Mestre — ARQDOR-02 / v2026.10.31-module-keys

**Data:** 2026-10-31
**Objetivo:** remover a dependência do pacote legado `vendor.growth` para o acesso ao Arqdor, restaurando a capability `arch` no perfil `arqdor.ai` e registrando o direito do tenant CasaForteICF.

## Escopo autorizado
- Criar migration nova (sem editar a 528) restaurando `module_keys = ["arch","obras"]` em `commercial_product_profiles` para `arqdor.ai`.
- Inserir o entitlement `arqdor.ai` para o tenant `f437c65b-2178-4cd1-a16c-c3c4f1449752`.
- Rodar teste de óleo em `GET /api/arch/projetos` com `vendor.growth` desligado.

## Rastreabilidade
- Branch: `fix/arqdor-module-keys-20261031`
- PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3709 (draft)
- Commit da migration: `08ad434072825a778602b08a0a4c80b296648fa4`
- Migration: `lib/db/migrations/568_arqdor_restore_arch_module_keys.sql`
- Base: `main` @ `09e1f49740986e4803e0a6bccca405bd0537285b`

## Evidências — banco de produção
Banco: `vendorai-prod-db` / `vendorai_migration_prepare` (Postgres local; a API não usa o Supabase para dados).

### Antes
- `commercial_product_profiles.arqdor.ai.module_keys = []`
- `tenant_entitlements` do tenant: `vendor.growth` (ativo) e `vendor.hotelaria` (ativo); sem `arqdor.ai`.

### Aplicação
- `UPDATE 1` em `commercial_product_profiles`.
- `INSERT` de `tenant_entitlements (arqdor.ai, source=manual, active=true)` — 1 linha.

### Depois
- `arqdor.ai.module_keys = ["arch","obras"]`
- `tenant_entitlements`: `arqdor.ai`, `vendor.growth`, `vendor.hotelaria` (todos ativos).

## Teste de óleo
API: `vendorai-prod-api-final` (127.0.0.1:5001), health 200.

| Cenário | Resultado |
|---|---|
| `vendor.growth` desativado temporariamente | `GET /api/arch/projetos` -> **HTTP 200**, 4 projetos |
| `vendor.growth` restaurado | `GET /api/arch/projetos` -> **HTTP 200**, 4 projetos |

Conclusão: o acesso ao Arqdor passou a funcionar **sem depender do `vendor.growth`**; o pacote legado foi restaurado e permanece ativo para os demais módulos.

## Estados
- Implementação: aplicada no banco de produção em 2026-10-31.
- Validação técnica: **validado** (HTTP 200 com growth desligado).
- Homologação: pendente de deploy da migration pelo pipeline (aplicação idempotente).
- Produção (código): a imagem em execução não contém a 568; ela será registrada em `vendorai_schema_migrations` no próximo boot/deploy.
- Merge/deploy: não executados; PR em draft aguardando aprovação.

## Rollback
```sql
UPDATE commercial_product_profiles SET module_keys='[]'::jsonb WHERE commercial_key='arqdor.ai';
DELETE FROM tenant_entitlements
WHERE tenant_id='f437c65b-2178-4cd1-a16c-c3c4f1449752'
  AND commercial_key='arqdor.ai' AND source='manual';
```

## Riscos e pendências
- `vendor.build` e `vendor.complete` continuam com `module_keys=[]`; se forem vendidos como plano, precisam da mesma correção (decisão separada).
- A migration 568 só passa a constar no controle de migrations após o deploy; até lá, `migrate:status` a mostrará como pendente.
- Executar o gate completo (tsc/build/vitest) no resultado do merge antes de promover.