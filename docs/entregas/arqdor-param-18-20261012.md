# ARQ-PARAM-18 — verificação da exportação A3

Versão: 2026.10.12.18
Código: 73c261856b7dd41da0425564086914da8d3523b6
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Correção do layout para rejeitar limites invertidos. Testes de interação do componente exportam conteúdo serializado para conferir XML válido, folha 420 × 297 mm, escala 1:50, largura métrica da vista, carimbo, título sem execução como markup, cotas ocultas e remoção do link temporário. Vista grande é bloqueada em 1:50 e exportada em 1:100.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptArchitecturalSheet.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalSheet.test.ts
- artifacts/frontend/src/pages/arch/ConceptArchitecturalDocumentation.test.tsx

## Validação
62 testes locais aprovados em 13 arquivos focados. Interação testada em jsdom com Blob/URL/clique de download simulados; conteúdo SVG analisado como XML. Não comprova download real, visualização em navegador ou impressão física. Sem build completo neste lote.

## Pendências
Paredes/esquadrias, múltiplas vistas, PDF direto, orçamento/biblioteca completos e validação real seguem pendentes. Homologação/publicação Contabo adiadas pelo usuário; sem merge/main/deploy.
