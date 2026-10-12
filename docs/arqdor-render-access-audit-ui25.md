# ARQDOR-SEC-UI-25 — auditoria preliminar de autorização de renders

Data: 2026-10-12. Escopo: leitura de código na branch do PR #3494; **não é teste de invasão ou homologação**.

## Evidências verificadas
- `artifacts/api-server/src/routes/arch_ai_render.ts`: GET `/arch/ai-renders` exige `authenticate`, obtém `tenantId(req)` e filtra `archAiRendersTable.tenantId` mais `projectId` ou `conceptProjectId`; ambiente é opcional.
- GET `/arch/ai-render/:id` filtra render por `id` e `tenantId`.
- `artifacts/api-server/src/middlewares/auth.ts`: `authenticate` verifica bearer JWT; o middleware contém tratamento específico para `accessScope === "preprojeto"`.
- O filtro de tenant nas duas rotas não mostra, isoladamente, autorização por **usuário/equipe/projeto dentro do mesmo tenant**. Isso é lacuna de evidência, **não vulnerabilidade confirmada**.
- A decisão de acesso não deve confiar em `project_id`, `tenant_id` ou papel enviados pelo cliente.

## Critérios para implementação posterior
1. Identificar política canônica existente de acesso por projeto (admin, autor, responsável, membros convidados e portais) e reutilizar seu serviço autorizado, em vez de criar regra paralela.
2. Antes de retornar histórico ou mídia assinada, checar acesso ao projeto/Concept associado **após** autenticação e escopo do tenant. Para um render por ID, resolver o projeto do próprio registro primeiro.
3. Definir explicitamente o comportamento dos renders sem `projectId` e dos projetos Concept; negar por padrão os casos sem uma autorização aplicável.
4. Verificar todas as rotas relacionadas: histórico, render individual, preview/máscara, adjust, versões, aprovações e URL de mídia.
5. Preservar o comportamento autorizado para superadmin e agentes internos por política explícita e auditável.

## Matriz de testes obrigatória
| Cenário | Resultado esperado |
| --- | --- |
| Sem token | 401 |
| Token inválido | 401 |
| Usuário tenant A solicita render do tenant B | Negação (sem dados, sem URL assinada) |
| Usuário comum sem vínculo ao projeto no mesmo tenant | Negação conforme RBAC canônico |
| Usuário autorizado ao projeto | Acesso somente aos renders do projeto |
| Token de pré-projeto tenta histórico alheio | Negação pelo escopo restrito |
| Concept com vínculo permitido | Acesso conforme política específica |
| Troca rápida de projeto/tenant no frontend | Nenhum vazamento pelo cache ou respostas antigas |

## Estado
- Auditoria estática parcial feita.
- **Sem alterações de autorização do servidor**, migração de banco, merge ou deploy.
- Pendentes: encontrar o verificador canônico de acesso por projeto, cobrir as demais rotas, criar testes integrados multi-tenant/intra-tenant e homologar.

## UI-26 — rastreamento da política canônica (12/10/2026)

Evidências adicionais de leitura estática:
- `lib/db/src/schema/arch_projetos.ts` declara `tenantId`, vínculos opcionais `leadId`, `dealId`, `obraId`, `arquitetoResponsavel` (texto) e token de portal, mas **não declara um ACL explícito de membros/permissões** nesse modelo.
- `artifacts/api-server/src/routes/arqdor_model_files.ts` verifica JWT (`req.user.sub`), tenant e existência do projeto em `archProjetosTable` antes de listar arquivos. Essa verificação é de **pertença ao tenant**, não prova permissão individual ao projeto.
- Busca no código por `requireProjectAccess` e `canAccessProject` não retornou função canônica com esses nomes; isso **não prova ausência** de política de autorização em outros serviços.

**Decisão:** não introduzir guard de projeto improvisado baseado em `arquitetoResponsavel` (campo de nome livre) nem bloquear indiscriminadamente usuários legítimos. Antes de modificar o backend, rastrear regras do CRM/obra/projeto vinculados e decidir explicitamente a política autorizada para admin, profissional responsável, equipe, convidados e portal. Se não existir ACL persistido confiável, isso requer definição de modelo e migração homologada.

Critério adicional de aceitação: testes integrados com dois usuários do mesmo tenant — um autorizado e outro não — em histórico, render individual, geração de URL assinada e modelo GLB, além de isolamento entre tenants.

## UI-27 — descoberta de autorização reutilizável

- Há serviço real em `artifacts/api-server/src/lib/lead-scope-access.ts`: `canAccessLead(req, tenantId, leadId)` verifica tenant, privilégio `leads:view_all` e `leads.assignedTo`. `canViewAllScopedData` considera permissões persistidas do usuário e atores internos autorizados.
- `lib/db/src/schema/obras.ts` possui `responsavelId` e vínculos de origem com lead/deal; `arch_projetos.leadId` e `arch_projetos.obraId` podem servir de referência após definir a política de autorização.
- **Não reutilizar `canAccessLead` diretamente e isoladamente** nas rotas de render: projetos sem lead são possíveis; administração, responsáveis de obra, membros e convidados exigem regras explícitas. A permissão `leads:view_all` não é automaticamente equivalente a ver todos os projetos.
- Próximo passo de implementação: desenhar `canAccessArchProject` apoiado na política real e em vínculos validados por tenant; decidir fallback seguro para projetos legados sem lead/obra; depois testar GET de histórico, render individual e rotas de mídia/edição.

Este achado é evidência de código estático, não é homologação de autorização.
