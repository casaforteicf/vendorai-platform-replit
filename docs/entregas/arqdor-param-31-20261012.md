# ARQ-PARAM-31 — Total geral exato e confirmação após commit

Versão 2026.10.12.31. Atualizado em 2026-10-12 BRT.
Branch feat/arqdor-direct-design-workspace-20261009. PR https://github.com/casaforteicf/vendorai-platform-replit/pull/3423.
Commit de código 35cb19d92a248749e8a679e23c757417c8d0432f.

## Entregas autorizadas
Continuidade da consulta de preços e integração com orçamento. Helper openingBudgetTotal soma strings monetárias em centavos BigInt e valida numeric(12,2), confirmado no schema arch_projetos. Rejeita valores ausentes, negativos, malformados, precisão acima de duas casas e total acima de 9999999999.99.
Prévia verifica o total projetado antes de mutações, preservando itens manuais/de outros conceitos; problemas desabilitam envio. Token inclui IDs/valores dos itens preservados para exigir nova consulta se o orçamento mudar. Itens próprios ordenados por ID estabilizam o token.
Rota relê totais após mutações, soma exatamente e propaga erro específico para abortar a transação. Resposta HTTP enviada apenas após resolução da transação, evitando anunciar sucesso antes do commit. Lock de linha do projeto serializa esta rota para conceitos diferentes ligados ao mesmo projeto. Sem migração.
Arquivos: artifacts/api-server/src/lib/arch-opening-budget.ts, arch-opening-budget.test.ts, artifacts/api-server/src/routes/arch.ts e este registro. Dependências ARQ-PARAM-26 a 30; impacto restrito à rota opening-budget e helpers.

## Checks realizados
97 testes locais passaram em 18 arquivos: vitest run --globals --environment jsdom artifacts/frontend/src/pages/arch/*.test.ts artifacts/frontend/src/pages/arch/*.test.tsx artifacts/api-server/src/lib/arch-opening-budget.test.ts.
Três testes novos cobrem soma decimal/limite exato, overflow agregado e valores persistidos inválidos.
Typecheck estrito do helper passou: tsc --noEmit --strict --skipLibCheck --target es2022 --moduleResolution bundler --module esnext artifacts/api-server/src/lib/arch-opening-budget.ts.
Transformação de sintaxe da rota por esbuild (sem bundle) passou; não equivale a build ou typecheck completos do backend. Comparação de conteúdo confirmou que mudanças na rota se restringem ao import e endpoint.
AGENTS.md e guia VENDI-03-v2026.10.09-contabo-operator.md lidos neste lote. Skill Supabase Postgres Best Practices e referência lock-short-transactions consultadas; nenhuma chamada externa adicionada à transação.

## Estado e pendências
Implementado com checks locais. API/banco reais, rollback/commit, lock sob concorrência, autenticação/tenant, build completo e E2E permanecem sem validação. Demais rotas de orçamento não foram adaptadas à mesma política de locking; concorrência entre fluxos manuais e esta rota ainda precisa teste e alinhamento. Responsável pelo próximo passo: desenvolvimento em ambiente isolado.
Homologação Contabo e publicação seguem adiadas pelo solicitante nesta conversa. Sem merge/deploy/alteração de produção. Orçamento de outros elementos e integração comercial completa continuam pendentes. Não declarar homologado, publicado ou produto completo.
