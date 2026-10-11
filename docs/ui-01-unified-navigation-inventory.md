# UI-01 — Inventário e plano de migração da navegação unificada

Issue de origem: #3452. Status: fundação de tipos/catálogo implementada na branch; **ainda não integrada à navegação de produção**.

## Inventário inicial confirmado por inspeção de código

| Experiência | Referência atual | Estratégia |
|---|---|---|
| Dashboard | `artifacts/frontend/src/pages/dashboard/Dashboard.tsx` | Reaproveitar sob contexto empresarial |
| Login | `artifacts/frontend/src/pages/Login.tsx` | Evoluir para identidade única sem trocar sessões existentes |
| CRM | `artifacts/frontend/src/pages/Leads.tsx`, `Deals.tsx` | Manter acesso restrito por tenant |
| Portal do cliente | `artifacts/frontend/src/pages/arch/PortalCliente.tsx`, `PortalObra.tsx` | Unificar jornada gradualmente |
| Marketplace | `artifacts/frontend/src/pages/Marketplace.tsx`, `pages/arch/Marketplace.tsx` | Auditar sobreposições e preservar pedidos |
| Financeiro | `artifacts/frontend/src/pages/AdminFinanceiro.tsx`, `ComissoesVendedor.tsx`, `pages/partner/PartnerCommissions.tsx` | Separar saldos/comissões por negócio, sem expor custos privados |
| Navegação | `artifacts/frontend/src/components/layout/SidebarLayout.tsx`, `SidebarLayoutLegacy.tsx`, `AppLegacy.tsx` | Feature flag e integração incremental |
| Configurações | `artifacts/frontend/src/pages/Configuracoes.tsx`, `Usuarios.tsx` | Expandir vínculos e políticas de acesso |

**Atenção:** presença de componente não comprova rota ativa, homologação, permissão correta nem conclusão funcional. Mapear caminhos reais e chamadas de API antes da conexão.

## Contrato de apresentação inicial

`unifiedExperienceCatalog.ts` fornece experiências, contextos e posições financeiras independentes. É metadata de UI: NÃO autoriza acesso. O backend continuará a validar identidade, vínculo com tenant/projeto, operação, recursos e campos, inclusive no acesso a anexos e URLs assinadas.

## Passos para integração (não executados neste primeiro corte)
1. Auditar rotas montadas e a sessão existente, mapear duplicações e estados de navegação.
2. Implementar API de contextos a partir de vínculos persistidos e validados em servidor.
3. Criar seletor de espaços pessoal/empresa/projeto atrás de feature flag, sem depender de localStorage como fonte de autorização.
4. Adaptar menu e dashboard para o catálogo com fallback para navegação atual.
5. Criar fluxo de link público para lote + pré-projeto e continuidade via identidade única.
6. Integrar módulos financeiros por contrato/transação; split, seguros e pagamentos em lote separado e sandbox.
7. Validar multi-tenancy, permissão por campo, convites, revogação, mobile e acessibilidade.
8. Registrar evidências de testes e homologar antes de liberar.

## Testes

Arquivo `artifacts/frontend/src/lib/unifiedExperienceCatalog.test.ts` cobre filtro de experiências, cross-tenant, projeto e posições financeiras. Para executar em ambiente do monorepo: `pnpm --filter @workspace/frontend exec vitest run src/lib/unifiedExperienceCatalog.test.ts`. **Não há evidência de execução CI neste registro.**

## Regras de entrega
- Não alterar produção; sem merge/deploy automático.
- Preservar CRM, portal e módulos existentes até migração testada.
- Conferir acessos no servidor; ocultação visual sozinha não é segurança.
- Split e seguro exigem provedor e parceiros autorizados, aceite e conciliação.
