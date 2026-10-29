# Protocolo de Execução de Agentes — Vendor.ai

> Objetivo: todo lote é concluído **de verdade**, com evidência técnica e funcional,
> sem declarar como pronta uma funcionalidade incompleta. Elimina bloqueios
> desnecessários e retrabalho entre agentes.

Repositório: `casaforteicf/vendorai-platform-replit` · Deploy: Contabo (cron) ·
GitHub: **API REST, nunca GraphQL** · Commits: autor/committer `marcosreisdorfer@gmail.com`.

---

## 0. Papéis

- **Agente de desenvolvimento (Dev):** implementa o lote numa branch, escreve testes,
  mantém a branch reconciliada com a `main`, abre PR em **rascunho** com a seção de
  evidências. **Não faz merge.**
- **Agente integrador (Integração):** reconcilia com a `main` atual, roda os gates,
  verifica regressões, aplica migrations autorizadas, mergeia no SHA exato, prepara
  homologação e rollback.

Um lote = uma branch = um dono por vez. Nunca dois agentes editando os mesmos arquivos
rumo à `main` ao mesmo tempo.

---

## 1. Gate REAL de publicação (o que trava o deploy)

Rodar na raiz / no filtro do pacote, com `CI=true` e `pnpm@10.26.1`. Os gates podem ser executados no sandbox isolado para antecipar falhas; a validação pertinente ao SHA final deve também ser evidenciada na homologação isolada da Contabo conforme `AGENTS.md`. O sandbox não comprova o estado da VPS:

1. `pnpm install --no-frozen-lockfile`
2. `pnpm run typecheck:libs` (shared libs) — deve passar.
3. Backend: `tsc -p tsconfig.launch-ci.json --noEmit` (subset do gate de deploy) — deve passar.
4. Backend: `node build.mjs` (esbuild, gate real a partir de `src/index.ts`) — deve passar.
5. Frontend: `vite build` — um único erro de sintaxe quebra o build inteiro.
6. Frontend: `node scripts/audit-bundle-budget.mjs` — **todos** os limites dentro do orçamento.
7. Testes **direcionados** aos arquivos que a branch tocou (vitest) — verdes.

Se qualquer um falhar: **não publicar**. Registrar a causa exata e corrigir só o que o
gate apontou.

### O que NÃO é gate (não travar nisso)

- `pnpm --filter @workspace/frontend typecheck` (tsc completo do frontend) tem ~300 erros
  **pré-existentes na `main`**. Não precisa zerar para publicar. A regra é **zero regressão**
  (ver §2), não "zero erros".
- GitHub Actions com `startup_failure` é problema de infra/org, **não** do código. Os gates
  rodam manualmente pelos comandos acima. **Não** usar Actions como método de deploy.

---

## 2. Como identificar REGRESSÃO (inclusive em arquivo não alterado)

Um erro é regressão quando foi **introduzido pela branch** em comparação com a `main` de referência. A interseção de arquivos alterados com arquivos que têm erros é apenas uma triagem: **interseção vazia NÃO prova zero regressões**, porque mudanças em contratos, exports ou tipos podem quebrar consumidores não alterados.

**Comparação obrigatória, na mesma versão de dependências, lockfile, Node, configuração e comando:**

1. Anotar SHA exato da `main` mais recente e HEAD da branch já reconciliada; executar a mesma instalação e o mesmo TypeScript completo nos dois worktrees isolados.
2. Salvar a saída integral, código de saída e logs de cada diagnóstico. Normalizar apenas caminhos absolutos e formatação não semântica, preservando arquivo, linha, coluna, código TS e mensagem.
3. Comparar os diagnósticos **completos** (`main` × branch), inclusive nos arquivos não modificados. Erros novos ou agravados são candidatos a regressão e devem ser investigados. Mudanças de posição/linha exigem análise contextual antes da classificação.
4. Executar testes direcionados **e de integração dos consumidores afetados**, verificando contratos, permissões e comportamento; resultados verdes não dispensam homologação funcional.
5. Registrar no PR: SHA da baseline, SHA testado, comandos, logs anexados, erros preexistentes, erros novos e justificativas com evidências. Falha na comparação ou regressão nova não resolvida = **gate pendente**.

O TypeScript completo do frontend **não é um gate de zero erros históricos** enquanto o débito da `main` persistir; o requisito é **não introduzir regressão**. Não mascarar diagnósticos com `any`, `@ts-ignore` ou supressões globais.

---

## 3. Homologação funcional (compilar ≠ funcionar)

Os gates do §1 provam que **builda, sobe e não regride o que foi tocado**. Eles **não**
provam que a funcionalidade faz o que foi aprovado nem que a tela bate com o mockup.
Para isso:

1. **Ambiente de homologação** na Contabo (`:5000`), separado da produção (`:5001`).
2. **Smoke funcional no navegador** (login real, criar/editar/salvar/fechar-reabrir,
   permissões por tenant, isolamento entre tenants). Fluxo mínimo por módulo:
   - **Arqdor Projeto:** criar projeto → editar paredes/portas/janelas/escadas →
     conferir 2D↔3D → salvar → fechar/reabrir (mesma geometria) → sincronizar revisão.
   - **Render:** abrir usando a geometria aprovada → câmera/iluminação/material →
     gerar render → versionar → **confirmar que controles exibidos têm função real**
     (nada de amostra/valor fake apresentado como operacional).
   - **Demais módulos:** abrir, executar a ação principal, voltar à TAD, logout/relogin
     sem reaproveitar permissões.
3. **Evidência:** print/registro do fluxo + SHA homologado. Sem isso, **não** declarar pronto.
4. **E2E (recomendado):** Playwright para os fluxos críticos, versionado no repo, para
   automatizar o item 2 ao longo do tempo.

Regra de ouro: **funcionalidade incompleta ou com controle não-funcional só entra em
produção DORMENTE** (atrás de feature flag off) até a homologação funcional passar.

---

## 4. Fluxo Dev → Integração (sem duplicar trabalho)

**Dev entrega:**
- Branch única por lote, **rebaseada/mergeada com a `main` atual** antes de entregar.
- Feature flag (off) para UI/fluxo não homologado.
- Testes dos componentes novos.
- PR em **rascunho** com seção de evidências: SHA, comandos rodados + resultados reais,
  o que falta, riscos/conflitos. **Não mergeia.**

**Integração assume:**
1. `git merge origin/main` na branch (resolver conflito por intenção; nunca sobrescrever
   trabalho de outro agente).
2. Roda os 7 gates (§1) + verifica regressão (§2).
3. Migrations: só **aditivas/idempotentes/reversíveis**, aplicadas **migration-first** via
   Supabase MCP e **com autorização explícita** do Marcos. Nunca migration de teste em produção.
4. **Antes do merge:** obter a aprovação aplicável, confirmar que a função não homologada está comprovadamente dormente (flag off no frontend/backend), ou homologar o release candidato de modo isolado. **O merge na `main` pode acionar cron e publicar; não é ação neutra.** Merge no **SHA exato de 40 chars**: `gh api -X PUT .../pulls/<N>/merge -f merge_method=squash -f sha=<HEAD>`.
   (Tirar do rascunho antes: `gh api -X POST .../pulls/<N>/ccr/ready_for_review`.)
5. Confirma deploy (cron: build → homolog `:5000` → prod `:5001` → auto-rollback) e entrega
   cmd de status + rollback.

**Anti-duplicação:** a fonte da verdade é a branch/PR. A `main` muda a cada publicação —
**sempre reconciliar contra a `main` mais recente** antes de qualquer trabalho. Dev para no
"draft pronto + evidências"; Integração é dona da reconciliação e do merge.

---

## 5. Publicação e rollback (Contabo)

- O frontend ativo de `app.appvendorai.com` é Vite estático na **Contabo/nginx**, de acordo com `CLAUDE.md`; o projeto Cloudflare Pages é inativo. Não usar Pages como evidência de publicação.
- Deploy é **automático por cron** (`deploy-backend.sh` + `deploy-frontend-auto.sh`): build com
  gate `tsc` no `Dockerfile.deploy` → homolog `:5000` healthcheck `/api/auth/healthz` → prod
  `:5001` → auto-rollback em falha. `deploy.lock` serializa. **Não alterar** cron/scripts/Actions.
- **Confirmar** pós-merge: identificar o SHA efetivo do backend e o release efetivo do frontend nos caminhos de status do ambiente, verificar `:5001` healthz = 200 e site = 200. Esses sinais atestam publicação/boot, **não** homologação funcional. Como o cron pode publicar após merge, conferir gates, flags e autorização **antes** de integrar.
- **Rollback:** `DEPLOY_IMAGE=vendorai-api:main-<SHA_anterior>` no `docker compose up -d api-prod`;
  frontend via symlink do release anterior.
- Ações na VPS saem por `.cmd` que o Marcos roda no Windows (sem SSH direto do sandbox):
  sem aspas duplas internas, sem parênteses no echo remoto, `%%` para `%`, saída em `.txt` no Desktop.

---

## 6. Regras permanentes

- Nunca Replit, TinyFish ou Desktop Commander.
- GitHub via REST, não GraphQL.
- Commit author/committer = `marcosreisdorfer@gmail.com` (+ `Co-Authored-By`).
- Não alterar produção durante dev/homologação; não rodar migration sem revisão/autorização.
- Não expor credenciais/tokens.
- Não mergear com teste reprovado, ausente ou bloqueado.
- Não publicar versão diferente da homologada.
- Não declarar pronto só porque os commits foram enviados — **pronto = gates + homologação + evidência**.
- Se bloqueado numa frente, registrar o motivo concreto e seguir as frentes independentes.
