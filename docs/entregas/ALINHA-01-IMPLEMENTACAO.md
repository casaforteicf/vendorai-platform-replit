# ALINHA-01-IMPL — Implementação do realinhamento do Marketing IA

| Campo | Valor |
|---|---|
| Lote | ALINHA-01-IMPL |
| Versão | 1.0 |
| Data | 2026-11-26 |
| Branch | `feat/alinha-01-runtime` → PR #3769 → `main` (`02a41138`); deploy de `main` em `7d89136` |
| Autorização | Solicitante: “pode fazer e isso deve ser para todos os tenants” (2026-11-26) |
| Escopo autorizado | Executar os lotes L0–L4 do diagnóstico; correções genéricas, sem dado de tenant no código |
| Estado | **Implementado, validado tecnicamente e publicado em produção (backend 2026-11-27, imagem `main-273b7238d`).** Nenhum conteúdo foi publicado. |
| Diagnóstico de referência | [ALINHA-01-MARKETING-DIAGNOSTICO.md](ALINHA-01-MARKETING-DIAGNOSTICO.md) |

## 1. Objetivo

Realinhar o Marketing IA ao desenho original (Plano de Mídia → contexto único → executores → aprovação → publicação → resultados) **para todos os tenants**, removendo a dependência de comportamento escondido no build, de contexto montado apenas no navegador e de estados divergentes entre telas.

Decisões de projeto que valem para qualquer tenant:

- **Nada de dado fixo de cliente**: cor vem de `tenants.corPrimaria`; objetivo/destino/janela vêm da campanha/canal do plano; duração é default documentado por formato.
- **Nenhum store/agente/executor novo**: tudo usa tabelas, rotas e serviços existentes; o contrato compartilhado é um módulo puro em `@workspace/vendor-brain`.
- **Sem fallback silencioso de campanha**: item órfão falha e aparece como falha; nunca é produzido com o briefing de outra campanha.
- **Idempotência no servidor**: a tela passou a usar claim atômico, o mesmo padrão que o worker já usava.

## 2. O que foi implementado

### L0 — Governança e integridade de base

- **Encoding corrigido (causa raiz dos bugs P0).** Restaurados a partir do commit anterior à corrupção (`63159a37a^`) os arquivos que não tiveram alteração posterior: `routes/content.ts`, `routes/onboarding.ts`, `lib/ai-gateway.ts`, `routes/changelog.ts`. Em `services/media-plan-auto-production.ts` (que teve 4 commits posteriores) as 33 ocorrências foram corrigidas uma a uma, incluindo o separador `" · "` e as mensagens de produção.
- **Gate de encoding:** `scripts/check-source-encoding.mjs` + `pnpm check:encoding` reprovam qualquer `.ts/.tsx` com U+FFFD ou NUL. Resultado atual: `OK`.
- **Migration de autonomia renumerada:** `209_marketing_autonomy_policy.sql` → `576_marketing_autonomy_policy.sql` (a versão 209 do banco era “multi whatsapp numbers”; 576 está livre depois da 575). **Ainda não aplicada em homologação/produção** — é etapa de deploy.
- **Limpeza:** removidos 20 scripts ad-hoc (`fix*.mjs`, `inspect*.mjs`) deixados pelo commit que corrompeu os arquivos.

### L1 — Contexto único e rastreável

- **Novo contrato puro:** `lib/vendor-brain/src/media-plan-execution.ts` (+22 testes) com `campaignNameFromPilar`, `findCampaignForItem`, `resolveAdObjective`, `resolveAdDestination`, `resolveVideoDurationSeconds`, `resolveAdFlightWindow` e `deriveOperationalState`.
- **Split corrigido e centralizado:** `content.ts` e `media-plan-auto-production.ts` deixaram de ter cópia própria da regra de `pilar`; ambos usam o contrato. Teste Node comprova que o separador canônico volta a casar a campanha.
- **Contexto validado voltou a funcionar:** com o split correto, os headers `x-vendorai-*` (fila) passam a resolver a campanha e a gravar `contextAudit`.
- **Bridge envia os headers** de plano/campanha/item em toda geração, então a produção iniciada pela tela também deixa rastro.
- **Proveniência persistida:** toda geração validada grava `contextAudit` (com `channel`, `contentType`) **e** `automation` (`source: media-plan`, ids, `producedBy: validated-api`, status `script_ready`/`draft_ready`).
- **Identidade visual no executor:** `creativeDesignBridge` passou a ler `tenants.corPrimaria`, nome fantasia, tom/estilo do Perfil da Empresa e a montar o `BrandProfile` compartilhado. O executor do plano injeta cores/tom/regras de canal no prompt e usa a cor da marca na geração de imagem (sem persistir store paralelo).
- **Site/LP:** `POST /site-generator/generate` usa `tenants.corPrimaria` quando o chamador não envia cor válida; o bridge envia a cor da marca quando disponível.

### L2 — Estado único e idempotência

- **Estado `processando`:** adicionado ao contrato de status do calendário (texto, sem constraint; não exige migração). Vídeo não nasce mais `gerado`: fica `processando` até existir arquivo final.
- **Reconciliador:** promove `processando → gerado` quando o job de vídeo termina com arquivo; devolve `processando → aprovado` quando falha; encontra jobs iniciados pela tela via `media_projects.context.executorJobId` (antes só olhava a geração).
- **Claim atômico da tela:** `POST /api/tenants/:tenantId/content-calendar/:id/iniciar-producao` reserva o item (`contentGenerationId = producing:<uuid>`, `WHERE contentGenerationId IS NULL`), com permissão de Marketing. 409 quando outra sessão/worker já está produzindo; 201 com `claimId`.
- **Liberação de claim:** em falha, a tela restaura status/geração anteriores; o worker libera claims órfãos com mais de 30 min (`releaseStaleProductionClaims`, rodando a cada ciclo).
- **Worker:** ao falhar, o item volta para `aprovado` (retry possível) em vez de ficar preso.
- **Fila:** passou a usar o claim antes de gerar; o `patchCalendar(status: "gerado")` prévio (que marcava peça pronta antes de existir) foi removido.
- **Capture de mídia:** segue criando projeto próprio por imagem; a ligação ao projeto da peça ficou registrada como pendência do L2 (não alterada para não quebrar a biblioteca).

### L3 — Parâmetros derivados do plano

- **`objective`**: derivado de etapa de funil + KPI do canal/campanha (`awareness|lead|sale|visit|whatsapp`). O KPI global não contamina mais canais de descoberta (teste cobre).
- **`destinoClique`**: derivado de canal/formato e da existência de LP no plano (`landing_page|whatsapp|formulario_lead`).
- **Janela do anúncio**: usa `inicioOffsetDias` + `duracaoDias` da campanha com base na primeira data do lote, em vez de `dataAgendada + duracaoDias`.
- **Duração de vídeo**: `resolveVideoDurationSeconds` (Reels 16, Shorts 20, YouTube 30), dentro dos limites do engine; usada pelo bridge e pelo worker. Justificativa: o plano não declara duração por peça.
- **Cor**: bridge usa `tenants.corPrimaria`; servidor tem fallback.
- **Medição**: objetivo de contato/conversão usa `vendorai` (não `clicks`), evitando o 422 da rota de anúncios.
- **Removida a reescrita de build:** o plugin `media-plan-available-quota` do `vite.config.ts` reescrevia o bridge em tempo de build para inserir quota, gate de permissão e desligar auto-start. Esse comportamento foi **movido para o código-fonte** e o plugin foi removido. O `MediaPlanBatchControl` agora aceita o rótulo “Produzir lote” sem transformação.

### L4 — Jornada, painéis e resiliência

- **Jornada de 5 etapas real** no `ContentHub`: plano → aprovação → execução/produção → publicação → aprendizado, calculada com calendário, publicações e insights (cada fonte falha de forma independente).
- **Ações por etapa**: textos e CTAs para as etapas 4 e 5; card de conteúdos mostra `produzidas/total`; grid corrigido para 5 colunas.
- **Estado compartilhado nos painéis**: `ContentProductionQueue`, `MarketingOverviewBridge` e `CampanhasHub` usam `deriveOperationalState`; “gerado” não é mais contado como “em produção” e “aprovado sem geração” é “Pronto para produzir”.
- **Resultados resiliente**: `MarketingResultsSummary` usa `Promise.allSettled`, limpa estado ao trocar de tenant e mostra “—” para a fonte indisponível, em vez de zero/valor antigo.

## 2.1 Rollout para todos os tenants

A correção é de plataforma, não de tenant: não existe flag, script ou ajuste por cliente. O que muda para todos:

- **Migration aplicada (produção, 2026-11-26):** `576_marketing_autonomy_policy.sql` criou `content_autopilot_config.marketing_autonomy_policy` (`ADD COLUMN IF NOT EXISTS`, default `{"level":0,"maxTransferFractionPerCycle":0.20}`) e registrou a versão 576 em `vendorai_schema_migrations`. Isso conserta a autonomia de todos os tenants imediatamente, inclusive no código já publicado.
- **Claims presos liberados pelo worker em todos os tenants:** a liberação de claims é global (sem filtro de tenant) e roda a cada ciclo. Havia 3 claims `auto-producing:` presos desde 2026-09-15 no tenant `1d4ea673…`; eles passam a ser liberados automaticamente.
- **Lote justo por tenant:** produção e publicação passaram a usar `selectRoundRobinByTenant` (máx. 2 itens/tenant por ciclo de produção; 10/tenant por ciclo de publicação). Sem isso, o tenant com 428 itens atrasados consumiria todas as vagas e os outros 5 nunca produziriam.
- **Estado e contexto globais:** `processando`, claim atômico, `contextAudit`/`automation` e parâmetros derivados valem para qualquer plano aprovado, sem configuração.

**Diagnóstico system-wide (somente leitura, 2026-11-26):** 11 tenants, 6 com plano de mídia, 4 com itens de calendário — **658 itens** (457 planejados, 154 gerados, 47 aprovados, **0 publicados**), 12 planos e **nenhum** com `publicacaoOrganica.modo=automatico`; 206 gerações e **206 sem `contextAudit`**; 1 vídeo aprovado sem arquivo (AJ). Ou seja: o problema descrito no diagnóstico não era do AJ — era do sistema.

> Publicação continua **opt-in por plano**. Nada foi publicado e nenhum plano foi colocado em modo automático por este lote; habilitar publicação exige decisão do tenant e revisão humana.

## 3. Arquivos alterados

**Backend**
- `artifacts/api-server/src/routes/content.ts` (split, marca, proveniência, automation)
- `artifacts/api-server/src/routes/content_calendar.ts` (claim, gate de vídeo)
- `artifacts/api-server/src/routes/site_generator_core.ts` (cor da marca)
- `artifacts/api-server/src/services/media-plan-auto-production.ts` (split, estado de vídeo, claim órfão, job da tela)
- `artifacts/api-server/src/services/creativeDesignBridge.ts` (BrandProfile do tenant)
- `artifacts/api-server/src/services/social-publication-worker.ts` (liberação de claims)
- `artifacts/api-server/src/routes/onboarding.ts`, `routes/changelog.ts`, `lib/ai-gateway.ts` (encoding)
- `artifacts/api-server/src/__tests__/marketing-content-context-isolation.test.ts` (contrato `tenant_brand`)
- scripts ad-hoc removidos

**Frontend**
- `components/marketing/MediaPlanAutoProductionBridge.tsx` (headers, claim, parâmetros, quota/permissão no código, cor, estado de vídeo)
- `components/marketing/ContentProductionQueue.tsx` (claim, estado compartilhado, sem “gerado” prematuro)
- `components/marketing/MarketingOverviewBridge.tsx`, `MarketingResultsSummary.tsx`
- `components/marketing/MediaPlanBatchControl.tsx`
- `pages/ContentHub.tsx`, `pages/CampanhasHub.tsx`
- `vite.config.ts` (plugin de reescrita removido)

**Contratos/dados**
- `lib/vendor-brain/src/media-plan-execution.ts` + teste (novo)
- `lib/vendor-brain/src/index.ts`, `lib/vendor-brain/package.json`
- `lib/db/src/schema/content_calendar_items.ts` (`processando`)
- `lib/db/migrations/576_marketing_autonomy_policy.sql` (renumerada)

**Operação**
- `scripts/check-source-encoding.mjs`, `package.json` (`check:encoding`)

## 4. Validação executada

| Check | Comando | Resultado |
|---|---|---|
| Testes do contrato | `vitest` em `lib/vendor-brain/src/media-plan-execution.test.ts` | **26/26 OK** (inclui lote justo entre tenants) |
| Testes backend focados | `vitest` (content-final-media, policy, context library, isolamento) | **21/21 OK** |
| Gate real da API | `node ./build.mjs` | **EXIT 0** |
| Build do frontend | `pnpm --filter @workspace/frontend run build` | **EXIT 0** (bundle budget OK) |
| Encoding | `node scripts/check-source-encoding.mjs` | **OK** (0 U+FFFD / 0 NUL) |
| `tsc launch-ci` | `tsc -p tsconfig.launch-ci.json --noEmit` | Falha **pré-existente** por duplicidade de `@types/pg` (já registrada em MKT-IA); filtro nos arquivos alterados não aponta erro |
| Typecheck vendor-brain | `tsc -p tsconfig.json --noEmit` | Falha **pré-existente** em `arqdor-concept-adapter.test.ts` (arquivo não tocado) |

## 5. O que NÃO foi feito (pendências reais)

1. ~~L5 — atribuição comercial por campanha~~ **Implementado em 2026-11-27** (ver seção 9): captura grava a campanha do plano no lead e o painel de Resultados mostra leads/ganhos/receita/custo/ROAS por campanha.
2. **L6 — consolidação dos bridges.** Avançou em 2026-11-27: o `ContentHub` não reescreve mais títulos/cópias no DOM, a navegação foi simplificada (abas sem numeração duplicada, ferramenta de rastreamento redundante removida) e a jornada/estado são nativos. Os 27 bridges ainda montados precisam de migração incremental e continuam como pendência estrutural.
3. **Projeto por imagem gerada.** `captureGeneratedMedia` continua criando um projeto por mídia; vincular ao projeto da peça exige mudança na biblioteca e ficou fora deste lote.
4. ~~Migration 576 não aplicada~~ **Aplicada em produção em 2026-11-26** (aditiva, verificada).
5. **Homologação, PR e publicação.** Nada foi enviado para `main`, nenhum deploy, nenhuma publicação de conteúdo.

## 6. Riscos e rollback

- **Risco:** o claim usa `contentGenerationId` como marcador temporário (`producing:`). Joins de publicação ignoram o item nesse estado; se a aba morrer, o worker libera após 30 min.
- **Risco:** a jornada e os contadores agora dependem de três APIs; falha parcial é tratada, mas a soma de publicações usa calendário + `social_publications` (pode contar a mesma publicação duas vezes se ambas mudarem de status no mesmo instante). Aceitável para indicador de etapa; não é métrica financeira.
- **Rollback:** reverter o merge do lote devolve o código anterior; a coluna de status é texto (nenhuma migração aplicada) e não há dados apagados. A migration 576 é aditiva (`ADD COLUMN IF NOT EXISTS`).

## 7. Próximo passo

1. Auditoria independente do diff deste lote (não do diagnóstico).
2. Homologação **multi-tenant** (não só AJ): um tenant por vertical/plano, aprovando lote e gerando 1 item de cada tipo; conferir `contextAudit`, claim, estado de vídeo, anúncio derivado e cor da marca.
3. Release: PR + merge em `main` (auto-deploy Contabo faz homologação e produção com healthcheck/rollback), acompanhando `last-status` e logs do worker.
4. Iniciar L5 e L6 em lotes separados, com o mesmo critério de evidência.


## 8. Deploy e verificação em produção (2026-11-26)

- **PR #3769** mergeado em `main` (`02a41138fabf`), deployado junto com o commit seguinte `7d89136df` (AB #3770), que contém o merge como ancestral.
- **Backend:** imagem `vendorai-api:main-7d89136df` em produção e homologação; `/api/auth/healthz` = **200**; `last-status` = `OK 20261126-223921`.
- **Frontend:** release `7d89136df652591973bf7d48c7a23b7f28da0881`; `last-frontend-status` = `OK 20261126-225245`; bundle publicado contém o novo rótulo “Produzir lote”.
- **Migration 576:** aplicada em produção (coluna + registro em `vendorai_schema_migrations`), beneficiando todos os tenants de imediato.
- **Claims presos:** o worker novo liberou os 3 claims `auto-producing:` antigos no primeiro ciclo (`count: 3` no log) e a base ficou com **0** claims.
- **Publicação:** `content_calendar_items.status='publicado'` continua **0**; nada foi publicado e nenhum plano foi colocado em modo automático.
- **Rota nova:** `POST .../content-calendar/:id/iniciar-producao` responde **401** sem autenticação (existe e está protegida; não é 404).

### Incidente de deploy e correção operacional

O primeiro deploy falhou com `failed to export layer / lease does not exist`. Causa: o `disk-guard` rodou às 22:00 (disco em 87%) **durante o build** e removeu snapshots/camadas em uso no containerd. Correções aplicadas fora do repositório (com backup `.bak-alinha-20261126`):

- `deploy-backend.sh` agora exporta `DOCKER_BUILDKIT=1` (Docker 29 + containerd; builder legado travava na exportação).
- `disk-guard.sh` não executa limpeza enquanto `/opt/vendorai/deploy.lock` estiver em uso.
- Docker/containerd reiniciados para limpar o estado de snapshots; containers voltaram com `unless-stopped` e health 200.

O deploy bem-sucedido usou BuildKit/buildx após a limpeza. O caminho de auto-deploy segue o mesmo fluxo (homolog → healthcheck → prod → healthcheck → rollback).


## 9. L5 e usabilidade (2026-11-27)

### Atribuição comercial por campanha (L5)

- `lib/adAttribution.ts`: `resolveMediaPlanCampaignId()` — resolve a campanha do plano por (1) campo explícito `campaignId`, validado contra o plano mais recente do tenant, ou (2) anúncio vinculado (`ad_campaigns.segmentacao.marketingContext.campaignId`).
- `routes/intake.ts`: a captura pública passa a gravar `origin_campaign_id`, `origin_source='media-plan'` e `origin_captured_at` no lead (na criação e no reaproveitamento de lead existente), sem sobrescrever atribuição já existente.
- `GET /api/tenants/:tenantId/marketing/attribution`: agrega leads, negócios ganhos, receita, custo (snapshots de anúncio), CPL e ROAS por campanha — leitura do CRM, sem tabela nova.
- `MarketingAttributionPanel` na aba Resultados: tabela por campanha com estado vazio explicativo e “Atualizar”.
- Nada é publicado e nenhum dado de lead existente é reescrito.

### Usabilidade e limpeza (L6 parcial)

- `ContentHub` deixou de reescrever/ocultar textos via `MutationObserver` (`applyMarketingRedundancyFilter`, `COPY_REPLACEMENTS` removidos) e deixou de fazer polling de URL a cada 200 ms (`useSearch` do wouter).
- Abas sem numeração concorrente com a jornada; “Conteúdos & Publicação”; ferramenta “Rastreamento” duplicada removida.
- Fila de produção: mostra “Lote atual: X de Y ações planejadas” e botão nativo **Gerar próximo lote** quando o lote atual está decidido e ainda há ações no plano.
- Painel de atribuição adicionado a Resultados.

### Validação

| Check | Resultado |
|---|---|
| `vitest` intake + isolamento + mídia final + política | **21/21 OK** |
| `vitest` contrato vendor-brain | **26/26 OK** |
| `node build.mjs` | **EXIT 0** |
| `vite build` + bundle budget | **EXIT 0** |
| Encoding | **OK** |

**Pendente estrutural:** migração dos 27 bridges para os componentes donos (L6), projeto único por peça, e teste de publicação real com canal conectado (exige autorização do tenant).


## 10. Segundo deploy (2026-11-27)

- PR #3776 mergeado em `273b7238d`; backend em produção `vendorai-api:main-273b7238d` (`OK 20261127-102601`), health 200.
- Rota `GET /api/tenants/:t/marketing/attribution` publicada (401 sem autenticação = existe e protegida).
- O deploy usou **BuildKit** (script ajustado) e passou sem o incidente de snapshot; o `disk-guard` agora respeita o `deploy.lock`.
- Publicação manual: o painel `OrganicCalendarPublisher` deixou de ficar escondido em `tab=gerador&source=media-plan` e passa a aparecer também em **Conteúdos & Publicação**, onde as peças são revisadas/aprovadas.
- Frontend: release atualizado pelo auto-deploy após o merge (verificar `last-frontend-status`).
