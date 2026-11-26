# ALINHA-01-IMPL — Implementação do realinhamento do Marketing IA

| Campo | Valor |
|---|---|
| Lote | ALINHA-01-IMPL |
| Versão | 1.0 |
| Data | 2026-11-26 |
| Branch | `feat/alinha-01-runtime` (base: `docs/alinha-01-diagnostico`, commit `15f9a07eb`) |
| Autorização | Solicitante: “pode fazer e isso deve ser para todos os tenants” (2026-11-26) |
| Escopo autorizado | Executar os lotes L0–L4 do diagnóstico; correções genéricas, sem dado de tenant no código |
| Estado | **Implementado e validado tecnicamente. Não homologado. Não publicado.** |
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
| Testes do contrato | `vitest` em `lib/vendor-brain/src/media-plan-execution.test.ts` | **22/22 OK** |
| Testes backend focados | `vitest` (content-final-media, policy, context library, isolamento) | **21/21 OK** |
| Gate real da API | `node ./build.mjs` | **EXIT 0** |
| Build do frontend | `pnpm --filter @workspace/frontend run build` | **EXIT 0** (bundle budget OK) |
| Encoding | `node scripts/check-source-encoding.mjs` | **OK** (0 U+FFFD / 0 NUL) |
| `tsc launch-ci` | `tsc -p tsconfig.launch-ci.json --noEmit` | Falha **pré-existente** por duplicidade de `@types/pg` (já registrada em MKT-IA); filtro nos arquivos alterados não aponta erro |
| Typecheck vendor-brain | `tsc -p tsconfig.json --noEmit` | Falha **pré-existente** em `arqdor-concept-adapter.test.ts` (arquivo não tocado) |

## 5. O que NÃO foi feito (pendências reais)

1. **L5 — atribuição comercial por campanha.** `origin_campaign_id` existe no lead, mas a captura de LP/WhatsApp ainda não grava a campanha do plano; painel por campanha não foi implementado. Depende da decisão C do diagnóstico.
2. **L6 — consolidação dos 27 bridges e da navegação.** O comportamento crítico (quota, permissão, auto-start) saiu do build, mas os bridges continuam montados; a migração para os componentes donos é incremental e não foi iniciada.
3. **Projeto por imagem gerada.** `captureGeneratedMedia` continua criando um projeto por mídia; vincular ao projeto da peça exige mudança na biblioteca e ficou fora deste lote.
4. **Migration 576 não aplicada.** Precisa de homologação e aplicação controlada; sem ela, a aba de autonomia continua falhando em produção.
5. **Homologação, PR e publicação.** Nada foi enviado para `main`, nenhum deploy, nenhuma publicação de conteúdo.

## 6. Riscos e rollback

- **Risco:** o claim usa `contentGenerationId` como marcador temporário (`producing:`). Joins de publicação ignoram o item nesse estado; se a aba morrer, o worker libera após 30 min.
- **Risco:** a jornada e os contadores agora dependem de três APIs; falha parcial é tratada, mas a soma de publicações usa calendário + `social_publications` (pode contar a mesma publicação duas vezes se ambas mudarem de status no mesmo instante). Aceitável para indicador de etapa; não é métrica financeira.
- **Rollback:** reverter o merge do lote devolve o código anterior; a coluna de status é texto (nenhuma migração aplicada) e não há dados apagados. A migration 576 é aditiva (`ADD COLUMN IF NOT EXISTS`).

## 7. Próximo passo

1. Auditoria independente do diff deste lote (não do diagnóstico).
2. Homologação na Contabo com um **clone** do plano AJ Termas: aprovar lote, gerar 1 item de cada tipo, conferir `contextAudit`, claim, estado de vídeo, anúncio com objetivo/destino/janela e LP com `#dcd509`.
3. Aplicar a migration 576 em homologação e depois produção.
4. Iniciar L5 e L6 em lotes separados, com o mesmo critério de evidência.
