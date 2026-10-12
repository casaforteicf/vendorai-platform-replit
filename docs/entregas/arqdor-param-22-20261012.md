# ARQ-PARAM-22 — contornos de esquadrias

Versão: 2026.10.12.22
Código: 80aa43a960f2f5a60ec37cd15e9daa535e2f6ceb
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Contornos azuis esquemáticos de portas/janelas vinculadas às paredes customWalls, nos cortes/elevações e SVG/A3. Considera offset normalizado, largura, altura, peitoril e piso. Em cortes, desenha somente os contornos interceptados; omite aberturas órfãs e dimensões não finitas. Limita o contorno ao corpo da parede de 2,80 m existente.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptDocumentationWalls.ts
- artifacts/frontend/src/pages/arch/conceptDocumentationWalls.test.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalSections.ts
- artifacts/frontend/src/pages/arch/ConceptArchitecturalDocumentation.tsx

## Verificação
70 testes locais aprovados em 14 arquivos focados. TypeScript do componente e dependências aprovado. Novos testes de peitoril/cota/piso, contorno fechado, posição de corte, abertura órfã e largura inválida. Sem navegador, impressão real ou build completo.

## Limites e pendências
Representação apenas do perímetro da abertura, sem perfil, folhas, vidro, arco de porta ou fabricação. Sem linhas ocultas entre elementos sobrepostos. Mantém altura padrão das paredes. Pranchas múltiplas/PDF direto, orçamento completo, biblioteca e validação de persistência/E2E seguem pendentes. Homologação/publicação Contabo adiadas pelo usuário. Sem merge/main/deploy.
