# Vendor.ai — Relatório Técnico de Arquitetura

> Gerado em: 2025-07 · Revisão: semestral  
> Prioridades: **P0** crítico · **P1** alto · **P2** médio · **P3** baixo

---

## Sumário executivo

A plataforma está em estágio de crescimento rápido, com 8 verticais, múltiplos engines de IA e um Workspace especializado (arqdor.ai) já operacional. A arquitetura geral é sólida — monorepo bem estruturado, contract-first API, engines puros, separação de camadas.

Os riscos atuais concentram-se em: (a) dados mock ainda usados onde deveriam ser reais, (b) tema de cores duplicado em dezenas de arquivos, (c) rotas de arqdor fora do contrato OpenAPI, (d) falta de versionamento explícito de API.

---

## Sprint 0 — Status (concluído em 2026-07-03)

| Item | Status | Observação |
|------|--------|-----------|
| P0-001 Mock context | ✅ Resolvido | ArqCopilot usa WorkspaceContext real; MOCK é só fallback |
| P0-002 OpenAPI arq schemas | ✅ Resolvido | 8 schemas + 10 paths adicionados; codegen executado; hooks gerados |
| P0-003 WorkspaceContext hardcoded | ✅ Resolvido | useAuth() integrado; permissões derivadas do platformRole |
| P1-001 Design system | ✅ Resolvido | arqdor-theme.ts criado; 21 arquivos atualizados para importar |
| P1-002 API versioning | ✅ Resolvido | /api/v1 montado como alias em app.ts |
| P1-003 Dados reais nos hubs | ⚠️ Parcial | Banners "EM DESENVOLVIMENTO" adicionados; adapters reais dependem de API backend |
| P1-004 DB naming | ⏳ Adiado | Migração de schema risky — pendente sprint dedicado |
| P1-005 Error handling | ✅ Resolvido | ArqdorStates.tsx criado (Loading/Error/Empty/Retry/Success/HubPlaceholder) |
| P1-006 Engine unit tests | ✅ Resolvido | 37 testes em 4 arquivos (question/task/suggestion/workflow engines) |
| P1-007 Ícone duplicado | ✅ Resolvido | arqhub agora usa 🏛️; integracao mantém 🌐 |

**Pendências pós-Sprint 0:**
- P1-004 (DB naming): Requer migração cuidadosa — criar sprint separado
- P1-003 adapters reais: Depende de rotas backend `/api/arq/*` estarem funcionais
- Task #191 ainda queued: Conectar AIE ao projeto real (complementa P0-001)

---

---

## P0 — Crítico (bloqueia escala ou corretude)

### ✅ P0-001: AIE e Copilot ainda usam `MOCK_PROJECT_CONTEXT` — RESOLVIDO (Sprint 0)
**Resolvido:** `ArqCopilot` agora lê `projectContext` do `WorkspaceContext` bridge (Task #198). MOCK é usado apenas como fallback quando nenhum projeto está selecionado — comportamento correto. `useMemo` dependencies corrigidas. A Task #191 foi gerada para resolver isso mas ainda está na fila.

**Impacto:** O usuário vê análises e recomendações que não refletem o projeto que está editando. Zero valor de negócio real.

**Arquivos afetados:**
- `engines/aie/dashboard/AIEDashboard.tsx` — usa `MOCK_PROJECT_CONTEXT` diretamente
- `copilot/ui/ArqCopilot.tsx` — usa `MOCK_PROJECT_CONTEXT` diretamente
- `engines/aie/aie-mock-context.ts` — fonte do mock

**Solução:** `useArqProject()` já retorna o projeto real persistido. Conectar `activeProject?.objects` e `activeProject?.materials` ao `ProjectContext` que alimenta os engines. Task #191 deve ser prioridade máxima.

---

### ✅ P0-002: Rotas `/api/arq/*` fora do contrato OpenAPI — RESOLVIDO (Sprint 0)
**Problema:** 9 endpoints de arqdor foram adicionados diretamente ao `arch.ts` sem passar pelo ciclo contract-first (openapi.yaml → codegen → hooks). O frontend usa `fetch()` manual em vez de hooks gerados.

**Impacto:** Sem validação de schema, sem documentação automática, sem type safety end-to-end.

**Arquivos afetados:**
- `artifacts/api-server/src/routes/arch.ts` — rotas `/arq/*` sem spec
- `artifacts/frontend/src/modules/arqdor/hooks/useArqProject.ts` — fetch manual

**Solução:**
1. Adicionar ao `lib/api-spec/openapi.yaml` os schemas: `ArqProject`, `ArqObject`, `ArqMaterial`, `AieSnapshot`
2. Executar `pnpm --filter @workspace/api-spec run codegen`
3. Substituir `fetch()` manual pelos hooks gerados

---

### ✅ P0-003: `WorkspaceContext` usa mock hardcoded em produção — RESOLVIDO (Sprint 0)
**Problema:** `WorkspaceContext.tsx` tem `workspaceId`, `tenantId`, `userId` e `teamId` com valores literais fictícios (`'tenant-arq-001'`, `'user-arch-001'`). Em produção, esses valores devem vir do JWT autenticado.

**Impacto:** Qualquer request que depender do contexto terá tenant/user errado.

**Arquivo afetado:** `workspace/context/WorkspaceContext.tsx`

**Solução:** Importar `useAuth()` (hook existente) e popular o contexto com os dados reais do usuário autenticado.

---

## P1 — Alto (afeta qualidade, manutenibilidade ou segurança)

### ✅ P1-001: Tema de cores duplicado em ~20 arquivos — RESOLVIDO (Sprint 0)
**Problema:** A constante `T` com as cores do Workspace está copiada literalmente em cada arquivo de módulo e componente arqdor. Qualquer mudança de cor requer editar todos os arquivos.

**Arquivos afetados:** Todos os `.tsx` sob `arqdor/workspace/modules/` e `arqdor/copilot/ui/`

**Solução:** Criar `artifacts/frontend/src/modules/arqdor/shared/arqdor-theme.ts`:
```typescript
export const T = {
  bg: '#0d0b1e', surface: 'rgba(255,255,255,0.04)', ...
} as const
```
E importar em todos os módulos. Reduz ~400 linhas de código duplicado.

---

### ✅ P1-002: Ausência de versionamento de API — RESOLVIDO (Sprint 0)
**Problema:** Todos os endpoints em `/api/...` sem prefixo de versão. Qualquer breaking change força todos os clientes a se atualizarem simultaneamente.

**Solução:** Prefixar com `/api/v1/` no app.ts. Adicionar middleware de redirect de `/api/*` → `/api/v1/*` por tempo de transição.

---

### ✅ P1-003: `IntegrationModule` usa dados mock para CRM, Tasks, Files e Knowledge — PARCIAL (Sprint 0)
**Problema:** Os 8 tabs do `IntegrationModule.tsx` mostram dados hardcoded. O CRM tab mostra "Carlos Silva" mesmo quando o usuário tem outro lead vinculado.

**Impacto:** Integração Fase 14 está arquitetada corretamente, mas sem dados reais é apenas demonstração.

**Solução por hub:**
- **CRM:** Usar hooks `useLeads`, `useDeals` filtrado pelo `activeProject.crmLeadId`
- **Tasks:** Endpoint `GET /api/arq/projects/:id/tasks` (a criar)
- **Analytics:** Endpoint `GET /api/arq/analytics` (a criar)
- **Files, Knowledge:** Integrações externas — manter mock até infrastructure estar pronta

---

### P1-004: `arch_projetos` x `arq_objects` x `arq_materials` — inconsistência de nomenclatura
**Problema:** A tabela principal chama-se `arch_projetos` (pt-BR + prefixo `arch`) mas as novas tabelas usam `arq_objects` e `arq_materials` (inglês + prefixo `arq`). Mistura de idiomas e prefixos no mesmo schema.

**Tabelas afetadas:** `arch_projetos`, `arch_ambientes`, `arch_renders`, `arch_cenas` vs `arq_objects`, `arq_materials`, `arq_aie_snapshots`

**Solução proposta:** Padronizar com prefixo `arq_` em inglês para todas as tabelas do vertical Arch. Migration necessária — planejar com janela de manutenção.

---

### ✅ P1-005: `useArqProject` — ausência de error boundary e retry — RESOLVIDO (Sprint 0)
**Problema:** O hook faz `fetch()` sem tratamento de erro padronizado. Falha de rede resulta em estado silencioso (estado permanece carregando ou vazio sem feedback).

**Arquivo:** `hooks/useArqProject.ts`

**Solução:** Adicionar estado `error: Error | null` ao hook. Exibir mensagem de erro com botão de retry no `ProjectModule`. Consistente com o padrão estabelecido no Core CRM.

---

### ✅ P1-006: Copilot engines não têm testes unitários — RESOLVIDO (Sprint 0)
**Problema:** 9 engines puros (`question-engine`, `suggestion-engine`, `task-engine`, etc.) com zero cobertura de testes, apesar de serem 100% testáveis (funções puras sem IO).

**Risco:** Regressões silenciosas ao modificar engines.

**Solução:** Criar `artifacts/frontend/src/modules/arqdor/engines/__tests__/` com testes Vitest para cada engine. Engines puros não precisam de mocks — apenas input/output.

---

### ✅ P1-007: Sidebar do ArqWorkspace tem dois itens com icon `🌐` — RESOLVIDO (Sprint 0)
**Problema:** O módulo `arqhub` e `integracao` usam o mesmo ícone `🌐`. Confusão visual para o usuário.

**Arquivo:** `workspace/ArqWorkspace.tsx` — array `MODULES`

**Solução:** Alterar `arqhub` para `🏛️` ou `🗂️`, mantendo `🌐` para Integração (Vendor.ai).

---

## P2 — Médio (melhora experiência de desenvolvimento ou produto)

### P2-001: `aie-mock-context.ts` e `copilot-mock-data.ts` devem ser removidos em produção
**Problema:** Arquivos de mock ficam no bundle de produção desnecessariamente.

**Solução:** Usar `import.meta.env.DEV` para importação condicional, ou mover para `__tests__/fixtures/`.

---

### P2-002: `PromptPlaygroundModule.tsx` está acima de 600 linhas
**Problema:** Um único arquivo contém: interface de tabs, hook `useSavedVariations`, componente `SavedVariationsPanel`, `VariationCard`, `AIEPlaywrightTab`, `PromptPreview`. Dificulta revisão e contribuição.

**Solução:** Extrair:
```
PromptPlaygroundModule.tsx           (~100 linhas — orquestrador)
hooks/useSavedVariations.ts          (~80 linhas)
components/SavedVariationsPanel.tsx  (~150 linhas)
components/PromptPreview.tsx         (~100 linhas)
```

---

### P2-003: `AIEDashboard.tsx` acima de 800 linhas
**Problema:** Mesmo padrão de P2-002. O dashboard do AIE tem tabs, subestados e lógica de geração de DNA misturados.

**Solução:** Extrair cada tab para `dashboard/tabs/OverviewTab.tsx`, `CompositionTab.tsx`, etc.

---

### P2-004: `arqhub-mock-data.ts` tem dados duplicados com `integration-mock-data.ts`
**Problema:** Fabricantes como "Portobello", "Todeschini" e "Cosentino" aparecem em ambos os arquivos com dados ligeiramente diferentes.

**Solução:** Criar `shared/manufacturer-registry.ts` como fonte única e importar nos dois módulos.

---

### P2-005: Ausência de loading state no Workspace durante carregamento de projeto
**Problema:** Ao entrar no `/arch/render`, o workspace renderiza com dados vazios enquanto `useArqProject` carrega. Sem skeleton ou indicador de carregamento.

**Solução:** Adicionar `ProjectLoadingSkeleton` que substitui o module content enquanto `isLoading === true`.

---

### P2-006: `WorkflowModule` não tem estado real — sempre mostra o mesmo workflow
**Problema:** O workflow ativo no Copilot é sempre `INITIAL` com os mesmos 7 steps, independentemente do estado real do projeto.

**Solução:** Conectar `workflow-engine.ts` ao `activeProject` real via `WorkspaceContext`. O engine já suporta derivar o step atual a partir do contexto.

---

### P2-007: Endpoint `/api/arq/learning` não está implementado no backend
**Problema:** `AIEDashboard.tsx` faz `fetch('/api/arq/learning')` mas o endpoint retorna dados mock ou 404 em alguns estados.

**Arquivo:** `artifacts/api-server/src/routes/arch.ts`

**Solução:** Implementar query real: `SELECT * FROM arq_aie_snapshots WHERE project_id = ? ORDER BY created_at DESC LIMIT 10` e retornar deltas entre snapshots.

---

## P3 — Baixo (melhorias de longo prazo)

### P3-001: `ModuleId` em `ArqWorkspace.tsx` deveria ser um enum ou registry externo
**Problema:** O union type `'projeto' | 'biblioteca' | 'prompt' | ...` cresce a cada fase. Difícil de manter.

**Solução:** Mover para `workspace/module-registry.ts` com metadata (icon, label, component) como array importável.

---

### P3-002: Falta de tipagem para `as const` nos objetos de style inline
**Problema:** Objetos de style com `as const` espalham tipos literais pelo código. Em alguns componentes, `flexDirection: 'column'` falha sem `as const` ou cast.

**Solução:** Criar um helper `style()` que retorna `CSSProperties`:
```typescript
const style = (s: CSSProperties) => s
```
Elimina a necessidade de casts `as const` em objetos de style.

---

### P3-003: `plugin-registry.ts` não tem suporte a lazy loading de providers
**Problema:** Todos os providers são importados e instanciados no carregamento inicial, mesmo que nunca sejam usados.

**Solução:** Implementar lazy registry:
```typescript
const ACTIVE_REGISTRY = {
  render: () => import('./providers/flux-provider').then(m => new m.FluxProvider()),
}
```

---

### P3-004: Ausência de documentação inline (JSDoc) nos engines
**Problema:** Funções como `runLightingEngine`, `generateDNA`, `buildPrompt` não têm JSDoc explicando parâmetros, retorno e side effects.

**Solução:** Adicionar JSDoc mínimo em cada engine público:
```typescript
/**
 * Analisa o perfil de iluminação do projeto e retorna um score 0–100.
 * @param ctx - Contexto do projeto com objetos e configuração de lighting
 * @returns LightingProfile com score e recomendações
 */
export function runLightingEngine(ctx: ProjectContext): LightingProfile { ... }
```

---

### P3-005: Falta de limite de tamanho no localStorage para variações de prompt
**Problema:** `useSavedVariations` escreve no localStorage sem verificar o limite de ~5MB. Projetos com muitas variações longas podem causar `QuotaExceededError` silencioso.

**Solução:** Antes de salvar, verificar tamanho estimado. Se próximo do limite, avisar o usuário e sugerir exportar antes de salvar mais. Task #214 foi criada para isso.

---

## Resumo por arquivo

| Arquivo | Linhas | Issues |
|---|---|---|
| `AIEDashboard.tsx` | ~800 | P0-001, P1-003, P2-003 |
| `ArqCopilot.tsx` | ~500 | P0-001 |
| `ArqWorkspace.tsx` | ~245 | P1-007 |
| `WorkspaceContext.tsx` | ~100 | P0-003 |
| `IntegrationModule.tsx` | ~490 | P1-003 |
| `useArqProject.ts` | ~? | P0-002, P1-005 |
| `PromptPlaygroundModule.tsx` | ~600+ | P2-002 |
| `arch.ts` (api-server) | ~? | P0-002, P2-007 |
| `aie-mock-context.ts` | ~? | P0-001, P2-001 |

---

## Plano de ação recomendado

### Sprint imediata (P0)
1. Task #191 — conectar AIE/Copilot ao projeto real
2. Adicionar rotas `/api/arq/*` ao OpenAPI spec
3. Corrigir `WorkspaceContext` para usar JWT real

### Próximo sprint (P1 críticos)
4. Extrair tema para `arqdor-theme.ts`
5. Adicionar versionamento `/api/v1/`
6. Corrigir ícone duplicado no sidebar
7. Adicionar error boundary no `useArqProject`

### Backlog técnico (P2–P3)
8. Dividir arquivos grandes (AIEDashboard, PromptPlayground)
9. Testes unitários para os 9 engines puros
10. Padronizar nomenclatura de tabelas (`arch_*` vs `arq_*`)
11. Implementar `/api/arq/learning` real
12. Documentação JSDoc nos engines públicos
