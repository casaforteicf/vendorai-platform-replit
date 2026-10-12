# ARQ-PARAM-28 — concorrência e resposta da consulta de preços

Versão: 2026.10.12.28
Código: 4223696d4c73ff3326660ef6a3585ebd834b3e65
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Lock imediato por ref durante consulta/aplicação, independente do tempo de renderização React. Reset por contexto de projeto/aberturas; respostas de geração anterior continuam ignoradas. Validação de itens monetários, quantidade positiva, texto, pendências, assinatura, projectId e canApply booleano antes de renderizar/habilitar confirmação. Rejeita itens nulos, preço não finito/negativo, confirmação sem itens/projeto ou com pendências.

## Arquivos
- artifacts/frontend/src/pages/arch/ConceptOpeningBudget.tsx
- artifacts/frontend/src/pages/arch/ConceptOpeningBudget.test.tsx

## Verificação
90 testes locais aprovados em 18 arquivos focados. TypeScript do componente e dependências aprovado. Novos testes de resposta atrasada após troca de projeto, cliques rápidos e item monetário malformado. Testes em jsdom/fetch simulado; sem navegador/API/banco real.

## Pendências
Homologação real de transações/concurrency/tenant e build completo seguem pendentes; sem comprovação de concorrência entre abas neste lote. Não aborta uma gravação já iniciada ao mudar contexto; apenas descarta resposta obsoleta na interface. Integração ainda cobre orçamento de esquadrias, não orçamento integral da obra. Contabo/publicação adiadas pelo usuário; sem merge/main/deploy.
