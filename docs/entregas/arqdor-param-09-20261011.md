# ARQ-PARAM-09 — redimensionamento na planta

Versão: 2026.10.11.9
Código: 362a1bf77737cafe46e8b3ef2cd8e01eacd1a948
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Puxador no canto para lajes, escadas e coberturas selecionadas. Prévia durante o gesto, confirmação única ao soltar, cancelamento com Escape/perda de captura/mudança de contexto. Setas ajustam 1 cm; Shift, 10 cm. Integração com o modelo central e o histórico existente por changeArchitecturalModel. Validação imutável de dimensões, limites retangulares do lote e proporções de escadas. Vãos manuais mantêm posição e tamanho; reduzir a laje de modo a truncá-los é rejeitado. Um movimento inválido mantém a última prévia válida.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptArchitecturalMovement.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalMovement.test.ts
- artifacts/frontend/src/pages/arch/ConceptArchitecturalPlanLayer.tsx
- artifacts/frontend/src/pages/arch/ConceptArchitecturalPlanLayer.test.tsx
- artifacts/frontend/src/pages/arch/ConceptPlan2D.tsx
- artifacts/frontend/src/pages/arch/ConceptPlanner.tsx

## Verificação local
42 testes passaram em 7 arquivos focados. TypeScript sem erros para ConceptArchitecturalPlanLayer e suas dependências. Transformação sintática esbuild de ConceptPlanner e ConceptPlan2D concluída; não equivale ao build completo.

## Pendências
Homologação/publicação Contabo adiada por orientação do usuário. Sem merge em main. Sem validação visual em navegador, móvel, E2E completo ou roundtrip do backend neste lote. Limites usam o retângulo nominal do lote e não incluem beirais nem terreno irregular. Build completo do monorepo não executado.
