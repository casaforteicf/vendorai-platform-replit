# ARQ-PARAM-16 — cotas gerais das vistas

Versão: 2026.10.11.16
Código: 5cc3d82c498a215de124037f9632db55d77155b0
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Cotas gerais horizontal e vertical dos elementos visíveis no corte/elevação paramétricos. Opção de mostrar/ocultar, incluída no SVG exportado. Cota vertical considera o menor e maior Z dos elementos visíveis, sem adicionar artificialmente o zero. ViewBox ampliado para as cotas. Medidas recalculadas ao mudar modelo, direção ou corte.

## Arquivos
- artifacts/frontend/src/pages/arch/ConceptArchitecturalDocumentation.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalDocumentation.test.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalElementsPanel.test.tsx

## Verificação
57 testes locais aprovados em 12 arquivos. TypeScript do componente e dependências aprovado. Novos testes de alteração dimensional, ocultação, corte vazio e mudança para elevação. Seletor do teste de escada tornado específico após inclusão de outra checkbox. Sem download real ou validação visual no navegador.

## Pendências
Cotas são gerais, sem cadeia por elemento nem níveis individualizados. Vistas continuam esquemáticas de lajes/escadas/coberturas, sem paredes/esquadrias. Pranchas com escala/carimbo/PDF, orçamento completo e biblioteca seguem pendentes. Sem build completo/E2E/backend neste lote. Homologação/publicação Contabo adiadas pelo usuário; sem merge/main/deploy.
