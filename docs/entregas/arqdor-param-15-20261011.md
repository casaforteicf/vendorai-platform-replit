# ARQ-PARAM-15 — cortes e elevações paramétricos

Versão: 2026.10.11.15
Código: 5902146ce0277956fd48bff67eb879cc150cabe5
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Cortes em X/Y com posição métrica, elevação ortográfica e exportação SVG da vista atual no painel. Derivação das caixas de lajes e escadas em cotas absolutas e interseção das faces inclinadas de cobertura. Células de lajes já descontam vãos manuais e automáticos. Atualização por modelo recebido. Campos vazios não geram geometria. SVG ajustado ao conteúdo e sem escala física de impressão.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptArchitecturalSections.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalSections.test.ts
- artifacts/frontend/src/pages/arch/ConceptArchitecturalDocumentation.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.tsx

## Verificação
55 testes locais aprovados em 11 arquivos focados. TypeScript do painel e dependências aprovado. Testes de vãos/cotas, corte fora dos elementos, cobertura inclinada, cumeeira e alteração do modelo. Sem inspeção visual de navegador, download real ou build completo.

## Pendências e limites
Vistas esquemáticas somente de lajes, escadas e coberturas. Não incluem paredes, portas/janelas, cotas gráficas, carimbo ou prancha/PDF com escala. Elevação é projeção sem remoção de linhas ocultas. Integração completa com orçamento e biblioteca pendente. Contabo e publicação adiadas pelo usuário; sem merge/main/deploy.
