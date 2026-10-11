# ARQ-PARAM-14 — quantitativos por elemento e CSV

Versão: 2026.10.11.14
Código: 04daffb0c916f9ce93b9f2924bf07fb446c019dd
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Tabela derivada do modelo no painel paramétrico: área líquida e volume geométrico de lajes, quantidade de escadas, projeção horizontal das coberturas incluindo beirais. União dos vãos manuais e automáticos descontada uma única vez. Atualiza com props do modelo. Exportação CSV com BOM UTF-8, separador ponto e vírgula, decimais em vírgula, escape de aspas e neutralização de fórmulas nos campos textuais.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptArchitecturalSchedule.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalSchedule.test.ts
- artifacts/frontend/src/pages/arch/ConceptArchitecturalSchedule.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.tsx

## Verificação
53 testes locais aprovados em 10 arquivos focados. TypeScript do painel e dependências aprovado. Testes de união dos vãos, volume, alteração do modelo, projeção com beiral e escape CSV. Sem teste visual ou download real no navegador. Sem build completo.

## Limites e pendências
Volume não inclui perdas/composições de materiais. Área de cobertura é projeção horizontal, não área inclinada. Tabela cobre os elementos paramétricos do lote, não orçamento completo nem paredes/esquadrias existentes do editor. Pranchas/cortes/elevações, integração completa com orçamento e biblioteca ainda pendentes. Homologação Contabo/publicação adiadas pelo usuário. Sem merge/main/deploy.
