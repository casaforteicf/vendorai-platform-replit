# MKT-IA — Revisão de conteúdos, produção automática e publicação

Versão: v2026.11.26-marketing-ia
Data: 2026-11-26
Branch: `marketing-ia-publish` (base `origin/main` @ eebfb6301)

## Objetivo
Destravar a etapa 3 (Revisão) de Conteúdos & Criativos e fechar o ciclo
IA produz → usuário aprova → sistema publica, com teto de 50 gerações/mês.

## Escopo autorizado
- Corrigir contadores/filtros/aprovação em lote da central de revisão.
- Ligar produção automática por plano (opt-in) e publicação após aprovação.
- Teto de 50 gerações/mês para a automação.
- Usar fontes aprovadas da Biblioteca mesmo sem match por palavra-chave.

## Implementado
- `ContentProductionClarityBridge.tsx`: reescrito para ler a fila real
  (`data-vendorai-queue-item`), contadores corretos, filtros funcionais,
  aprovação em lote via botão nativo e remoção dos checkboxes injetados
  dentro dos botões.
- `ContentProductionQueue.tsx`: âncoras estáveis na fila, linha de modo de
  publicação com botão "Ativar publicação automática" e preservação do
  fluxo "Aprovar planejamento" existente na main.
- `media-plan-auto-production.ts` + `media-plan-auto-production-policy.ts`:
  produção automática opt-in por `publicacaoOrganica.modo = "automatico"`,
  override global por `MARKETING_AUTO_PRODUCTION_ENABLED`, teto de 50/mês
  (`MARKETING_AUTO_PRODUCTION_MONTHLY_LIMIT`, aplicado também no transform
  de build).
- `social-publication-worker.ts`: worker sempre avalia a produção (antes
  dependia só da flag global); publicação após aprovação continua pelo
  `enqueueDueMediaPlanPublications` com o calendário.
- `contentContextLibrary.ts`: fallback para fontes aprovadas recentes quando
  nenhuma casa por palavra-chave.
- `MediaPlanAutoProductionBridge.tsx` + `vite.config.ts` (guard de quota):
  sem produção duplicada entre worker e tela.
- `.env.example`: variáveis da automação documentadas.

## Testes / checks
- `vitest` frontend (`ContentProductionClarityBridge.test.tsx`): 5/5 ok
  (contagem 10 em revisão, "Todos (10)", selecionar todos, aprovação em lote
  acionando o botão nativo, sem checkbox dentro de botão, filtro por status).
- `vitest` backend (`media-plan-auto-production-policy.test.ts` 6/6 e
  `contentContextLibrary.test.ts` 3/3): 9/9 ok.
- `node ./build.mjs` (gate real esbuild da API): **EXIT 0**.
- `pnpm --filter @workspace/frontend run build`: **EXIT 0** (bundle budget ok).
- `tsc -p tsconfig.launch-ci.json --noEmit`: **falhou por dependência
  duplicada de `@types/pg` (8.20.0 e 8.23.1) em
  `src/services/visitorPushNotifications.ts`**, arquivo não tocado por este
  lote. O `pnpm-lock.yaml` da main não aceita instalação frozen neste
  workspace (`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`), então o ambiente ficou com
  árvore não-frozen. Pendente revalidar em ambiente limpo.

## Estado
- Implementado e validado tecnicamente (builds + testes).
- **Não homologado, não publicado.** Produção intocada.
- Push apenas da branch `marketing-ia-publish`; sem merge em `main`.

## Pendências
- Revalidar `tsc launch-ci` em ambiente com lock consistente.
- Homologação na Contabo e promoção conforme processo de release.
- Conectar Instagram/Meta e ativar publicação automática no plano do tenant.
- Aprovar as 10 peças existentes para o ciclo andar.
