# Vendi — validação de backend Contabo

Data: 2026-10-20  
Estado: fluxo de missão enfileirada, contexto RLS e validação do runtime Contabo implementados localmente e validados no backend; ainda não publicados.

## Evidência e escopo

A Central de Melhorias já contém consumidor da fila de melhorias, geração de PR, coleta de checks e fluxo de release. O validador de produção em `artifacts/api-server/src/routes/dev_agent_validation.ts`, porém, só distinguia Cloudflare de Railway. Para mudanças de backend, verificava `RAILWAY_GIT_COMMIT_SHA` e classificava o runtime como Railway, mesmo com a API operando na Contabo.

Este lote adiciona detecção explícita de Contabo para a validação posterior à publicação. Ele consulta `/api/auth/healthz`, exige HTTPS, resposta saudável e o cabeçalho `X-VendorAI-Revision`, e compara a revisão observada com o commit esperado e com a `main`.

Configuração prevista no runtime do backend:

- `VENDORAI_BACKEND_RUNTIME=contabo`
- `VENDORAI_PRODUCTION_API_URL=https://api.appvendorai.com`

Sem `VENDORAI_BACKEND_RUNTIME=contabo`, a compatibilidade anterior com Railway permanece. O validador não executa deploy, merge ou migration.

## Arquivos

- `artifacts/api-server/src/routes/dev_agent_validation.ts`
- `artifacts/api-server/src/routes/dev-agent-validation-runtime.test.ts`

## Validação e publicação

- O checkout estava em sparse-checkout e omitia `lib/*`; adicionar `lib` materializou o pacote versionado `@workspace/api-zod`. Não houve mudança de código nesse pacote.
- Vitest direcionado: 3 arquivos, 11 testes aprovados (`vendi-db-errors`, resolução de runtime e supervisor Vendi).
- Typecheck do launch: `tsc -p tsconfig.launch-ci.json --noEmit` passou.
- Build da API: `node ./build.mjs` passou.
- `git diff --check`: passou antes do fechamento do relatório.
- `pnpm` tentou reconciliar build scripts e foi bloqueado por `ERR_PNPM_IGNORED_BUILDS` para esbuild. Os comandos diretos dos bins locais foram usados para testes/typecheck; o build Node direto passou.
- Contabo, consulta somente leitura: `homologHealth` e `prodHealth` retornaram `{"status":"ok"}`. `vendorai-homolog-api` está na imagem `vendorai-release:vendi-3578-d3a6470124f6`; `vendorai-prod-api-candidate` continua em `vendorai-api:main-cb9e99cb2`.
- Operador Contabo: `VENDI-3578` tem imagem presente, SHA `d3a6470124f6651bf53749a06e184b538539bdf6`, estado `BUILT_NOT_DEPLOYED` em relação à produção.
- Isso não comprova criação de missão em homologação nem em produção. Nenhum POST real foi feito nesta validação e nenhuma migration foi aplicada.
- Commit/PR: não criado.

## Próximos gates

1. Configurar os dois env vars somente na homologação e validar revisão, resposta degradada e divergência de SHA.
2. Corrigir e validar a persistência de missões contra a base efetivamente usada pela API. O histórico de diagnóstico registra tabelas Vendi ausentes no alvo consultado; a migration precisa ser aplicada ao destino correto após revisão e autorização.
3. Reconciliar o fluxo do Release Center com o operador VENDI-04: hoje o Release Center pode criar/mesclar PRs, mas este ajuste só valida uma API Contabo já publicada e não chama build/homologação/publicação do operador.
4. Manter a publicação autônoma bloqueada até provar migração/backup, teste real de missão em homologação, operação/rollback Contabo e validação de revisão.

## Limites atuais da autonomia

- O worker da Central de Melhorias já consome itens em `queued`/`idle`, executa trabalho técnico e pode criar PR.
- Merge/publicação dependem de `admin_release_execution_control.mode='running'`, `VENDI_FULL_AUTONOMY_ENABLED` (ou `VENDI_AUTONOMY_ENABLED`), `VENDI_AUTO_APPROVE_RELEASES` e `VENDI_RELEASE_OPERATOR_VALIDATED`.
- O worker de release não invoca o operador Contabo. O operador exposto ao Vendi oferece `build`, `homologate`, `rollback` e `releaseStatus`; não oferece publicação de produção pelo conector atual.
- O agente de navegador está configurado, mas a autonomia por tenant foi observada desativada. Habilitar isso não corrige migrations nem autoriza execução irrestrita de ferramentas.
- Não ativar os flags de produção antes de fechar os gates acima.

## Correção do fluxo de missões preparada

- `POST /api/vendi/missions` cria a missão e, quando `autoExecute=true`, o evento `queued` dentro da mesma transação. Responde `202` com o ID/status após persistir; a execução não fica presa à duração do request HTTP.
- O worker percorre tenants, reivindica no máximo uma missão por ciclo com `FOR UPDATE SKIP LOCKED`, registra `running` antes de executar e usa contexto RLS transacional `app.tenant_id` via `app_security.set_tenant_context`.
- Execução manual e worker usam bloqueio/estado para evitar reivindicar simultaneamente a mesma missão. Missões de alto risco continuam pausadas para aprovação conforme a política existente.
- `autoExecute=false` continua persistindo como `planning` para execução manual; não entra na fila automática.
- A tela agora mostra `Na fila`, atualiza enquanto a missão está pendente e não permite acionar manualmente uma missão que o worker já está processando.
- O worker respeita `VENDORAI_DISABLE_BACKGROUND_JOBS=1` (usado para canários isolados) e `VENDI_MISSION_QUEUE_ENABLED=false`.

## Validação após a implementação

- Vitest direcionado: **5 arquivos, 16 testes aprovados**, incluindo persistência/enfileiramento, evento no mesmo escopo transacional, contexto do tenant, diagnóstico PostgreSQL, runtime e política de risco.
- `tsc -p tsconfig.launch-ci.json --noEmit`: passou.
- `node ./build.mjs` da API: passou.
- Build/typecheck do frontend não executados: dependências do frontend não estão ligadas neste checkout esparso.
- Nenhum POST real foi executado em homologação ou produção; nenhuma migration foi aplicada; não houve commit, PR, merge ou publicação.
