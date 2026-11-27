# Inventário de telas e estados — Marketing

Data: 2026-11-26
Método: leitura do código (rotas, componentes e enums) + evidências das sessões de uso.
Escopo: funil Planejamento → Produção → Revisão/Aprovação → Publicação → Resultados.
Limite: sem acesso ao tenant nesta rodada; estados reais de dados não foram inspecionados.

## Como ler este documento

Cada peça do Marketing carrega **quatro dimensões de estado independentes**, cada uma
em uma tabela:

| Dimensão | Onde vive | Valores |
|---|---|---|
| Plano | `media_plans.conteudo.statusPlanejamento` | `gerado`, `em_revisao`, `aprovado` |
| Ação do calendário | `content_calendar_items.status` | `planejado`, `aprovado`, `processando`, `recusado`, `gerado`, `publicado`, `pulado` |
| Mídia da geração | `content_generations.result.automation.status` | `video_processing`, `video_ready`, `video_failed` (+ ausência) |
| Materialização | `media_projects.context.materializationStatus` | `planned`, `processing`, `draft_ready`, `ready`, `failed` |
| Publicação | `social_publications.status` | `queued`, `scheduled`, `publishing`, `published`, `failed` |

A tela mostra o rótulo derivado de **uma** dessas dimensões, mas as ações dependem de
outra. É a origem da maior parte das contradições percebidas.

## Superfícies mapeadas

| # | Tela / rota | Componente principal | Estado que exibe | Ação primária | Ações secundárias | Risco / beco sem saída |
|---|---|---|---|---|---|---|
| 1 | Marketing · Visão Geral `/content?tab=visao-geral` | `ContentHub` + `MarketingOverviewBridge` | etapa da jornada + próximo passo | “Continuar execução” | abrir campanhas/planejamento | CTA leva a uma tela que pode não ter a ação necessária |
| 2 | Planejamento `?tab=planejamento` | editor do plano + `MediaPlanLifecycleSummary`, `MediaPlanBatchControl`, `MediaPlanPublicationModeControl` | status do plano | aprovar plano / aprovar lote | produzir lote, modo de publicação | aprovar plano também aprova ações `planejado` (efeito colateral) |
| 3 | Campanhas `?tab=campanhas` | `CampanhasHub` / workspace de campanha | total, a preparar, em produção, publicados | preparar materiais | abrir campanha | “a preparar” e “em produção” usam critérios diferentes dos da aba de conteúdos |
| 4 | Conteúdos & Criativos `?tab=conteudos` | `ContentProductionQueue` + `ContentProductionClarityBridge` (+ 28 bridges montadas no app) | contadores, filtros, lista de peças | revisar/aprovar | gerar, publicar, modo de publicação | contadores e barras já foram duplicados por injeção DOM; ações dependem de estado de mídia |
| 5 | Resultados `?tab=resultados` | `MarketingResultsSummary` + cards + `SearchConsoleInsightsPanel` | publicados, fila, posts analisados, fechados no mês | ler resultados | abrir campanhas/conteúdos | sem atribuição por campanha/peça |
| 6 | Rastreamento `?tab=rastreamento` | `VisitorIntelligence` | visitantes e eventos | analisar | — | desconectado do funil de conteúdo |
| 7 | Estúdio de Vídeo `/content-studio/video` | `VideoHome` (views: studio, origin, create, projects, publish) | projetos recentes, dublê | criar vídeo | abrir projeto, recursos | “Projetos recentes” lista imagem/story com selo “Pronto” |
| 8 | Revisão do material (mesma URL) | `MediaPlanReviewWorkspace` quando há execução de plano e `advancedMode` falso | status da peça + qualidade + mídia | aprovar material / montar vídeo | editar texto, trocar mídia, nova versão | **compartilha a URL com o Estúdio**; voltar/atualizar cai no estúdio |
| 9 | Editor ` /content-studio/video/edicao` | `VideoAudioStudioPanel` + `VideoTimelineEditor` | timeline, clipes, camadas | exportar MP4 | editar/remover clipe, texto, áudio | ações destrutivas escondidas no painel; seleção pouco óbvia |
| 10 | Biblioteca de Mídias `/midias` | `MediaContextLibrary` e painéis | ativos do tenant | enviar/organizar | usar como referência | fotos precisam de origem upload/importada para o fallback de vídeo |
| 11 | Biblioteca de Informações `/midias/informacoes` | `MediaContextLibrary` | fontes aprovadas | cadastrar/aprovar | — | sem fonte aprovada a IA gera genérico (aviso “contexto consultado”) |

## Matriz peça × tela

| Estado da peça | Conteúdos & Criativos | Revisão do material | Estúdio | Editor | Resultados |
|---|---|---|---|---|---|
| `planejado` (aguardando liberação) | “Aguardando aprovação” + editar | não abre | não aparece | — | — |
| `aprovado` sem geração | “Pronto para produzir” + gerar | — | — | — | — |
| `gerado` sem mídia final (ex.: Reel) | “Em revisão” + bloquear aprovação | aviso de vídeo indisponível + montar | — | abre projeto vazio | — |
| `gerado` com mídia final | “Em revisão” + aprovar | prévia + aprovar | — | edita | — |
| `aprovado` com mídia | “Conteúdo aprovado” | aprovado | — | edita | conta em “fechados”? não |
| `aprovado` **sem** mídia (legado) | “Conteúdo aprovado” (contraditório) | aviso | — | — | não publica |
| `publicado` | “Publicado” | — | — | — | entra em publicados |
| falha de vídeo | “Em revisão” + atenção | detalhe do erro | — | — | — |
| falha de publicação | “Conteúdo aprovado” | — | — | — | não aparece como falha |

## Contradições e becos sem saída observados

1. **Aprovado sem mídia final** — a peça entra em `aprovado` sem MP4 e a publicação falha
   em silêncio. Guarda atual: API responde `422 VIDEO_NOT_READY`; legado é curado pelo reconciliador.
2. **Revisão e Estúdio na mesma URL** — o botão voltar/atualizar pode trocar a tela.
3. **“Projetos recentes” mistura imagem, story e vídeo** com o mesmo selo “Pronto”.
4. **Ações destrutivas invisíveis** no editor (excluir/editar clipe depende de selecionar o bloco).
5. **Prévia de vídeo sem play** e miniaturas de cena quebradas (mostram vídeo como imagem).
6. **Contadores duplicados** por camadas de injeção DOM (foram corrigidos em parte, mas a arquitetura permanece).
7. **Modo de publicação manual** invisível no momento da aprovação — a peça fica aprovada e parada.
8. **Resultados sem atribuição** — não liga peça → publicação → negócio.
9. **Estado `processando` do calendário** existe no enum e em uma guarda, mas não é gravado por nenhum fluxo (estado morto).

## Evidências de código

- `lib/db/src/schema/content_calendar_items.ts` — status do calendário.
- `lib/db/src/schema/media_plans.ts` — status do plano.
- `artifacts/api-server/src/routes/content_calendar.ts` — transições e guarda `VIDEO_NOT_READY`.
- `artifacts/api-server/src/services/media-plan-auto-production.ts` — produção, auto-cura, reconciliação.
- `artifacts/api-server/src/services/media-plan-scheduled-publication.ts` — fila de publicação.
- `artifacts/frontend/src/pages/ContentHub.tsx` — abas e conteúdo do funil.
- `artifacts/frontend/src/components/runtime/WorkspaceEnhancements.tsx` — ~29 bridges montadas.
- `artifacts/frontend/src/pages/video/VideoHome.tsx` — Estúdio e Revisão na mesma rota.
- `artifacts/frontend/src/components/video/VideoTimelineEditor.tsx` — ações de edição.
