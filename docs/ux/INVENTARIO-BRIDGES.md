# Inventário de bridges — Marketing

Data: 2026-11-26
Método: leitura de código. Nenhuma bridge foi executada nem removida nesta rodada.

## Resumo

| Métrica | Valor |
|---|---|
| Arquivos `*Bridge*.tsx` em `components/marketing` | **22** |
| Componentes de marketing montados em `WorkspaceEnhancements` | **~29** |
| Bridges que **injetam DOM** (`document.querySelector`/`createElement`) | **10** |
| Bridges que **abrem portal React** (`createPortal`) | **12** |
| Bridges que **substituem `window.fetch`** | **2** |
| Bridges que **escondem elementos nativos** (`display:none`) | **6** |
| Arquivos com `MutationObserver` | **25** (todo o app) |
| Ocorrências de `setInterval` em marketing/runtime | **62** |

O padrão comum: a bridge **adiciona** uma camada sem remover a antiga, então a mesma
informação aparece duas vezes (contador, barra, botão), e cada camada decide sozinha qual
estado mostrar.

## Estratégias encontradas

| Estratégia | Exemplos | Risco |
|---|---|---|
| Injeção DOM + MutationObserver | `ContentProductionClarityBridge`, `ContentGeneratorQueueUxBridge`, `CampaignWorkspaceClarityBridge` | alto: briga com o React, some após re-render, cliques errados |
| Portal React (hospedado em elemento procurado) | `MediaPlanAutoProductionBridge`, `MediaPlanBatchControl`, `PlanningReviewBridge` | médio: depende de âncora existir |
| Substituição de `window.fetch` | `ContentContextSourcesBridge`, `MediaPlanProjectKindCompatibilityBridge` | alto: efeito global invisível |
| Componente inline (sem portal/DOM) | `MetaCampaignAudienceBridge`, `MessagingMediaPlanBridge` | baixo |

## Inventário por área

### Conteúdos & Criativos

| Arquivo | Estratégia | O que duplica / injeta | Risco | Recomendação |
|---|---|---|---|---|
| `ContentProductionClarityBridge.tsx` (501) | DOM + observer + 2 intervalos | jornada, métricas, filtros e toolbar **inteiros** sobre a fila nativa | **alto** (já causou contadores 0/duplicados) | fundir no `ContentProductionQueue` e apagar a bridge |
| `ContentGeneratorQueueUxBridge.tsx` (472) | DOM + observer | botão “Visualizar”, esconde “Revisar”, renomeia textos, botão de mídia | médio | fundir no componente nativo |
| `ContentApprovalClarityBridge.tsx` (153) | DOM | banner de lote e esconde gate legado | baixo | fundir |
| `ContentContextSourcesBridge.tsx` (67) | patch de `fetch` | painel “Contexto consultado pela IA” | médio | levar para React (resposta do generate) |
| `ContentPlanVisualCompletionBridge.tsx` (367) | portal | checklist de completude visual | baixo | fundir no planejamento |

### Planejamento

| Arquivo | Estratégia | O que duplica / injeta | Risco | Recomendação |
|---|---|---|---|---|
| `PlanningReviewBridge.tsx` (288) | portal + DOM | ações de revisão, esconde seções | médio | nativo |
| `MediaPlanBatchControl.tsx` (316) | portal | “Aprovar lote” / “Produzir lote” | baixo | manter como componente nativo |
| `MediaPlanLifecycleSummary.tsx` (176) | portal | resumo do ciclo | baixo | manter |
| `MediaPlanPublicationModeControl.tsx` (302) | portal | modo manual/automático | baixo | manter (ou mover para a peça) |
| `MediaPlanPreparationActionsBridge.tsx` (259) | portal | CTA “Preparar materiais” | baixo | fundir |
| `MediaPlanProductionCompatibilityBridge.tsx` (107) | DOM | esconde lote legado | baixo | remover quando o legado sair |
| `MediaPlanProjectKindCompatibilityBridge.tsx` (39) | patch de `fetch` | converte `kind` para `mixed` | médio | mover para o backend (normalizar no serviço) |

### Produção

| Arquivo | Estratégia | O que duplica / injeta | Risco | Recomendação |
|---|---|---|---|---|
| `MediaPlanAutoProductionBridge.tsx` (985) | portal | produção do plano inteiro + detalhes | **alto** (segundo produtor) | manter só como *pedido* ao worker |
| `QuotaSafeMediaPlanAutoProductionBridge.tsx` (267) | portal | envolve a anterior com cota/compra | médio | idem |
| `MediaPlanFailedRetryBridge.tsx` (367) | portal | reprocessar falhas | baixo | manter |
| `MediaPlanProductionRuntimeBridge.tsx` (413) | portal + DOM + 2 observers | status do runtime, detalhes | médio | fundir |

### Campanhas, verba e autonomia

| Arquivo | Estratégia | O que injeta | Risco | Recomendação |
|---|---|---|---|---|
| `CampaignWorkspaceClarityBridge.tsx` (259) | DOM | detalhes/limpeza da campanha | médio | fundir |
| `CampaignAbWinnerApprovalBridge.tsx` (210) | inline | aprovação de vencedor A/B | baixo | manter |
| `MarketingOverviewBridge.tsx` (560) | portal + DOM | visão geral e banners | médio | fundir no `ContentHub` |
| `MarketingAutonomyControl.tsx` / `MarketingAutonomyAudit.tsx` | portal | política de autonomia | baixo | manter |
| `MediaPlanBudgetExecutionBridge.tsx` (200) | portal | execução de verba | baixo | manter |
| `AcquisitionInvestmentIntelligence.tsx` / `MediaPlanPerformanceCommandCenter.tsx` | React | inteligência de investimento | baixo | manter |
| `AdsCreativePreviewBridge.tsx` (219) | portal | prévia de criativo | baixo | fora do funil de conteúdo |

### Resultados / rastreamento

| Arquivo | Estratégia | O que injeta | Risco | Recomendação |
|---|---|---|---|---|
| `SearchPerformanceTrackingBridge.tsx` (320) | portal + observer | painel de busca | baixo | manter |
| `SeoAuthorityTrackingBridge.tsx` (81) | portal | autoridade SEO | baixo | manter |

## Riscos sistêmicos

1. **Duas camadas, um estado** — cada bridge lê o DOM e decide o que mostrar; quando o React
   re-renderiza, a bridge pode ficar com referência velha (foi a causa dos contadores zerados).
2. **Clique sequestrado** — checkboxes/botões injetados dentro de botões nativos já causaram
   aprovação acidental.
3. **Custo invisível** — 62 `setInterval` + 25 `MutationObserver` no app; cada bridge acorda
   a cada 1s e reescreve DOM.
4. **Patch global de `fetch`** — duas bridges interceptam todas as requisições; qualquer erro
   ali afeta a aplicação inteira.
5. **Âncora frágil** — portais procuram elementos por texto/classe; uma mudança de layout
   remove a âncora e a bridge simplesmente não aparece.

## Ordem de remoção (fase 2, do menor para o maior risco)

1. `MediaPlanProductionCompatibilityBridge` (só esconde legado).
2. `MediaPlanProjectKindCompatibilityBridge` (mover regra para o backend).
3. `ContentContextSourcesBridge` (levar para React).
4. `ContentApprovalClarityBridge` + `ContentPlanVisualCompletionBridge`.
5. `ContentGeneratorQueueUxBridge`.
6. `ContentProductionClarityBridge` (por último: é a tela mais crítica e já foi estabilizada).

## Critérios de aceite

- [ ] Nenhuma tela de Marketing depende de injeção DOM para mostrar estado.
- [ ] Nenhum patch global de `fetch`.
- [ ] Contadores e listas vêm do mesmo componente/estado.
- [ ] Zero `setInterval` de bridge para sincronizar UI.
