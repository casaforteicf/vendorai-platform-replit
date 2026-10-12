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
