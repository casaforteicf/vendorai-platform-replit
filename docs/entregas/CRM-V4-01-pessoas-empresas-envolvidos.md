# Lote CRM V4 — Pessoas, Empresas e Envolvidos do Negócio

Data de abertura: 2026-10-09
Issue de referência: https://github.com/casaforteicf/vendorai-platform-replit/issues/3099
Branch: feat/crm-lote-v4-relacionamentos

## Objetivo
Reutilizar o cadastro mestre existente e permitir casal (dois consumidores com qualificação individual), PF/PJ e múltiplos envolvidos no mesmo negócio, sem exigir vínculo permanente pessoa-empresa.

## Regras aprovadas
1. Uma pessoa pode participar de vários negócios e ter vínculos contextuais com mais de uma empresa; CPF pertence à pessoa.
2. CNPJ pertence à empresa; identificar duplicados antes de gravar e preservar histórico.
3. Um negócio tem múltiplas pessoas/empresas e papéis definidos por vínculo. É possível identificar contato principal, decisor e responsável financeiro.
4. Para casal, Cliente 1 e Cliente 2 são consumidores principais independentes, cada qual com nome, documento, contato, data de nascimento e qualificação; indicar contato principal sem reduzir o outro a acompanhante genérico.
5. Responsável comercial do lead é obrigatório: usuário interno OU empresa representante; comissão da representante não aparece nas listagens e depende de permissão para edição.
6. Não substituir nem remover as colunas legadas em migração inicial; preservar integrações das propostas, conversas, atividades e pipelines.
7. Isolamento por tenant em toda consulta e escrita, inclusive deduplicação e vinculação.

## Base existente identificada
- `lib/db/src/schema/leads.ts`: `assignedTo`, `representativeFunctionId`, dados de cônjuge, soft delete e classificação não lead.
- `artifacts/api-server/src/routes/deals.ts`: atividades por etapa e regras comerciais.
- `lib/db/src/schema/lead_spouse_consent.ts` e `artifacts/api-server/src/routes/lead_spouse_consent.ts`: consentimento do cônjuge.
- A issue #3099 cita `crm_company_master.ts`, `NewLeadDialog.tsx` e `LeadQuickEditButton.tsx` para reutilização/revisão; conferir implementação real antes de modificá-los.

## Sequência de implementação (sem reescrever módulos existentes)
- [ ] Auditar tabelas mestre e APIs de pessoa/empresa; conferir chaves, índice único por tenant e migrações.
- [ ] Normalizar vínculos de envolvidos por negócio e seus papéis, preservando histórico.
- [ ] Suportar cadastro/edição e qualificação de dois consumidores principais (casal).
- [ ] Unificar os editores de lead e negócio para PF/PJ, busca/criação de pessoa/empresa e papel no negócio.
- [ ] Validar responsável obrigatório no backend e no formulário; manter representante como alternativa.
- [ ] Garantir retrocompatibilidade e isolamento multi-tenant.
- [ ] Executar os gates documentados: `pnpm install --no-frozen-lockfile`; `../../node_modules/.bin/tsc -p tsconfig.launch-ci.json --noEmit`; `node ./build.mjs`.
- [ ] Registrar SHA, PR, arquivos e evidências de homologação/produção somente após verificação.

## Registro mestre de entregas (09/10/2026)
| Campo | Estado |
|---|---|
| Lote | CRM V4-01 |
| Branch | `feat/crm-lote-v4-relacionamentos` |
| PR | [#3428](https://github.com/casaforteicf/vendorai-platform-replit/pull/3428) — rascunho |
| Escopo implementado na branch | Casal, dados pessoais, papéis, contato principal, deduplicação cautelosa, vínculo contextual por tenant, exclusão lógica e histórico dos vínculos |
| Últimos commits de integridade | `2c5e9c1`, `34a458e`, `a9f7acd`, `7959edb`, `e7e866b`, `5305dcf`, `ab84cf3`, `1fb000e`, `a235c86`, `1faded8` |
| Arquivos alterados no lote | `artifacts/frontend/src/components/NewLeadDialog.tsx`, `LeadQuickEditButton.tsx`, `DealParticipantsCard.tsx`, `artifacts/api-server/src/routes/crm_deal_participants.ts`, este registro |
| TypeScript / esbuild | **Não executados**, não afirmar compilação |
| Homologação | **Não realizada** |
| Produção | **Não alterada** |
| Próximas verificações | Consistência transacional do histórico (especialmente reativações simultâneas), fluxo de cadastro existente, compartilhamento de cadastros e privacidade multi-tenant, testes de formulário e gates oficiais |
| Responsável infraestrutura/deploy | Outro agente; fora do escopo deste lote |

> Atenção: implementação registrada não equivale a funcionalidade homologada. Não realizar merge/deploy sem os gates operacionais previstos.

## Aplicação do fluxo oficial — 09/10/2026
- Regras conferidas em `AGENTS.md` do commit `c9467d2`, PR [#3429](https://github.com/casaforteicf/vendorai-platform-replit/pull/3429), ainda não integrado à main na consulta.
- **Versão de trabalho:** CRM V4-01, candidato pré-homologação, sem versão publicada nova.
- **Responsabilidade:** este agente — CRM (código, registro e revisão); outro agente — infraestrutura Contabo e promoção controlada.
- **Estado atual:** implementado sem validação técnica; não homologado, não aprovado para produção e não publicado.
- **GitHub:** PR [#3428](https://github.com/casaforteicf/vendorai-platform-replit/pull/3428) aberto em Draft; consulta do PR indicou mergeable, mas isso **não substitui** tsc/build/homologação.
- **Vendi:** `browser_agent_status` retornou `ok:true`, `configured:true`, `vendiAutonomyEnabled:true`. A consulta de conexões por `tenantKey=casaforteicf` retornou `tenant_not_found`; não foi obtida sessão de homologação nem executados comandos na Contabo.
- **Build e validação:** nenhum log de `tsc`, `node ./build.mjs` ou homologação do commit atual foi obtido nesta sessão; continuam pendentes. Não usar GitHub Actions como condição obrigatória.
- **Próxima ação executável:** concluir revisão de código e usar acesso autenticado do Vendi/Contabo quando houver sessão de tenant válida, sem tocar produção; registrar o SHA e os logs de build e homologação antes de promover.
- **Segurança:** não usar Replit, TinyFish nem Desktop Commander; não intervir no trabalho de infraestrutura e não publicar sem procedimento aprovado.

## Diagnóstico de acesso Vendi — 09/10/2026 (complemento)
- Identificação correta de tenant encontrada: `vendorai` (a tentativa anterior com `casaforteicf` retornava `tenant_not_found`).
- Conexão salva `https://homolog.appvendorai.com/` localizada com sessão persistente; nenhuma publicação, login novo ou escrita solicitada.
- Tentativa read-only de inspeção da homologação resultou em `VENDI_HOMOLOG_AUTH_EXCHANGE_FAILED:401:upstream_token_rejected`; `runId=4fb493af-a000-451f-aaf9-c9505d8544e3`.
- **Evidência insuficiente para validar:** sem execução de `tsc`, `build.mjs` ou teste funcional no commit atual. Estado permanece `implementado sem validação`.
- **Próxima ação:** restabelecer troca de token da conexão Vendi de homologação através do fluxo operacional próprio; em seguida validar na Contabo com logs e hash do candidato sem impactar produção. Trabalho de infraestrutura/autenticação cabe ao agente responsável.

## Revisão de integridade — 09/10/2026
- Commit `cef2c0f`: repetir uma desvinculação já inativa passa a retornar 204 sem adicionar eventos duplicados.
- Commit `6af2392`: respostas de conflito de deduplicação não expõem IDs de pessoas do cadastro mestre global.
- Revisões de código registradas no PR #3428, ainda **sem execução de build/tsc e sem homologação**.
- Autenticação da homologação via Vendi continua bloqueada por `VENDI_HOMOLOG_AUTH_EXCHANGE_FAILED:401:upstream_token_rejected`, runId `4fb493af-a000-451f-aaf9-c9505d8544e3`. Não confundir esse impedimento de acesso com falha do GitHub Actions.
- Segurança ainda a avaliar: reaproveitamento de registros globais no endpoint `POST /crm/people` exige análise completa de visibilidade por tenant antes da homologação.

## Revisão de isolamento multi-tenant — 09/10/2026
- `f2a2ea5`: `POST /crm/people` não devolve o cadastro mestre completo quando o documento pertence a pessoa sem relacionamento conhecido com o tenant solicitante; retorna conflito genérico.
- `330bbc9`: `PATCH /crm/deals/:dealId/people/:personId/profile` bloqueia edição do perfil mestre global quando detecta vínculos da mesma pessoa com outro tenant (negócios ou contatos da empresa), evitando que um tenant altere dados usados por outro.
- Pendência arquitetural: fluxo específico para autorização/vinculação de documentos já existentes em outro tenant, sem divulgar identificadores ou PII. A mudança conservadora pode exigir UX adicional para cadastros compartilhados.
- Estado: **implementado sem validação**; não foram obtidos logs de Contabo nem evidências de homologação. Vendi homologação segue com 401 no fluxo de troca de token.

## Continuação — controle de acesso de pessoa por negócio (09/10/2026)
- `c3176cd`: o endpoint de edição do perfil rejeita relação com `metadata.inactive=true`.
- `3e52b91`: o endpoint de vínculo por `personId` rejeita IDs que possuam referências em outros tenants, sem referência local, impedindo associação arbitrária entre tenants.
- **Limitação remanescente:** cadastros globais ainda sem nenhum vínculo exigem um mecanismo de titularidade/autorização de criação para impedir associação por conhecimento de ID; este ajuste isolado não encerra toda a segurança multi-tenant.
- Build na Contabo e homologação: não realizados. A conexão Vendi de homologação segue com troca de token recusada (401). Produção intocada.
