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

## Registro mestre de entregas
| Campo | Estado |
|---|---|
| Lote | CRM V4-01 |
| Branch | feat/crm-lote-v4-relacionamentos |
| Entrega comprovada | Especificação técnica e rastreabilidade inicial |
| Código funcional alterado | Não |
| TypeScript / esbuild | Não executados |
| Homologação / produção | Não alteradas |
| Bloqueio | Acesso remoto Desktop Commander indisponível por cota; sem clone Git privado no ambiente atual |
| Infra | Fora de escopo: outro agente |
