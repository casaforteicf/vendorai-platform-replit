# CRM · Leads — novo layout e cor por responsável (2026-10-14)

Escopo autorizado pelo solicitante a partir do modelo visual "Painel de leads do Vendor.ai".

## Entregue
- Pipelines no topo (`CrmPipelineTabs`) em Leads e Negócios, com a seleção atual destacada.
- Menu lateral: seletor da empresa ativa logo abaixo da logo (`TenantSwitcher`, mesma regra do TAD); recolhido mostra só ícones com o nome ao passar o mouse.
- Leads: atalhos clicáveis (Todos, Sem responsável, Ações atrasadas, Sem próxima ação); busca por nome, empresa ou telefone; filtros de segmento, status, responsável e maturidade; limpar filtros; colunas ajustáveis (salvas no navegador); paginação de 25.
- Lista: contato com nome, empresa e WhatsApp agrupados; negócios ativos clicáveis; próxima ação (tarefa, data/hora, atraso em vermelho; "Definir próxima ação" cria uma atividade); ações rápidas Abrir, edição rápida e menu ⋯ (WhatsApp, próxima ação, trocar responsável, excluir).
- Cor do responsável: faixa lateral na linha/card, avatar e legenda clicável que filtra; sem responsável em cinza com "Atribuir responsável". Cor configurável pelo administrador em Usuários → Distribuição; sem configuração usa paleta automática. O histórico de transferência já existente (`lead_responsavel_historico`/`responsibilityHistory`) é mantido.
- Funções preservadas: importação CSV, excluídos/restaurar, churn, briefing, segmento editável, ordenações.

## Backend
- `GET /api/tenants/:tenantId/leads-overview-context` passa a devolver `nextActionsByLeadId` (atividade pendente/planejada mais próxima) e `userColorsById`.
- `GET/PUT /api/tenants/:tenantId/user-colors[/:userId]` (admin do tenant / super admin).
- Migration aditiva `567_tenant_user_colors.sql` (tabela nova com RLS). **Aplicação em homologação/produção depende de aprovação.** Sem a migration, a tela funciona com a paleta automática e o seletor de cor fica oculto.

## Validação
- `tsc -p tsconfig.launch-ci.json --noEmit` (api-server): sem erros.
- `pnpm run build` (frontend): OK, bundle-budget dentro do limite (Leads 46,40 kB / 50 kB).
