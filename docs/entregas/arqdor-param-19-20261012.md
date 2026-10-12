# ARQ-PARAM-19 — planta paramétrica por pavimento

Versão: 2026.10.12.19
Código: 82c2259ef7a379893c7ce06bc82f4ad9571ee623
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Modo Planta por pavimento no painel de documentação, com seleção numérica do piso, cotas gerais, exportação da vista SVG e prancha A3 com escala. Inclui lajes (células sólidas com os cortes manuais/automáticos) e contorno de escadas. Carimbo distingue a planta e seu pavimento. Campos inválidos retornam vista vazia sem gerar desenho incoerente.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptArchitecturalSections.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalSections.test.ts
- artifacts/frontend/src/pages/arch/ConceptArchitecturalDocumentation.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalDocumentation.test.tsx

## Verificação
64 testes locais aprovados em 13 arquivos focados. TypeScript do componente e dependências aprovado. Testes de pavimento, conservação de área/vãos e troca de modo com cotas. Sem inspeção visual, impressão real ou build completo neste lote.

## Pendências
Planta paramétrica parcial, sem paredes/portas/janelas/mobiliário/coberturas. Uma vista por folha; PDF direto e orçamento/biblioteca completos pendentes. Homologação/publicação Contabo adiadas pelo usuário. Sem merge/main/deploy.
