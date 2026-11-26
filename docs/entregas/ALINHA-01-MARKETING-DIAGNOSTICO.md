# ALINHA-01 — Realinhamento estrutural do Marketing IA

| Campo | Valor |
|---|---|
| Lote | ALINHA-01 |
| Versão do relatório | 1.0 |
| Data | 2026-11-26 |
| Repositório | `casaforteicf/vendorai-platform-replit` |
| Commit base auditado | `0af9d7fc3` (`0af9d7fc3bfce93ac7b6c586b41ca56f64ba116c`) |
| Escopo desta missão | Diagnóstico, inventário e plano de correções. **Sem reconstrução estrutural e sem publicação.** |
| Alterações em produção | **Nenhuma.** Nenhum arquivo de código foi modificado para produzir este relatório. |
| Método | Leitura de código e documentos + consultas SQL **somente-leitura** no banco de produção (`SET default_transaction_read_only = on` em toda sessão) + verificação do tenant AJ Termas Irani. |
| Restrições respeitadas | Sem Replit, Railway ou GitHub Actions; sem publicar conteúdo; sem contratar serviço externo; sem dados fictícios; sem tocar no Arqdor; sem criar agente, store ou arquitetura paralela. |

> **Encaminhamento:** este relatório deve ir para a auditoria independente **antes** de qualquer lote de implementação (checklist no Anexo D). Ele foi produzido em branch apenas de documentação, sem push, merge ou deploy.
>
> **Atualização (2026-11-26):** após autorização do solicitante (“pode fazer e isso deve ser para todos os tenants”), os lotes **L0–L4** foram implementados no branch `feat/alinha-01-runtime`. O registro de execução, arquivos, evidências e pendências está em [ALINHA-01-IMPLEMENTACAO.md](ALINHA-01-IMPLEMENTACAO.md). O diagnóstico abaixo permanece como baseline auditável; o Anexo E registra o que a implementação corrigiu e o que ainda falta.

---

## 0. Sumário executivo

O Marketing IA **funciona por partes, mas não opera como um sistema**. O que existe é um conjunto grande de telas, rotas, serviços e “bridges” que conversam com o Plano de Mídia por caminhos diferentes — e três deles estão quebrados ou divergentes hoje. O caso AJ Termas Irani comprova: **10 ações aparecem na fila, 9 foram geradas, 1 está aprovada sem vídeo e 0 foram publicadas**, embora o plano declare **102 ações planejadas**.

Achados que bloqueiam o fluxo, em ordem de gravidade:

1. **P0 — O caminho validado de geração está quebrado.** `artifacts/api-server/src/routes/content.ts:113` separa o campo `pilar` por `" \uFFFD "` (caractere de substituição) em vez de `" · "`. Resultado: `resolveValidatedPlannerContext` nunca casa o nome da campanha e responde **409** para toda geração feita pela fila com os headers `x-vendorai-*`. O caminho “correto” (com `contextAudit`) está inacessível.
2. **P0 — Produção pela tela não deixa rastro.** O `MediaPlanAutoProductionBridge` gera por `/content/generate` **sem** os headers de plano/campanha. As gerações ficam sem `result.automation` e sem `contextAudit` — as 10 gerações do caso real estão exatamente assim. Não há rastreabilidade `tenantId → mediaPlanId → campaignId → calendarItemId → geração → projeto → publicação`.
3. **P0 — O worker automático não produz nada.** `media-plan-auto-production.ts:130` tem o mesmo split corrompido; `campaignForItem` retorna `null` e o laço faz `continue` antes de qualquer claim. Além disso, o worker só roda com `publicacaoOrganica.modo = "automatico"`, campo **ausente** no plano real.
4. **P0 — Aprovação sem mídia final.** O Reels `8f096a37…` está `aprovado` com roteiro (7 cenas) e **sem `videoUrl`**; o projeto de vídeo `22f7e792…` está `failed` por falta de provedor. O gate de vídeo existe no `PATCH`, mas não cobre itens já aprovados nem o estado inicial da fila. Quatro máquinas de estado coexistem e nenhuma é a dona da verdade.
5. **P1 — Parâmetros fixos no executor.** `objetivo=awareness`, `destinoClique=whatsapp`, `duração=16/30s` e `cor=#4F46E5` estão no código. No caso real: 4 anúncios com `objective=awareness` e `destino=whatsapp` (incluindo Google Search), e a landing page gerada com **#4F46E5** enquanto a cor da marca é **#dcd509**.
6. **P1 — Contexto empresarial não é uniforme (AL-001).** Existem dois pipelines de prompt: `/content/generate` (usado pelo plano) **não** passa pelo `CreativeRuntime`/`BrandProfile`/Design QA; `/content-studio/generate` passa. Cores de marca só entram via `discoveryData.coresBrand` (vazio no tenant real); `tenants.corPrimaria` não é lido pelo executor.
7. **P1 — Jornada e números divergentes.** `ContentHub.tsx` calcula a jornada apenas até a etapa 3. `MarketingOverviewBridge.tsx` conta `gerado` como “em produção” e `aprovado` como “a preparar”, produzindo exatamente o “9 em produção / 1 a preparar / 0 publicadas” da auditoria — números que **não** são o estado operacional real (9 aguardando revisão; 1 aprovado bloqueado por falta de vídeo).
8. **P1 — Resultados frágeis (AL-009).** `MarketingResultsSummary` usa um único `Promise.all`; se `/content-performance/insights` falhar, os outros dois painéis nunca são aplicados e ficam em zero/valor antigo, sem distinguir “zero real” de “não carregado”.
9. **P1 — Atribuição incompleta (AL-008).** O schema de leads já tem `origin_campaign_id` e `ad_campaign_id`; só a captura de anúncios/UTM e o Arqdor escrevem. A campanha do Plano de Mídia (`camp-1`) não é gravada no lead e o painel de Resultados não tem recorte por campanha.
10. **P1 — Fragmentação estrutural.** 62 arquivos em `components/marketing/` (61 componentes + 1 teste, ~17,5 mil linhas), **35 componentes** com manipulação de DOM e/ou timers, **27 bridges montadas globalmente** em `WorkspaceEnhancements.tsx` para toda rota de marketing. A própria fila de produção é excluída desse mount (`return null`) porque os bridges “fazem polling, observam/mutam DOM e repetem consultas”.
11. **P2 — Corrupção de encoding em 5 arquivos-fonte** (`onboarding.ts`, `content.ts`, `ai-gateway.ts`, `changelog.ts`, `media-plan-auto-production.ts`): U+FFFD em prompts e mensagens ao usuário, além de NULs em comentários. É a causa raiz dos itens 1 e 3.
12. **P2 — Drift de migration quebra autonomia.** `lib/db/migrations/209_marketing_autonomy_policy.sql` nunca foi aplicada: a versão `209` do banco é “multi whatsapp numbers”. A coluna `content_autopilot_config.marketing_autonomy_policy` não existe em produção, mas o código a seleciona.

---

## 1. Inventário completo

### 1.1 Superfícies de UI (rotas reais)

| Rota | Componente de entrada | Observação |
|---|---|---|
| `/content` | `pages/ContentHub.tsx` (lazy em `AppLegacy.tsx:133`) | Hub com abas `visao-geral`, `planejamento`, `campanhas`, `conteudos`, `resultados`, `rastreamento` |
| `/content?tab=gerador` | legado `pages/Content.tsx` (3.184 linhas) | Gerador avulso + histórico; embutido em `conteudos` |
| `/content?tab=conteudos` | `components/marketing/ContentProductionQueue.tsx` (1.677 linhas) | Fila real do plano |
| `/content?tab=campanhas` | `pages/CampanhasHub.tsx` (469) e `pages/Campanhas.tsx` (2.072) | Duas telas de campanha |
| `/content?tab=planejamento` | `pages/PlanoMidia.tsx` (719) | Planejamento + calendário + aprovações |
| `/content?tab=resultados` | `MarketingResultsSummary.tsx` + cards | Sem recorte por campanha |
| `/content?tab=rastreamento` | `pages/VisitorIntelligence.tsx` | Visitantes/tracking |
| `/midias` | `pages/MediaCenter.tsx` / `MediaLibraryV2.tsx` | Biblioteca de mídias |
| `/content-studio/video` | `pages/video/VideoHome.tsx` | Estúdio de vídeo |
| `/content-studio/video/edicao` | `pages/video/VideoEdicaoPage.tsx` | Edição/finalização |
| `/content-studio/video/avatar` | `pages/video/VideoAvatarPage.tsx` | Dublê Digital |
| `/ads` | `pages/Ads.tsx` (1.508) | Anúncios |
| `/site/:tenantSlug` | `pages/SiteLandingPage.tsx` | Site/LP publicado |
| `/marketing/plano-de-midia` | `PlanoMidia` (rota legada) | Duplica `/content?tab=planejamento` |
| `/marketing/instagram` | `MarketingInstagram.tsx` | Instagram |
| `/campanhas` | redirect → `/content?tab=campanhas&view=organicas` | Navegação histórica |

### 1.2 Componentes de marketing (62 arquivos, 17.562 linhas)

A coluna “DOM/timers” mostra `ocorrências de DOM/ocorrências de timer` por arquivo (`querySelector*`, `MutationObserver`, `createPortal`, `setInterval`/`setTimeout`). “—” = nenhuma.

| Arquivo | Linhas | DOM/timers | Função |
|---|---:|---:|---|
| `ContentProductionQueue.tsx` | 1677 | 0/1 | Fila de produção do plano (tela principal) |
| `MediaPlanAutoProductionBridge.tsx` | 899 | 5/5 | Produção automática pela tela |
| `QuotaSafeMediaPlanAutoProductionBridge.tsx` | 267 | 2/3 | Wrapper de cota do anterior |
| `MarketingContextSelector.tsx` | 720 | — | Briefing/contexto no gerador avulso |
| `MarketingOverviewBridge.tsx` | 551 | 6/4 | Cards e contadores de campanha |
| `ContentProductionClarityBridge.tsx` | 501 | 7/5 | Contadores/filtros/aprovação em lote na fila |
| `ContentGeneratorQueueUxBridge.tsx` | 472 | 6/3 | Ajustes de UX da fila |
| `MarketingResponsiveFocusBridge.ts` | 467 | 9/0 | Layout/responsivo |
| `LaunchCommandCenter.tsx` | 450 | — | Central de lançamento |
| `OrganicCalendarPublisher.tsx` | 430 | 0/1 | Publicação do calendário |
| `MarketingAgentDock.tsx` | 428 | — | Dock do agente de marketing |
| `SeoAuthorityTrackingCard.tsx` | 425 | — | SEO/autoridade |
| `MediaPlanProductionRuntimeBridge.tsx` | 413 | 13/6 | Runtime de produção do plano (maior acoplamento DOM) |
| `MediaPlanFailedRetryBridge.tsx` | 367 | 3/2 | Retry de falhas |
| `ContentPlanVisualCompletionBridge.tsx` | 367 | 5/5 | Completar criativo |
| `SearchConsoleInsightsPanel.tsx` | 352 | — | Search Console |
| `MediaPlanLandingPageStrategy.tsx` | 343 | 5/2 | Estratégia de LP |
| `InstagramGrowthPanel.tsx` | 340 | — | Crescimento Instagram |
| `MetaCampaignAudienceBridge.tsx` | 333 | — | Público Meta |
| `CampaignAbTestControl.tsx` | 329 | 0/1 | Teste A/B |
| `SearchPerformanceTrackingBridge.tsx` | 320 | 4/0 | Performance de busca |
| `MediaPlanBatchControl.tsx` | 315 | 7/5 | Controle de lote |
| `MarketingAutonomyAudit.tsx` | 313 | 6/2 | Auditoria de autonomia |
| `MediaPlanPublicationModeControl.tsx` | 302 | 4/2 | Modo de publicação |
| `LeadCaptureFreeToolBuilder.tsx` | 301 | — | Ferramentas de captação |
| `MetaGrowthHub.tsx` | 296 | — | Hub Meta |
| `PlanningReviewBridge.tsx` | 288 | 9/3 | Revisão/aprovação do planejamento |
| `CampaignSiteBriefingPicker.tsx` | 273 | — | Briefing de site |
| `MediaPlanPreparationActionsBridge.tsx` | 259 | 4/2 | Ações de preparação |
| `MediaPlanPerformanceCommandCenter.tsx` | 259 | 4/2 | Performance do plano |
| `CampaignWorkspaceClarityBridge.tsx` | 259 | 8/1 | Clareza do workspace de campanha |
| `ColdProspectingCampaignPlanner.tsx` | 257 | — | Prospecção fria |
| `CampaignMarketingIntelligencePanel.tsx` | 255 | — | Inteligência de campanha |
| `MessagingMediaPlanBridge.tsx` | 251 | — | WhatsApp/e-mail do plano |
| `ColdProspectingPilotValidation.tsx` | 247 | — | Validação de piloto |
| `MarketingAutonomyControl.tsx` | 221 | 5/2 | Controle de autonomia |
| `AdsCreativePreviewBridge.tsx` | 219 | 6/3 | Preview de anúncio |
| `CampaignAbWinnerApprovalBridge.tsx` | 210 | 0/1 | Aprovação de vencedor A/B |
| `AcquisitionInvestmentIntelligence.tsx` | 209 | 5/3 | Investimento |
| `MediaPlanBudgetExecutionBridge.tsx` | 200 | 4/1 | Execução de verba |
| `SearchIndexationTrackingCard.tsx` | 198 | — | Indexação |
| `InstagramStoryFunnel.tsx` | 194 | — | Funil de stories |
| `CheckoutConversionFunnel.tsx` | 186 | 5/3 | Funil de checkout |
| `SeoCommandCenterCard.tsx` | 183 | — | SEO |
| `MetaAudiencePerformance.tsx` | 176 | — | Performance de público |
| `MediaPlanLifecycleSummary.tsx` | 176 | 5/3 | Resumo de ciclo de vida |
| `MarketingResultsSummary.tsx` | 176 | — | Painel de Resultados |
| `MarketingResultsTrackingBridge.ts` | 175 | 7/0 | Tracking de resultados |
| `AcquisitionMasterOrchestrator.tsx` | 161 | 5/2 | Orquestrador |
| `MetaCustomAudienceSync.tsx` | 158 | — | Sincronização de público |
| `ContentApprovalClarityBridge.tsx` | 153 | 6/0 | Clareza de aprovação |
| `AdsMediaPlanContextBanner.tsx` | 138 | — | Banner de contexto |
| `VendorAIAcquisitionPlaybook.tsx` | 63 | 4/2 | Playbook |
| `AssistedMarketingManager.tsx` | 114 | — | Gestor assistido |
| `ContentAutopilotMediaPlanBanner.tsx` | 114 | — | Banner autopilot |
| `MediaPlanProductionCompatibilityBridge.tsx` | 107 | 4/1 | Compatibilidade |
| `SeoAuthorityTrackingBridge.tsx` | 81 | 4/0 | SEO |
| `ContentContextSourcesBridge.tsx` | 67 | 0/1 | Fontes de contexto |
| `MediaPlanProjectKindCompatibilityBridge.tsx` | 39 | — | Compatibilidade de projeto |
| `MarketingAgentCard.tsx` | 39 | — | Card do agente |
| `BacklinkAuthorityPanel.tsx` | 7 | — | Backlinks |
| `ContentProductionClarityBridge.test.tsx` | 114 | — | Teste do bridge de fila |

**Montagem global:** `components/runtime/WorkspaceEnhancements.tsx:92-116` monta **27** desses componentes em qualquer rota `/marketing` ou `/content`, exceto a própria fila (`isProductionQueue → return null`, linhas 58-61).

### 1.3 API (rotas Express)

| Arquivo | Endpoints | Papel |
|---|---:|---|
| `routes/content.ts` | 26 | Geração, variações, imagens, publicação Instagram, histórico |
| `routes/ads.ts` | 23 | Campanhas de anúncio, criativos, métricas, publicação paga |
| `routes/media_engine.ts` | 14 | Jobs de mídia, identidades/vozes, image-tools, photo-video |
| `routes/content_performance.ts` | 14 | Posts publicados, insights, snapshots |
| `routes/media_library.ts` | 12 | Projetos, assets, versões, upload |
| `routes/social-integrations.ts` | 12 | Conexões Meta/Instagram/LinkedIn/TikTok/YouTube |
| `routes/media_lipsync.ts` | 11 | Dublê Digital (identidade, estilo, lipsync, avaliações) |
| `routes/site_generator.ts` | 10 | Geração/publicação de site e LP |
| `routes/content_calendar.ts` | 7 | Calendário, aprovação de lote, autorização de produção, photo-video |
| `routes/media_plan.ts` | 5 | Plano de mídia (gerar, ler, completar, aprovar, histórico) |
| `routes/content_studio.ts` | 3 | Geração criativa (workflow/trends/hooks/script), vídeo de produto, plano de edição |
| `routes/media_video_compose.ts` | 1 | Composição/finalização de vídeo |
| `routes/content_tracking.ts` | 1 | Tracking de conteúdo |

### 1.4 Serviços de backend (marketing)

| Serviço | Papel | Persistência |
|---|---|---|
| `media-plan.ts` / `media-plan-period.ts` | Geração e normalização do plano (campanhas, canais, período, total de ações) | `media_plans.conteudo` (jsonb) |
| `media-plan-auto-production.ts` | Worker de produção orgânica + reconciliação de vídeo | `content_calendar_items`, `content_generations`, `media_jobs`, `media_projects` |
| `media-plan-auto-production-policy.ts` | Regra de opt-in e teto mensal | — (puro) |
| `media-plan-scheduled-publication.ts` | Enfileira publicação orgânica devida | `social_publications`, `content_calendar_items` |
| `content-calendar.ts` | Geração determinística do calendário por lote | `content_calendar_items` |
| `content-final-media.ts` | Contrato de “mídia final” por formato | — (puro) |
| `social-publication-worker.ts` | Orquestra produção, reconciliação, fila, publicação e métricas a cada 60 s | — |
| `social-publication-dispatcher.ts` | Despacha para cada provedor | `social_publications` |
| `contentSocialPublisher.ts` / `instagram-organic-publication` / `facebook-organic-publication` | Publicação em canais | `content_published_posts`, `social_publications` |
| `channelPublishBridge.ts` | Publicação paga com autonomia + Design QA | `ad_campaigns` |
| `contentCreativeRuntime.ts` / `creativeDesignBridge.ts` | Briefing → BrandProfile → canal → QA | leitura de `business_profiles`, `tenants` |
| `contentContextLibrary.ts` | Biblioteca de contexto/assetIds para prompt | `content_library`, catálogo |
| `content-performance.ts` | Métricas e aprendizados | `content_published_posts`, `content_performance_insights` |
| `marketingAgentAutonomyPolicy.ts` / `marketingAutonomyConfig.ts` / `marketingAutonomyAudit.ts` | Autonomia 0–4 | `content_autopilot_config`, `agent_configs` |
| `vendorai-media-engine.ts` / `vendorai-photo-video.ts` / `vendorai-lipsync-*` | Executores de mídia | `media_jobs`, `media_projects` |
| `adsCreativeQa.ts` / `adAttribution.ts` | QA de criativo e UTM | `ad_campaigns`, `leads` |

### 1.5 Vendor Brain (contratos compartilhados)

`lib/vendor-brain/src/marketing-runtime.ts`, `marketing-context.ts`, `marketing-agent.ts`, `creative-runtime.ts`, `creative-design.ts`, `channel-adapters.ts`, `channel-publication.ts`, `platform-foundation.ts`, `vertical-blueprint.ts`, `site-generator-2.ts`, `vertical-profiles.ts`, `intelligence-routing.ts`.

**Uso real:** `resolveMarketingRuntime` só é chamado em `routes/business_profiles.ts:376`; o Creative Runtime (`resolveTenantCreativePlan`) é chamado em `routes/business_profiles.ts:392/544/640` e via `buildContentCreativeRuntime` em `routes/content_studio.ts:99-140`. **Nenhum executor do Plano de Mídia** (fila, bridge, worker) usa o Marketing Agent Runtime nem o Creative Runtime.

### 1.6 Fonte de verdade por função (estado atual)

| Função | Fonte de verdade | Quem escreve | Contrato lido pela UI |
|---|---|---|---|
| Planejamento estratégico | `media_plans.conteudo` | `media_plan.ts` / `media-plan-period.ts` | `GET /api/tenants/:t/media-plan` |
| Calendário/ações | `content_calendar_items` | `content_calendar.ts` (lote de 10) | `GET /api/tenants/:t/content-calendar` |
| Produção (conteúdo) | `content_generations` | `content.ts`, worker, bridge | `GET /api/tenants/:t/content/history` |
| Produção (projeto) | `media_projects` (contexto jsonb) | `media_library.ts`, bridge, `captureGeneratedMedia` | `GET /api/tenants/:t/media/projects` |
| Biblioteca | `media_assets` (+ `media_versions`) | `media_library.ts`, `captureGeneratedMedia` | `GET /api/tenants/:t/media/assets` |
| Vídeo | `media_jobs` + `media_projects` | `media_engine.ts` (+ worker de reconciliação) | `GET .../media/projects/:id` (não há `GET /media-engine/jobs`) |
| Aprovação editorial | `content_calendar_items.status` | `PATCH /content-calendar/:id`, `aprovar-lote` | mesmo endpoint |
| Publicação | `social_publications` + `content_published_posts` | `media-plan-scheduled-publication.ts`, dispatcher | `GET .../social-publications` |
| Anúncios | `ad_campaigns` (+ `ad_creatives`, `ad_performance_snapshots`) | `ads.ts` | `GET .../ads/campaigns` |
| Sites/LP | `generated_sites` (`config`, `html`) | `site_generator.ts` | `GET .../site-generator/sites` |
| Rastreamento | `web_behavior_events` (via `site.ts`), Search Console | `site.ts`, integrações | painéis de tracking |
| CRM/conversão | `leads`, `deals` | CRM/`site.ts`/`arqdor_public_link.ts` | `GET /api/tenants/:t/dashboard` |
| Resultados | `content_performance_insights` | `content-performance.ts` | `GET .../content-performance/insights` |
| Autonomia | `content_autopilot_config` (+ `agent_configs`) | `marketingAutonomyConfig.ts` | `GET/PUT .../marketing/autonomy` |

### 1.7 Cobertura das 19 áreas exigidas

| # | Área | Onde está no código | Estado | Lacuna principal |
|---|---|---|---|---|
| 1 | Contexto empresarial e identidade visual | `business_profiles`, `tenants`, `creativeDesignBridge`, `creative-runtime` | Parcial | Cor/tom não chegam ao executor do plano |
| 2 | Vendor Brain e agentes | `lib/vendor-brain/src/*`, `platform-foundation` | Existe, não integrado | Nenhum executor do plano usa o runtime do agente |
| 3 | Planejamento estratégico | `media_plans`, `media-plan-period.ts`, `PlanoMidia` | Funcional | Inconsistência período × fases; 102 × 10 |
| 4 | Campanhas | `media_plans.conteudo.campanhas`, `CampanhasHub`, `Campanhas` | Funcional, duplicado | Duas telas, sem entidade própria |
| 5 | Calendário editorial | `content_calendar_items`, `content-calendar.ts` | Funcional | Lote de 10 sem visão do total |
| 6 | Biblioteca de mídias | `media_assets/projects/versions`, `MediaCenter` | Funcional | Sem status de aprovação |
| 7 | Geradores de imagens e textos | `content.ts`, `lib/content-generation.ts`, `content-studio.ts` | Funcional, dois pipelines | Identidade/QA só em um deles |
| 8 | Estúdio de vídeo | `VideoHome`, `media_engine.ts`, `media_video_compose.ts` | Funcional | Sem provedor de IA configurado |
| 9 | Dublê Digital | `media_lipsync.ts`, `VideoAvatar*` | Funcional, isolado | Não é acionado pelo plano |
| 10 | Editor e finalização | `VideoEdicaoPage`, `media_video_compose.ts`, `MediaPlanReviewWorkspace` | Parcial | Falta vínculo com a ação do plano |
| 11 | Produção automática e manual | worker, bridge, fila, `MediaPlanBatchControl` | Conflitante | 4 caminhos, 2 donos |
| 12 | Aprovações | `PATCH /content-calendar/:id`, `aprovar-lote`, review workspace | Parcial | Gate de mídia só na transição |
| 13 | Publicação e agendamento | `social_publications`, dispatcher, worker | Funcional sob flag | `publicacaoOrganica` ausente no caso real |
| 14 | Anúncios | `ads.ts`, `Ads.tsx`, `ad_campaigns` | Funcional (rascunho) | Objetivo/destino/tipo fixos |
| 15 | Sites e landing pages | `site_generator.ts`, `generated_sites` | Funcional | Cor fixa; `color` não vem da marca |
| 16 | Rastreamento | `site.ts`, `web_behavior_events`, `content_tracking.ts`, Search Console | Funcional | Sem ligação com a campanha do plano |
| 17 | CRM e conversões | `leads`, `deals`, `/dashboard` | Funcional | Atribuição por campanha incompleta |
| 18 | Resultados e aprendizado | `content-performance.ts`, `content_performance_insights` | Parcial | Não realimenta planejamento |
| 19 | Autonomia e permissões | `marketingAgentAutonomyPolicy`, `canReleaseMarketingBatch` | Quebrada | Coluna ausente (migration 209) e dois modelos de autorização |

### 1.8 Cadeia de rastreabilidade (o que existe × o que falta)

| Elo | Onde está | Situação no caso real |
|---|---|---|
| `tenantId` | em todas as tabelas | ✅ presente |
| `tenantId → mediaPlanId` | `content_calendar_items.media_plan_id`, `media_projects.context.mediaPlanId` | ✅ presente |
| `mediaPlanId → campaignId` | `content_calendar_items.pilar` (prefixo textual) + `media_projects.context.campaignId` | ⚠️ textual (split), não FK |
| `campaignId → calendarItemId` | `media_projects.context.calendarItemId` | ✅ presente |
| `calendarItemId → geração` | `content_calendar_items.content_generation_id` | ✅ presente |
| `geração → plano/campanha` | `content_generations.result.contextAudit` | ❌ ausente nas 10 gerações |
| `geração → projeto` | `media_projects.context.executorDraftId`/`contentGenerationId` | ✅ presente |
| `item → publicação` | `social_publications.metadata.calendarItemId` | ✅ previsto, ❌ nenhuma publicação |
| `publicação → lead/venda` | `leads.ad_campaign_id` / `origin_campaign_id` | ⚠️ só para anúncio/UTM |
| `campanha → anúncio` | `ad_campaigns.segmentacao.marketingContext.campaignId` | ✅ presente (jsonb), não indexado |

> **Conclusão do inventário:** não existe uma fonte única de “estado da ação”. O mesmo item do calendário tem status em `content_calendar_items.status`, em `content_generations.result.automation.status` e em `media_projects.context.materializationStatus`, além de um rótulo derivado na tela. Quatro máquinas de estado, três donos.

---

## 2. Arquitetura atual

```
                        ┌──────────────────────────────────────────────┐
                        │  /content (ContentHub)                       │
                        │  abas: visão geral | planejamento | campanhas│
                        │        conteúdos | resultados | rastreamento │
                        └───────┬───────────────┬──────────────┬───────┘
                                │               │              │
                    PlanoMidia  │        ContentProductionQueue│  Content (legado)
                                │               │              │
                                ▼               ▼              ▼
                     GET/PATCH media-plan   POST /content/generate   carrossel de bridges
                                │               │  (headers x-vendorai-*)│
                                │               │                        │
                                │        ┌──────┴───────┐                │
                                │        │ médiaplan-   │                │
                                │        │ auto-        │                │
                                │        │ production   │                │
                                │        │ (worker 60s) │                │
                                │        └──────┬───────┘                │
                                │               │                        │
                                ▼               ▼                        ▼
                     media_plans     content_calendar_items     media_projects / media_jobs
                                            │                          │
                                            ▼                          ▼
                                    content_generations  ◄───  site_generator / ads / media_engine
                                            │
                                            ▼
                              social_publications → dispatcher → canais
```

Quatro caminhos de produção coexistem:

1. **Fila (`ContentProductionQueue`)** → `POST /content/generate` **com** headers `x-vendorai-*` → hoje responde **409** (split corrompido) → produção bloqueada.
2. **Bridge automático (`QuotaSafe` → `MediaPlanAutoProductionBridge`)** → `POST /content/generate` **sem** headers → produz, mas sem `contextAudit`/`automation`.
3. **Worker (`produceUpcomingMediaPlanOrganicContent`)** → só com `publicacaoOrganica.modo=automatico`; hoje nunca chega a produzir (split + opt-in ausente).
4. **Botões legados** (`Content.tsx`, `PlanoMidia`, `Ads`) → gravam direto em `content_generations`/`ad_campaigns` sem passar por contexto validado.

Máquinas de estado simultâneas:

| Camada | Estados |
|---|---|
| `content_calendar_items.status` | `planejado`, `aprovado`, `recusado`, `gerado`, `publicado`, `pulado` |
| `content_generations.result.automation.status` | `script_ready`, `draft_ready`, `video_processing`, `video_ready`, `video_failed` |
| `media_projects.context.materializationStatus` | `planned`, `processing`, `draft_ready`, `ready`, `failed` |
| Rótulo derivado (`derivedStatus`) | “Aguardando aprovação”, “Pronto para produzir”, “Em produção”, “Em revisão”, “Conteúdo aprovado”, “Publicado” |
| `social_publications.status` | `scheduled`, `queued`, `publishing`, `published`, `failed` |

Nenhuma delas é suficiente sozinha: `status=gerado` significa “roteiro pronto” para vídeo e “peça pronta” para feed; `aprovado` pode significar “autorizado a produzir” (lote) ou “aprovado para publicar” (editorial) — a mesma palavra para duas coisas.

---

## 3. Arquitetura originalmente prevista

Fontes consultadas: `docs/architecture-blueprint.md` (princípios: contract-first, engine pura, provider abstraction, tenant-first), `docs/architecture/vendorai-platform-foundation.md` (fundação PR #668), `docs/evolucao-vendorai/01-plataforma-central/VC-001-hub-e-navegacao.md`, `lib/vendor-brain/src/marketing-agent.ts` (guardrails), `docs/entregas/MKT-01…` e `MKT-02…`.

O desenho previsto é:

```
Planejamento (Campanha = espinha dorsal)
        │
        ▼
Marketing Runtime (resolveMarketingRuntime) ──► Marketing Agent Plan (skills, canais, autonomia)
        │
        ▼
Creative Runtime (BrandProfile → ChannelAdaptation → Design QA)
        │
        ▼
Executores oficiais (conteúdo, vídeo, site, anúncio, mensagem)
        │
        ▼
Aprovação humana OU autonomia server-side (nível 0–4 + QA)
        │
        ▼
Channel Publish Bridge (somente canais oficiais; prepare-only quando não há publisher)
        │
        ▼
Resultados + aprendizado (orgânico e pago) → próximo ciclo
```

Princípios que o código deveria respeitar e não respeita:

| Princípio documentado | Situação atual |
|---|---|
| “Campaign é a entidade central de Marketing” | A campanha vive dentro de `media_plans.conteudo` (jsonb); não há entidade `campaign` própria nem ligação persistente com lead/anúncio/publicação |
| “Não criar módulos paralelos / stores paralelos” | 4 caminhos de produção, 3 estados, 27 bridges, 2 telas de campanha |
| “Marketing Agent é orquestrador das ferramentas oficiais” | O agente não orquestra: as telas chamam rotas diretamente |
| “Separar Creative/Design Layer da lógica estratégica” | O executor do plano monta prompt próprio, sem `CreativeRuntime`/QA |
| “Publicação e gasto respeitam autorização server-side, autonomia e QA” | Orgânico usa flag `publicacaoOrganica.modo`; pago usa autonomia 0–4 + QA. Dois modelos |
| “Plano de Mídia → executores preservam o briefing canônico” | Só preserva quando os headers validam — e eles falham hoje |
| VC-001: hub com sidebar por módulo, botão Início, sem redundância | Abas numeradas 1–4 + etapa “5” na jornada + barra “Ferramentas” + títulos ocultados por DOM |

**Desvio de documentação adicional:** `docs/architecture/vendorai-platform-foundation.md` ainda declara Cloudflare Pages + Railway + Supabase como infraestrutura oficial, enquanto a operação real é Contabo + Docker + Postgres local (ver `CLAUDE.md`). Isso não bloqueia o Marketing, mas confunde decisões de publicação e observabilidade.

---

## 4. Matriz de divergências

Legenda de lote: L0 governança · L1 contexto · L2 estado/idempotência · L3 parâmetros · L4 jornada/painéis · L5 atribuição · L6 consolidação.

| ID | Área | Divergência observada | Evidência | Impacto | Correção | Lote |
|---|---|---|---|---|---|---|
| D-01 | Contexto | Split do `pilar` por `" \uFFFD "` em vez de `" · "` bloqueia o contexto validado | `routes/content.ts:113`; `services/media-plan-auto-production.ts:130`; teste Node reproduz `false` | P0: geração pela fila retorna 409; worker nunca produz | Corrigir separador e extrair helper único `campaignNameFromPilar` | L0/L1 |
| D-02 | Contexto | Gerações do bridge sem `contextAudit`/`automation` | 10 gerações do caso real com `result.automation` vazio | P0: sem rastreabilidade | Enviar headers de plano/campanha e persistir proveniência | L1 |
| D-03 | Contexto | `/content/generate` não usa `CreativeRuntime`/`BrandProfile` | `routes/content.ts` monta prompt próprio (`buildReferencePatternsPromptBlock` + `resolveContentContext` + `brandFrame`), sem `buildContentCreativeRuntime`; `content-studio.ts:99-140` usa o runtime | Identidade e canal não aplicados | Unificar briefing canônico no executor | L1 |
| D-04 | Contexto | Cor de marca só via `discoveryData.coresBrand`; `tenants.corPrimaria` ignorada | `lib/content-generation.ts:104`; tenant real `#dcd509`, `coresBrand` vazio | Criativo fora da marca | Resolver BrandProfile a partir de `tenants`+`business_profiles` | L1 |
| D-05 | Planejamento × execução | Plano declara 102 ações; calendário materializa 10 por lote | `totalAcoesPlanejadas=102`; `CALENDAR_BATCH_SIZE=10` (`content_calendar.ts:26,100-114`) | UI trata lote como plano completo | Exibir progresso 10/102 e gerar lotes seguintes explicitamente | L4 |
| D-06 | Planejamento × execução | `periodoDias=15` mas fases somam 18 (`offset 10 + duração 8`) | campanhas camp-1..3 (`duracaoDias`/`inicioOffsetDias`) | Anúncio criado fora da janela da fase | Validar consistência na geração do plano | L1 |
| D-07 | Execução | Formatos do plano não têm executor dedicado (blog→linkedin, email→linkedin, whatsapp→stories, sms→stories) | `MediaPlanAutoProductionBridge.tsx:219-225`; geração do blog real é `type=linkedin` | Conteúdo fora do formato planejado | Mapear formato→executor oficial ou marcar “não suportado” | L3 |
| D-08 | Execução | Anúncio Meta “Vídeo vertical” criado como `tipoAnuncio=imagem` | `ad_campaigns.item_label` “Vídeo vertical Meta 1…” com `tipo_anuncio=imagem` | Peça paga errada | Derivar tipo do formato do plano | L3 |
| D-09 | Parâmetros | `objective=awareness` fixo | `bridge:648`; 4 anúncios reais `awareness` | Lances/medição errados | Derivar de etapaFunil/KPI | L3 |
| D-10 | Parâmetros | `destinoClique=whatsapp` fixo (inclusive Google Search) | `bridge:642`; todos os anúncios reais `whatsapp` | Tráfego desviado da LP planejada | Derivar de canal/formato/LP existente | L3 |
| D-11 | Parâmetros | `duration` 16/30 s fixo | `bridge:567`; worker `media-plan-auto-production.ts:360` | Formato fora do padrão do canal | Config única por formato, persistida no projeto | L3 |
| D-12 | Parâmetros | `color=#4F46E5` fixo | `bridge:699`; site real `config.color=#4F46E5` vs marca `#dcd509` | LP fora da identidade | Usar `tenants.corPrimaria`/BrandProfile | L3 |
| D-13 | Estado | `status=gerado` gravado antes do vídeo existir | `bridge:598`; worker `:473` antes de `startAutomatedVideo` | Reel “pronto” sem mídia | Estado `processing` separado + transição só com arquivo | L2 |
| D-14 | Estado | Item `aprovado` sem vídeo final | Reels `8f096a37…` aprovado, 7 cenas, sem `videoUrl` | Publicação silenciosa falha | Gate de aprovação também para itens já aprovados/reconciliação | L2 |
| D-15 | Estado | Quatro máquinas de estado | ver §2 | Números e rótulos divergentes | Estado operacional único + projeções | L2 |
| D-16 | Idempotência | `sessionStorage` por aba controla a execução automática | `bridge:8, 779, 818-819`; `Promise.all([worker(), worker()])` em `:804` | Duas abas = produção duplicada | Claim server-side (como o worker já faz) | L2 |
| D-17 | Idempotência | Duas rotas automáticas alternadas por flag | `bridge:816` pula se `automatico`; worker exige `automatico` | Troca de flag no meio = duplicidade | Um único dono da automação | L2 |
| D-18 | Idempotência | Projeto por imagem gerada além do projeto da peça | `captureGeneratedMedia` (`media-library.ts:147-160`); 7 projetos `mixed` sem `calendarItemId` no caso real | Projetos duplicados/ruído | Ligar captura ao projeto da peça | L2 |
| D-19 | Jornada | Etapa calculada só até 3 | `ContentHub.tsx:338-342` | Jornada não reflete publicação/aprendizado | Derivar das 5 etapas com dados reais | L4 |
| D-20 | Painéis | `gerado` conta como “em produção”; `aprovado` como “a preparar” | `MarketingOverviewBridge.tsx:390-407` | “9/1/0” enganoso | Fonte única de métricas + rótulo por estado operacional | L4 |
| D-21 | Resiliência | `Promise.all` + `throw` no primeiro erro; estados antigos preservados | `MarketingResultsSummary.tsx:54-71` | Zeros falsos / dados velhos | `Promise.allSettled` + estado por fonte + “indisponível” | L4 |
| D-22 | Atribuição | `originCampaignId`/`adCampaignId` existe, mas o plano não grava no lead | `lib/db/src/schema/leads.ts:99-105`; escritores só em `site.ts`, `arqdor_public_link.ts`, `ads.ts` | Sem ROI por campanha | Gravar `campaignId` na captura + painel por campanha | L5 |
| D-23 | Navegação | Título e cópia reescritos no DOM | `ContentHub.tsx:43-55, 115-137` | Manutenção frágil, i18n impossível | Corrigir nos componentes de origem | L6 |
| D-24 | Navegação | 27 bridges globais em toda rota | `WorkspaceEnhancements.tsx:92-116` | Polling e mutação de DOM em cascata | Migrar comportamento para os componentes donos | L6 |
| D-25 | Estrutura | Dois componentes exportam `MediaPlanAutoProductionBridge` | `MediaPlanAutoProductionBridge.tsx` e `QuotaSafe…tsx` | Confusão de importação | Renomear o wrapper | L6 |
| D-26 | Governança | Encoding corrompido em 5 arquivos | U+FFFD/NUL em `onboarding.ts` (279), `content.ts` (160), `changelog.ts` (49), `media-plan-auto-production.ts` (33), `ai-gateway.ts` (26) | Prompts e mensagens corrompidos | Corrigir bytes + gate de CI | L0 |
| D-27 | Governança | Migration 209 não aplicada | `vendorai_schema_migrations` versão 209 = “multi whatsapp numbers”; coluna ausente. Corrigido no L0: arquivo renumerado para `576_marketing_autonomy_policy.sql` (ainda não aplicado) | Autonomia quebra ao ler/escrever | Renumerar migration e aplicar | L0 |
| D-28 | Documentação | Blueprint descreve Cloudflare/Railway | `vendorai-platform-foundation.md` vs `CLAUDE.md` | Decisões erradas de deploy | Atualizar documento | L0 |
| D-29 | Build | Comportamento de produção (quota, gate de permissão, auto-start desligado) era injetado reescrevendo o `.tsx` em tempo de build pelo plugin `media-plan-available-quota` | `artifacts/frontend/vite.config.ts` (transform com `replaceExact`); qualquer edição no bridge quebrava o build | Fonte ≠ bundle publicado; testes/revisão não veem a regra real; manutenção frágil | Mover a regra para o código-fonte e remover o plugin (feito no L3) | L3 |

---

## 5. Funcionalidades duplicadas

| # | Função | Implementações | Risco |
|---|---|---|---|
| F-01 | Produção automática do plano | `MediaPlanAutoProductionBridge`, `QuotaSafeMediaPlanAutoProductionBridge`, `MediaPlanProductionRuntimeBridge`, worker backend, `MediaPlanBatchControl` | Duplicidade de geração e de custo de IA |
| F-02 | Contagem de progresso | `ContentProductionQueue.productionSummary`, `MarketingOverviewBridge` (2 cálculos), `CampanhasHub.summary`, `MediaPlanLifecycleSummary` | Números diferentes para o mesmo dado |
| F-03 | Aprovação | `PATCH /content-calendar/:id`, `aprovar-lote`, `ContentProductionClarityBridge` (botão nativo), `MediaPlanReviewWorkspace`, `PlanningReviewBridge` | Dupla aprovação/estado inconsistente |
| F-04 | Geração de texto | `/content/generate`, `/content-studio/generate`, `/site-generator/generate`, `/media-plan` (geração de plano) | 4 pipelines de prompt, 1 só com BrandProfile |
| F-05 | Geração de vídeo | `/media-engine/jobs`, `/content-studio/product-video`, `/media-engine/photo-video`, `photo-video` do calendário, `/media-video/compose` | Formatos e contratos distintos |
| F-06 | Publicação | `media-plan-scheduled-publication`, `OrganicCalendarPublisher`, `contentSocialPublisher`, `channelPublishBridge` | 2 modelos de autorização |
| F-07 | Cards de campanha | `CampanhasHub`, `MarketingOverviewBridge`, `CampaignWorkspaceClarityBridge` (injeta no hub) | Telas concorrentes |
| F-08 | “Plano de mídia” na navegação | `/marketing/plano-de-midia`, `/content?tab=planejamento`, CTA da visão geral | 3 entradas para o mesmo destino |
| F-09 | Contexto de marketing no browser | `vendorai_active_marketing_briefing_v1`, `vendorai_media_plan_execution_v1`, `sessionStorage` do bridge, `localStorage` do usuário | Contexto fragmentado por aba |
| F-10 | Projeto de mídia | `media_projects` como projeto da peça **e** como projeto de imagem gerada | Taxonomia sobrecarregada |

---

## 6. Funcionalidades incompletas

| # | Função | O que falta | Evidência |
|---|---|---|---|
| I-01 | Rastreabilidade ponta a ponta | `mediaPlanId/campaignId/calendarItemId` não persistidos na geração produzida pela tela | `result.automation` vazio nas 10 gerações |
| I-02 | Biblioteca “aprovada” | `media_assets` não tem status de aprovação; só `metadata.aiRole` livre | `lib/db/src/schema/media_core.ts:20-37` |
| I-03 | Estado único da ação | Falta estado que distinga roteiro/vídeo/revisão/publicação | §2 |
| I-04 | Progresso do plano | Não há visão 10/102 nem geração dos lotes restantes | 102 planejadas × 10 no calendário |
| I-05 | Atribuição por campanha | Painel de Resultados sem recorte por campanha do plano | `MarketingResultsSummary` usa `/dashboard` global |
| I-06 | Jornada até aprendizado | Etapas 4 e 5 nunca ativas | `ContentHub.tsx:338` |
| I-07 | Aprendizado aplicado ao próximo plano | Insights existem, mas não alimentam o gerador do plano | `content-performance.ts` × `media-plan-period.ts` |
| I-08 | Formatos sem executor | blog/email/sms/whatsapp sem gerador próprio | `bridge:219-225` |
| I-09 | Anúncio de vídeo | `meta_ad` de vídeo vira imagem | `ad_campaigns.tipo_anuncio=imagem` |
| I-10 | Dublê Digital no fluxo do plano | Lipsync/identidade não é acionado pelo plano | `media_lipsync.ts` sem referência ao calendário |
| I-11 | Permissão de autonomia orgânica | Nível 0–4 não governa publicação orgânica | `enqueueDueMediaPlanPublications` só olha a flag |
| I-12 | Estado vazio/erro por fonte | Resultados não distingue “sem dado” de “falhou” | `MarketingResultsSummary` |

---

## 7. Causas dos problemas

**Causa raiz 1 — Corrupção de encoding em arquivos-chave.**
Cinco arquivos foram gravados com U+FFFD (e NULs) em algum momento: `onboarding.ts`, `content.ts`, `ai-gateway.ts`, `changelog.ts`, `media-plan-auto-production.ts`. O separador `" · "` virou `" \uFFFD "`. Isso quebrou o resolvedor de campanha em dois pontos nevrálgicos (geração validada e worker) e corrompeu prompts (“Produto/servi�o”, “N�O force a venda”). Não é um bug de lógica: é um bug de bytes que sobreviveu ao merge porque **nenhum gate valida encoding**.

**Causa raiz 2 — Contexto montado no cliente, validado (ou não) no servidor.**
O briefing vive em `sessionStorage`/`localStorage` e é enviado como texto no corpo da requisição. A validação server-side é opt-in por headers. Quando a fila envia os headers, o split quebrado rejeita; quando o bridge não envia, o servidor aceita sem validar. O resultado é previsível: o caminho que **deveria** ser o oficial está fechado e o caminho que **não deveria** existir é o que produz.

**Causa raiz 3 — Crescimento por “bridges” em vez de correção no dono.**
Cada problema de UX foi resolvido com um componente que observa o DOM e injeta botões. Hoje são 27 bridges globais e 35 componentes com DOM/timers, e a própria fila precisou ser excluída do mount para não conflitar. Isso cria acoplamento a textos e seletores, polling concorrente e estados duplicados.

**Causa raiz 4 — Falta de contrato único de estado e de dono da automação.**
Quatro caminhos de produção e quatro máquinas de estado. O worker tem claim (bom), o bridge não tem (ruim). A flag `publicacaoOrganica.modo` decide quem roda, mas pode mudar no meio. `aprovado` significa duas coisas.

**Causa raiz 5 — Parâmetros de execução não derivados do planejamento.**
O plano já contém objetivo, etapa de funil, KPI, oferta, região, formatos e regra geográfica. O executor ignora tudo isso e usa constantes (`awareness`, `whatsapp`, `16/30`, `#4F46E5`). O resultado é verificável no banco: anúncio de “conversão” com objetivo de reconhecimento, Google Search apontando para WhatsApp, LP amarela da marca pintada de índigo.

**Causa contribuinte 6 — Governança de migrations e documentação.**
A colisão de versão 209 impediu a criação da coluna de autonomia. O documento de fundação descreve uma infraestrutura que não é a real. Nenhum dos dois é marketing, mas ambos quebram funcionalidades de marketing.

**Causa contribuinte 7 — Regra de produção escondida no build.**
O plugin `media-plan-available-quota` reescrevia o `MediaPlanAutoProductionBridge.tsx` durante o `vite build` para inserir quota, gate de permissão e desligar a produção automática. Isso explica por que o arquivo-fonte (auditado aqui) mostra auto-start e ausência de gate, enquanto o bundle publicado se comporta de outra forma. Foi eliminado no L3.

**Causa contribuinte 8 — Ausência de provedor de vídeo.**
O Reels falha por falta de `GOOGLE_SERVICE_ACCOUNT_JSON`/`VENDORAI_VERTEX_VIDEO_GCS_URI` ou `REPLICATE_API_TOKEN` (já registrado em MKT-01). O fallback por fotos existe, mas não rodou porque a automação não está ligada e o item foi aprovado antes.

---

## 8. Dependências entre funções

```
Plano de Mídia ──► Calendário (lote 10) ──► Fila/executores ──► Aprovação ──► Publicação ──► Métricas ──► Aprendizado
      │                    │                     │                  │              │              │
      │                    │                     ├── Content Gen ◄──┼── BrandProfile│              │
      │                    │                     ├── Media Engine ◄─┤   (hoje: não) │              │
      │                    │                     ├── Site Generator │               │              │
      │                    │                     └── Ads (rascunho)  │               │              │
      │                    │                                        │               │              │
      └──── autonomia (0–4) ─────────────────────────────────────────┘               │              │
                                                                                     ▼              │
                                                              content_published_posts ──────────────┘
```

| Dependência | Tipo | Contrato | Observação |
|---|---|---|---|
| Plano → Calendário | dados | `media_plans.conteudo.campanhas[].canais[].quantidadeMateriais` | Lote de 10; 102 planejadas |
| Calendário → Geração | HTTP | `POST /content/generate` + headers `x-vendorai-*` | Hoje 409 |
| Geração → Projeto | HTTP | `PATCH /media/projects/:id` (`context`) | Bridge grava; worker grava |
| Geração → Aprovação | HTTP | `PATCH /content-calendar/:id` | Gate de vídeo só na transição |
| Aprovação → Publicação | worker | `enqueueDueMediaPlanPublications` | Exige `modo=automatico` |
| Publicação → Métricas | worker | `refreshPendingMetrics` | 6 h de intervalo |
| Métricas → Aprendizado | serviço | `refreshPerformanceInsights` | Não realimenta o plano |
| Autonomia → Publicação paga | serviço | `channelPublishBridge` | Não vale para orgânico |
| Anúncio → Lead | web | UTM `utm_campaign=vai_*` → `leads.ad_campaign_id` | Só para anúncio |
| Lead → Venda | CRM | `deals.lead_id` | Sem `campaign_id` no deal |
| Plano → Site | HTTP | `POST /site-generator/generate` | `color` fixa |
| Plano → Vídeo | HTTP | `POST /media-engine/jobs` (`video_generate`) | Sem provedor no ambiente |

**Acoplamentos ocultos (a mapear antes de consolidar — AL-006):**

| Bridge | Depende de | Seletores/atributos |
|---|---|---|
| `MediaPlanProductionRuntimeBridge` | `<header>` “Vídeo com IA”, `select[aria-label="Selecionar site para visualizar"]`, botão “Visualizar site”, `[data-vendorai-plan-runtime-status]`, `[data-vendorai-plan-production]`, `[data-vendorai-plan-video-job]` | `querySelectorAll("button")` + `textContent` |
| `PlanningReviewBridge` | botão “Aprovar planejamento”, textos “p,div”, `[data-vendorai-review-planning]`, `[data-vendorai-planning-*]` | `textContent.includes` |
| `MediaPlanBatchControl` | `[data-vendorai-plan-production] button`, botão “Voltar” | portal + `[data-vendorai-media-plan-preparation-actions]` |
| `ContentProductionClarityBridge` | `[data-vendorai-queue-item]`, `[data-vendorai-item-status]`, `[data-vendorai-queue-toolbar]`, botão “Aprovar selecionados” | `querySelectorAll("button")` |
| `MarketingOverviewBridge` | `[data-vendorai-marketing-shell]`, `[data-vendorai-campaign-clarity]`, `[data-vendorai-campaign-production-metrics]` | CSS injetado + portal |
| `MediaPlanAutoProductionBridge` | botão “Criação avulsa” **ou** “Atualizar”, `[data-vendorai-plan-production]` | portal + intervalo de 450 ms |
| `MarketingResponsiveFocusBridge` | layout/classes | observação contínua |

Qualquer mudança de texto, ordem de botão ou estrutura de header quebra esses componentes **sem erro de build**. É por isso que a consolidação precisa ser incremental, com o comportamento migrado para o componente dono antes de remover o bridge.

---

## 9. Plano de correções organizado por lotes

> Regra: cada lote preserva dados existentes, não cria store/agente novo, usa os executores oficiais e só é considerado concluído com evidência de teste e homologação. Nenhum lote publica conteúdo automaticamente.

### LOTE 0 — Governança e integridade de base (S, sem dependência)
- Corrigir os 5 arquivos com U+FFFD/NUL, começando por `content.ts` e `media-plan-auto-production.ts` (restaura D-01).
- Adicionar gate de encoding (`grep` de U+FFFD/NUL) ao script de validação pré-push.
- Renumerar e aplicar `209_marketing_autonomy_policy.sql` (D-27) em homologação e produção conforme processo.
- Atualizar `vendorai-platform-foundation.md` (infra real) e registrar este relatório no índice de entregas.
- **Aceite:** `grep` de U+FFFD/NUL = 0 em `src`; migration aplicada; `MarketingAutonomyControl` lê/escreve sem erro.

### LOTE 1 — Contexto único e rastreável (M, depende do L0)
- Extrair helper único `campaignNameFromPilar` e usá-lo em `content.ts`, `media-plan-auto-production.ts`, `ContentProductionQueue`, `MediaPlanAutoProductionBridge`, `CampanhasHub`.
- Fazer o bridge enviar os headers `x-vendorai-media-plan-id/campaign-id/calendar-item-id`.
- Persistir `contextAudit` + `automation.source="media-plan"` em toda geração vinda do plano (inclusive pela tela).
- Resolver BrandProfile a partir de `tenants.corPrimaria` + `business_profiles.logoUrl` + tom, e passar por `buildContentCreativeRuntime` no executor do plano (D-03, D-04).
- Validar consistência do plano (período × offsets × orçamento) na geração (D-06).
- **Aceite:** toda geração do plano tem `contextAudit` com os 5 ids; nenhuma geração sem campanha; prompt inclui cor/tom reais; 409 não ocorre mais para item válido.

### LOTE 2 — Estado único e idempotência (M, depende do L1)
- Definir estado operacional canônico (ex.: `planned → authorized → producing_script → script_ready → producing_media → media_ready → in_review → approved → scheduled → published`, com `failed`/`skipped`) e mapear para as colunas existentes **sem migração destrutiva**.
- Não gravar `gerado` antes de existir mídia final para formatos de vídeo; usar `processing` explícito.
- Claim server-side para produção iniciada pela tela (reaproveitar o padrão `auto-producing:` do worker).
- Remover dependência de `sessionStorage` como trava; um único dono da automação (worker) ou, na ausência dele, claim atômico por item.
- Reconciliar itens `aprovado` sem vídeo (já existe `reconcileAutomatedReelVideos`, estender para o caso).
- Ligar o projeto da peça à captura de mídia (`captureGeneratedMedia` com `projectId`) (D-18).
- **Aceite:** duas abas simultâneas produzem 1 geração por item; reinício do processo não duplica; Reel nunca “aprovado” sem `videoUrl`; 1 projeto por peça.

### LOTE 3 — Parâmetros de execução derivados do plano (M, depende do L1)
- `objective`: derivar de `etapaFunil` + `kpiPrincipal` (mapa explícito, testável) para o enum existente (`awareness|lead|sale|visit|whatsapp`).
- `destinoClique`: derivar de canal/formato e da existência de LP da campanha (enum existente `landing_page|whatsapp|produto|formulario_lead`).
- `duration`: config única por formato (Reels 15–30 s, YouTube 30 s), validada contra `max_duration_seconds` do provedor; persistir no `context` do projeto. Justificativa mantida quando o plano não declarar duração.
- `color`: usar `tenants.corPrimaria`/BrandProfile (D-12).
- Janela do anúncio: usar `inicioOffsetDias` + `duracaoDias` da campanha, não `dataAgendada + duracaoDias` (D-06).
- Tipo do anúncio: derivar do formato (vídeo × imagem × carrossel) (D-08).
- **Aceite:** para o caso AJ Termas, os 4 anúncios saem com objetivo de conversão/lead, destino LP, janela da campanha, orçamento explícito e tipo correto; LP sai com `#dcd509`.

### LOTE 4 — Jornada, painéis e resiliência (M, depende do L2)
- `ContentHub`: jornada de 5 etapas calculada com dados reais (plano aprovado, lote aprovado, peças em revisão, publicações, insights) e remoção do `grid-cols-7`.
- Fonte única de contadores (um módulo compartilhado) usada por `ContentProductionQueue`, `MarketingOverviewBridge`, `CampanhasHub`.
- `MarketingResultsSummary`: `Promise.allSettled`, estado por fonte, “indisponível” × “zero real”, reset ao trocar tenant.
- Exibir progresso 102/10 e ação explícita de “gerar próximo lote”.
- **Aceite:** os três painéis mostram os mesmos números para o mesmo tenant; falha de uma API não zera as outras; jornada chega a 5 quando há publicação/insight.

### LOTE 5 — Atribuição comercial (M, depende do L1/L3)
- Gravar `campaignId` do plano em leads capturados por LP/WhatsApp/anúncio (`origin_campaign_id`), preservando `ad_campaign_id`.
- Propagar do lead para o deal (sem quebrar `lead_id`) e expor `GET .../marketing/results?campaignId=`.
- Painel de Resultados por campanha: leads, oportunidades, vendas, receita, CPL/CPA/ROAS quando houver custo.
- **Aceite:** uma venda originada da campanha `camp-1` aparece atribuída a `camp-1`; ausência de dado é explícita.

### LOTE 6 — Consolidação dos bridges e navegação (L, depende dos L2/L4)
- Migrar comportamento de cada bridge para o componente dono (fila, plano, campanha) e remover o mount global correspondente, um por vez, com teste visual.
- Corrigir os títulos/cópias na origem e remover `applyMarketingRedundancyFilter`/`COPY_REPLACEMENTS`.
- Consolidar navegação: uma entrada para Planejamento, uma para Campanhas, uma para Conteúdos, uma para Resultados, Rastreamento como subseção; remover rotas legadas duplicadas com redirect.
- Renomear o wrapper de cota para eliminar a duplicidade de nome.
- **Aceite:** `WorkspaceEnhancements` sem bridges de marketing (ou com lista mínima justificada); nenhum `querySelector` de texto em fluxo crítico; navegação sem duplicidade.

**Sequência recomendada:** L0 → L1 → L2 → L3 → L4 → L5 → L6. L0/L1 desbloqueiam o caso real; L2 evita custo duplicado; L3 corrige a mídia paga; L4 dá visibilidade; L5 fecha o ciclo; L6 paga a dívida estrutural sem pressa.

---

## 10. Arquivos que precisarão ser modificados

**Backend**
- `artifacts/api-server/src/routes/content.ts` (split, proveniência, headers, BrandProfile)
- `artifacts/api-server/src/routes/content_calendar.ts` (estado, gate de vídeo, lote, claim)
- `artifacts/api-server/src/routes/media_plan.ts` (consistência do plano)
- `artifacts/api-server/src/routes/media_library.ts` (projeto da peça × captura)
- `artifacts/api-server/src/routes/ads.ts` (defaults, janela, tipo)
- `artifacts/api-server/src/routes/site_generator.ts` (cor/identidade)
- `artifacts/api-server/src/routes/content_performance.ts` (resiliência/contrato)
- `artifacts/api-server/src/services/media-plan-auto-production.ts` (split, claim, estado)
- `artifacts/api-server/src/services/media-plan-auto-production-policy.ts` (dono da automação)
- `artifacts/api-server/src/services/media-plan-scheduled-publication.ts` (autonomia orgânica)
- `artifacts/api-server/src/services/media-plan-period.ts` (validação de consistência)
- `artifacts/api-server/src/services/content-calendar.ts` (lote/estado)
- `artifacts/api-server/src/services/contentCreativeRuntime.ts` / `creativeDesignBridge.ts` (BrandProfile)
- `artifacts/api-server/src/services/content-final-media.ts` (critérios de mídia final)
- `artifacts/api-server/src/services/media-library.ts` (captura vinculada)
- `artifacts/api-server/src/services/marketingAgentAutonomyPolicy.ts` (coluna/migration)
- `artifacts/api-server/src/lib/content-generation.ts` (cores de marca)
- `artifacts/api-server/src/lib/ai-gateway.ts`, `src/routes/onboarding.ts`, `src/routes/changelog.ts` (encoding)

**Frontend**
- `artifacts/frontend/src/pages/ContentHub.tsx` (jornada, navegação, remoção de filtro DOM)
- `artifacts/frontend/src/components/marketing/ContentProductionQueue.tsx` (estado, contadores, headers)
- `artifacts/frontend/src/components/marketing/MediaPlanAutoProductionBridge.tsx` (parâmetros, claim, estado)
- `artifacts/frontend/src/components/marketing/QuotaSafeMediaPlanAutoProductionBridge.tsx` (nome)
- `artifacts/frontend/src/components/marketing/MarketingOverviewBridge.tsx` (contadores)
- `artifacts/frontend/src/components/marketing/MarketingResultsSummary.tsx` (resiliência/atribuição)
- `artifacts/frontend/src/components/marketing/ContentProductionClarityBridge.tsx`, `PlanningReviewBridge.tsx`, `MediaPlanBatchControl.tsx`, `MediaPlanProductionRuntimeBridge.tsx`, `CampaignWorkspaceClarityBridge.tsx` (consolidação)
- `artifacts/frontend/src/components/runtime/WorkspaceEnhancements.tsx` (mount)
- `artifacts/frontend/src/pages/CampanhasHub.tsx` (fonte única)
- `artifacts/frontend/src/components/marketing/MarketingAutonomyControl.tsx` (coluna)

**Bibliotecas e dados**
- `lib/db/src/schema/content_calendar_items.ts` (se houver novo estado — preferir projeção sem migração destrutiva)
- `lib/db/src/schema/media_core.ts` (se modelar aprovação de mídia)
- `lib/db/migrations/` (renumerar 209; nova migration só se indispensável)
- `lib/vendor-brain/src/marketing-runtime.ts` / `creative-runtime.ts` (integração, sem novo store)

**Documentação**
- `docs/entregas/ALINHA-01-MARKETING-DIAGNOSTICO.md` (este)
- `docs/architecture/vendorai-platform-foundation.md` (infra real)
- `docs/entregas/` registro mestre do lote

> **Não serão tocados:** qualquer arquivo do Arqdor, CRM fora de `leads/deals` para atribuição, ERP, Praça.ai, infraestrutura de deploy.

---

## 11. Critérios de aceite

**Globais**
1. Nenhuma geração do Plano de Mídia sem `tenantId`, `mediaPlanId`, `campaignId`, `calendarItemId` e `contentGenerationId` rastreáveis.
2. Um item do calendário tem **um** estado operacional canônico, com histórico de transição.
3. Toda aprovação de vídeo exige arquivo final; item aprovado sem mídia é impossível por qualquer rota.
4. Produção iniciada por duas abas/janelas ou por tela + worker resulta em **uma** geração por item.
5. Os parâmetros de objetivo, destino, duração, cor e janela vêm do plano/marca, com fallback documentado.
6. Nenhum texto de UI é reescrito ou ocultado por `MutationObserver`/`querySelector` em fluxo crítico.
7. Isolamento de tenant preservado em todas as rotas novas/alteradas (`canAccess` + filtro `tenantId`).
8. Nenhum dado existente é apagado; migrações são aditivas e reversíveis.

**Por lote**
9. L0: `grep -a` de U+FFFD/NUL = 0 nos arquivos de `src`; migration aplicada; autonomia lê/escreve.
10. L1: `POST /content/generate` com headers válidos retorna 200 e grava `contextAudit` completo para os 10 itens do caso AJ Termas (em homologação).
11. L2: teste de concorrência (2 clientes) ⇒ 1 geração; Reel não transita para `aprovado` sem `videoUrl`.
12. L3: anúncios do caso AJ Termas saem com `objective` de conversão, `destinoClique=landing_page` (quando há LP), janela da campanha, orçamento informado e tipo de mídia correto; LP com `#dcd509`.
13. L4: os três painéis coincidem; falha de insights não zera publicações; jornada chega a 5.
14. L5: venda da `camp-1` aparece atribuída à `camp-1` no painel.
15. L6: nenhum bridge de marketing montado globalmente em rota sem justificativa; navegação sem duplicidade.

---

## 12. Estratégia de testes integrados

**Níveis e gates (nenhum lote avança sem todos os aplicáveis):**

| Nível | O que valida | Como | Evidência |
|---|---|---|---|
| G0 — Build | Tipos e bundle | `tsc -p tsconfig.launch-ci.json --noEmit`; `node ./build.mjs`; `pnpm --filter @workspace/frontend run build` | exit code + log |
| G1 — Encoding | Bytes corrompidos | script `grep -a` de U+FFFD/NUL | saída vazia |
| G2 — Unidade | split de pilar, derivação de objetivo/destino/duração, máquina de estados, política de autonomia | `vitest` (novos casos + existentes `content-final-media`, `media-plan-auto-production-policy`, `ContentProductionClarityBridge.test.tsx`) | relatório |
| G3 — Contrato | `GET /content-calendar`, `GET /media-plan`, `GET /content-performance/insights`, `GET /ads/campaigns/:id/metrics` | testes de contrato com fixtures reais anonimizadas | shapes + erros |
| G4 — Integração | Fluxo plano → lote → geração → projeto → aprovação | ambiente isolado (homolog) com **clone** do plano AJ Termas, como feito no MKT-02; nunca no plano original | ids e estados antes/depois |
| G5 — Concorrência/idempotência | 2 abas, tela + worker, reinício no meio | dois clientes simultâneos + restart do processo | 1 geração/item |
| G6 — Isolamento | tenant A não vê/gera B | tokens de dois tenants; tentativa de header cruzado | 403/404 |
| G7 — UI/E2E | jornada, contadores, aprovação, resultados | Playwright (`e2e/tests`), desktop e mobile | screenshots + vídeo |
| G8 — Publicação controlada | fila sem publicar | provider fake/stub; verificar `scheduled`/`queued` e **não** chamar API externa | log sem chamada externa |

**Casos obrigatórios do caso real (somente leitura nesta missão; execução em homologação):**
- 10 ações: cada uma gera exatamente 1 geração com contexto e projeto vinculados.
- Reels: falha de provedor ⇒ estado “aguardando mídia”, nunca “aprovado”.
- Anúncios: 4 rascunhos com objetivo/destino/janela corretos; nenhum publica.
- LP: cor da marca e copy da campanha.
- Resultados: publicações e CRM com recorte por campanha.

**Proibições nos testes:** não publicar em canais reais, não acionar Meta/Google/TikTok/LinkedIn/YouTube, não consumir IA paga sem autorização explícita, não usar dados fictícios no plano real (usar clone/tenant de teste), não rodar Replit/Railway/Actions.

**Registro:** cada execução deve anexar commit, comandos, saída, ids de tenant/plano de teste e resultado. Build não executado = **não validado**.

---

# Anexo A — Achados AL-001 a AL-010

### AL-001 — Contexto empresarial não compartilhado uniformemente
**Diagnóstico:** confirmado. Dois pipelines de prompt; o do plano não usa `buildContentCreativeRuntime`. Identidade visual vem de campos dispersos (`tenants.corPrimaria`, `businessProfiles.logoUrl`, `discoveryData.coresBrand`); o bridge do plano nem lê `corPrimaria`. As gerações do caso real não têm `contextAudit`.
**Correção:** L1 (briefing canônico + BrandProfile + proveniência). **Não** criar novo store de marca: usar `creativeDesignBridge`/`resolveBrandProfileFromBusinessSource`.

### AL-002 — Divergências entre planejamento e execução
**Diagnóstico:** confirmado em cinco frentes: (a) 102 planejadas × 10 materializadas; (b) executor genérico para formatos sem gerador; (c) objetivo/destino/duração/cor fixos; (d) anúncio “vídeo” como imagem; (e) fase da campanha ignorada na janela do anúncio. Há ainda inconsistência interna do plano (15 dias × 18 de fases).
**Correção:** L1 (consistência), L3 (parâmetros), L4 (progresso).

### AL-003 — Parâmetros fixos no `MediaPlanAutoProductionBridge`
**Diagnóstico:** `bridge:648 objective=awareness`, `:642 destinoClique=whatsapp`, `:567 duration 16/30`, `:699 color=#4F46E5`. O contrato de anúncio já aceita `objective` (5 valores) e `destinoClique` (4 valores); a duração é limitada por `max_duration_seconds` do provedor (default 30); a cor tem fonte oficial em `tenants.corPrimaria`.
**Decisão proposta:** **substituir** objetivo, destino e cor; **justificar e parametrizar** a duração (o plano não declara duração por peça), mantendo 15–30 s e persistindo o valor escolhido no projeto. Evidência do dano: 4 anúncios `awareness`/`whatsapp`, LP `#4F46E5` × marca `#dcd509`.

### AL-004 — `ContentHub` calcula a jornada só até a etapa 3
**Diagnóstico:** `currentJourneyStep` = 1/2/3 conforme `statusPlanejamento`. Etapas 4 (publicar) e 5 (melhorar) nunca são ativas; o grid tem 7 colunas para 5 etapas.
**Correção:** L4. Dados já disponíveis: `content_calendar_items` (publicado), `social_publications`, `content_performance_insights`.

### AL-005 — Roteiro “gerado” antes do vídeo final
**Diagnóstico:** bridge grava `gerado` ao iniciar o job (`:598`); worker idem (`:473`). Reels real está `aprovado` sem vídeo; projeto `failed`. O gate de vídeo só cobre transição via `PATCH` e depende de `contentGenerationId` já gravado.
**Correção:** L2 (estado `processing`, gate em toda transição, reconciliação).

### AL-006 — Bridges dependentes de timers e DOM
**Diagnóstico:** 35 componentes com DOM/timers; 27 montados globalmente; dependências por texto de botão, `<header>`, `aria-label` e atributos `data-vendorai-*`. Mapa no §8.
**Correção:** L6, incremental, sempre migrando comportamento para o dono antes de remover. Não consolidar tudo de uma vez.

### AL-007 — Idempotência entre produção automática e frontend
**Diagnóstico:** `sessionStorage` por aba; sem claim no bridge; dois workers concorrentes na tela; duas rotas automáticas alternadas por flag; projeto duplicado por imagem capturada. O worker já tem claim atômico (bom padrão a reaproveitar).
**Correção:** L2.

### AL-008 — Atribuição comercial incompleta
**Diagnóstico:** `origin_campaign_id`/`ad_campaign_id` existem; só anúncio/UTM e Arqdor escrevem. `deals` não carrega campanha. Resultados usa `/dashboard` global.
**Correção:** L5.

### AL-009 — `MarketingResultsSummary` com zeros/valores antigos
**Diagnóstico:** `Promise.all` + `throw` no primeiro erro; `setPublications`/`setGanhos` só em resposta ok; sem reset por tenant; sem estado por fonte.
**Correção:** L4.

### AL-010 — Navegação e nomenclaturas redundantes
**Diagnóstico:** abas numeradas 1–4 + jornada de 5 + barra “Ferramentas” + rotas legadas (`/marketing/plano-de-midia`, `/campanhas`); títulos ocultados e cópias reescritas via DOM; dois componentes com o mesmo nome.
**Correção:** L6.

---

# Anexo B — Caso real AJ Termas Irani (validação das 10 ações)

**Tenant:** `25632d04-dfba-4d51-a43a-554426b12096` — “Aj termas irai” (slug `aj-termas-irai-dnxi`).
**Plano:** `b1586e18-5f91-4ce4-a29e-664bc7e07fb9` — `statusPlanejamento=aprovado`, `periodoDias=15`, `totalAcoesPlanejadas=102`, 3 campanhas, orçamento R$ 200 (gestão `ia_autonoma`, limite rígido), `publicacaoOrganica` **ausente**.
**Campanha:** `camp-1` — “Aquisição de novas oportunidades”, produto “Pacote tiradentes 2027”, oferta “Reserve agora!”.
**Estado do calendário:** 10 itens (1 lote de 10 de 102), todos com geração; 9 `gerado`, 1 `aprovado`; **0 `publicado`**; `social_publications` = 0.

| # | Item | Campanha | Tipo / canal | Status | Geração | Mídia final | Projeto | Conformidade |
|---|---|---|---|---|---|---|---|---|
| 1 | `4e55cde3…` | camp-1 | blog / Blog/SEO | gerado | `76cca636…` type=linkedin | texto | `58853c3e…` draft_ready | **Divergente:** artigo feito por gerador de LinkedIn; sem rastro |
| 2 | `42b4ceea…` | camp-1 | landing_page / Landing Page | gerado | `42585633…` type=linkedin | site `7fd57747…` | `cbd8e699…` draft_ready | **Divergente:** cor `#4F46E5` (marca `#dcd509`); copy por LinkedIn |
| 3 | `7a77e2bc…` | camp-1 | search_ad / Google Search | gerado | `19115074…` type=linkedin | ad google/rsa_pmax (rascunho) | `73c52ff5…` draft_ready | **Divergente:** `awareness`, destino WhatsApp, orçamento 0 |
| 4 | `8f096a37…` | camp-1 | reels / Instagram | **aprovado** | `294d1250…` type=reels, 7 cenas | **sem vídeo** | `22f7e792…` **failed** | **Inconforme:** aprovado sem mídia final (AL-005) |
| 5 | `bc30177e…` | camp-1 | meta_ad / Meta Ads | gerado | `0c8ddc6d…` type=feed | ad meta/**imagem** | `b0d382eb…` draft_ready | **Divergente:** “Vídeo vertical” virou imagem; `awareness`/WhatsApp |
| 6 | `d6ddeed9…` | camp-1 | whatsapp / WhatsApp | gerado | `199074ed…` type=stories | texto | `65925dcb…` draft_ready | **Parcial:** texto ok; executor de stories, sem envio |
| 7 | `ac5ab19c…` | camp-1 | carrossel / Instagram | gerado | `d14a4071…` type=feed | 4 imagens | `a73cfa2d…` draft_ready | **Conforme** formato; sem rastro de contexto |
| 8 | `38dafa1b…` | camp-1 | meta_ad / Meta Ads | gerado | `3e05c5cb…` type=feed | ad meta/imagem | `a026cc0d…` draft_ready | **Divergente:** idem #5 |
| 9 | `ee36e27f…` | camp-1 | search_ad / Google Search | gerado | `4035e5b0…` type=linkedin | ad google/rsa_pmax | `e8244f5c…` draft_ready | **Divergente:** idem #3 |
| 10 | `21437add…` | camp-1 | stories / Instagram | gerado | `ad4e22de…` type=stories | imagem | `3d0805a8…` draft_ready | **Conforme** formato |

**Observações transversais**
- Todas as 10 gerações foram criadas em **2026-11-26 11:38–11:40** e **nenhuma** tem `result.automation`/`contextAudit` → produzidas pelo bridge da tela, sem validação de contexto.
- As 10 datas do calendário são **2026-10-20 a 2026-10-22** (passadas). Não há `publicacaoOrganica.modo`, logo a fila de publicação não enfileira nada: **0 publicadas**.
- `agent_configs.content_generations_this_month = 10` (teto 20 do plano “starter”, pois `subscriptions` não tem linha para o tenant).
- Projetos: 10 vinculados a `calendarItemId` + 7 projetos `mixed` de captura de imagem sem vínculo (ruído).
- 4 anúncios `rascunho` com `orcamento_diario=0`, `totalBudget=0`, `objective=awareness`, `destino=whatsapp`, janelas de 20–28 e 22–30 (fase da campanha ignorada).
- Site `7fd57747…` (`landing`, não publicado) com `config.color=#4F46E5`.

**Conclusão do caso:** o plano está aprovado e o lote de 10 foi produzido apenas como rascunho textual/visual por um caminho sem contexto validado. O vídeo falhou por ausência de provedor e foi aprovado mesmo assim. Nada foi publicado porque o modo automático nunca foi ligado — e, mesmo ligado, o reel seria ignorado por falta de mídia. As 92 ações restantes nunca foram materializadas.

---

# Anexo C — Evidências técnicas e limites do diagnóstico

**Consultas somente-leitura.** Todas as sessões SQL desta auditoria iniciaram com `SET default_transaction_read_only = on`. Nenhum `INSERT/UPDATE/DELETE/PATCH/POST` foi executado contra a API ou o banco. O plano e a campanha **não** foram alterados.

**Reprodução do defeito de split (Node):**

```
pilar = "Aquisição de novas oportunidades · prova"
split(" \uFFFD ")[0] → "Aquisição de novas oportunidades · prova"  → casa com a campanha? false
split(" · ")[0]       → "Aquisição de novas oportunidades"          → casa com a campanha? true
```

**Encoding (contagem por arquivo, bytes UTF-8):**

| Arquivo | U+FFFD | NUL |
|---|---:|---:|
| `artifacts/api-server/src/routes/onboarding.ts` | 279 | 1.164 |
| `artifacts/api-server/src/routes/content.ts` | 160 | 160 |
| `artifacts/api-server/src/routes/changelog.ts` | 49 | 0 |
| `artifacts/api-server/src/services/media-plan-auto-production.ts` | 33 | 0 |
| `artifacts/api-server/src/lib/ai-gateway.ts` | 26 | 585 |

**Migrations:** `vendorai_schema_migrations` tem 495 registros; a versão `209` aplicada é “multi whatsapp numbers”. O arquivo `lib/db/migrations/209_marketing_autonomy_policy.sql` não foi aplicado (renumerado para `576_marketing_autonomy_policy.sql` no L0); a coluna `content_autopilot_config.marketing_autonomy_policy` não existe (verificado por `information_schema.columns`). Há **46** migrations com versão do repositório sem correspondência aplicada (colisões de numeração), o que exige auditoria própria — aqui só se registra o impacto em Marketing.

**Correspondência com produção:** o checkout de produção (`/opt/vendorai/deploy-src`, HEAD `1d212c6d4`, PR #3767) tem os quatro arquivos centrais **byte-idênticos** ao checkout auditado (`0af9d7fc3`): `routes/content.ts`, `services/media-plan-auto-production.ts`, `MediaPlanAutoProductionBridge.tsx` e `ContentHub.tsx`. O arquivo `/opt/vendorai/deploy-state/last-status` registra outro SHA (`1266aa5d7`) para o último deploy — divergência de contabilidade de deploy que deve ser confirmada pela operação, sem impacto no diagnóstico acima (os arquivos conferem).

**Limites:** não foi possível validar chamadas externas (Meta/Google/TikTok/YouTube) nem publicar; não foi testada a correção (por desenho). Não foi feita análise de performance de consultas nem revisão de logs históricos além do necessário. A contagem de ações por campanha reflete o lote materializado, não uma recomputação do plano.

---

# Anexo D — Encaminhamento à auditoria independente

**Pacote para revisão**
1. Este relatório (`docs/entregas/ALINHA-01-MARKETING-DIAGNOSTICO.md`).
2. Referências obrigatórias: `docs/architecture-blueprint.md`, `docs/architecture/vendorai-platform-foundation.md`, `docs/evolucao-vendorai/01-plataforma-central/VC-001-hub-e-navegacao.md`, `lib/vendor-brain/src/marketing-{runtime,context,agent}.ts`, `docs/entregas/MKT-AUDIT-20261126.md`, `docs/entregas/MKT-IA-20261126-revisao-producao-publicacao.md`, `docs/entregas/MKT-01…`, `docs/entregas/MKT-02…`.
3. Evidências do caso real (Anexo B) e contagens (Anexo C).

**Checklist para o auditor**
- [ ] Confirmar D-01/D-02/D-03/D-04 como causas raiz (reproduzir o split e o 409).
- [ ] Confirmar que as 10 gerações estão sem `contextAudit` e que 9 `gerado` + 1 `aprovado` sem vídeo é o estado real.
- [ ] Confirmar que “9/1/0” vem de `MarketingOverviewBridge` e não do estado operacional.
- [ ] Confirmar ausência de `publicacaoOrganica` e de provedor de vídeo.
- [ ] Confirmar a colisão da migration 209 e o impacto na autonomia.
- [ ] Validar a sequência L0→L6 e se algum lote cria store/agente/executor paralelo (não deve).
- [ ] Validar que nenhum item do plano exige reconstrução estrutural nesta fase.
- [ ] Concordar (ou não) com “substituir” × “justificar” em AL-003.

**Decisões abertas que precisam de dono antes do L2/L3**
- A. Dono único da automação: worker backend (recomendado) ou tela? Se worker, o opt-in `publicacaoOrganica.modo` passa a governar produção **e** publicação.
- B. Estado canônico: nova coluna/enum em `content_calendar_items` ou projeção derivada sem migração? Recomendo projeção + um único módulo compartilhado no L2 e migração só se necessário.
- C. Atribuição: `origin_campaign_id` no lead é suficiente ou é preciso criar vínculo no deal? (Recomendo manter `lead_id` e expor por join, sem nova tabela.)
- D. “Biblioteca aprovada”: modelar aprovação em `media_assets` (status) ou usar `metadata.aiRole` como hoje? (Recomendo status explícito, com migração aditiva.)
- E. Duração de vídeo: aceitar 15/30 s como padrão documentado (sem campo no plano) ou incluir `duracaoSegundos` no contrato do canal? (Recomendo incluir no contrato, com default atual.)

**Situação:** relatório pronto para auditoria. **Nenhum lote iniciado.** Após o aceite da auditoria, o próximo passo é abrir branch/PR do LOTE 0 (governança e encoding) — sem merge em `main` e sem deploy automático.

---

# Anexo E — Adendo pós-implementação (2026-11-26)

Este adendo corrige/expande três pontos do diagnóstico original, à luz do que a implementação revelou:

1. **Fonte ≠ bundle (D-29).** O `MediaPlanAutoProductionBridge.tsx` auditado era a fonte bruta. O bundle publicado era reescrito pelo plugin `media-plan-available-quota` (quota, gate de permissão, auto-start desligado). Portanto os achados AL-005/AL-006/AL-007 descrevem corretamente a **fonte**, mas o comportamento efetivo em produção incluía aquelas transformações. O plugin foi removido e a regra passou para o código (L3).
2. **Split corrigido.** `content.ts` e `media-plan-auto-production.ts` não derivam mais o nome da campanha por conta própria; usam `lib/vendor-brain/src/media-plan-execution.ts`. O 409 por contexto não deve mais ocorrer para item válido.
3. **Rastreabilidade e claim.** Toda geração do plano (inclusive pela tela) grava `contextAudit`/`automation`; a produção iniciada pela tela passou a usar claim atômico no servidor, com liberação automática de claims órfãos.

O que **não** mudou: L5 (atribuição por campanha), L6 (consolidação dos bridges/navegação), projeto por imagem gerada, aplicação da migration 576, homologação e publicação. Ver [ALINHA-01-IMPLEMENTACAO.md](ALINHA-01-IMPLEMENTACAO.md), seção 5.
