# ARQ-PARAM-17 — prancha SVG A3 com escala

Versão: 2026.10.12.17
Código: 8c8b31222befa4bb75d8b92604aafbbd96030191
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Exportação da vista atual em folha SVG A3 horizontal 420 × 297 mm, com moldura e carimbo simples. Escalas 1:50, 1:100 ou 1:200, título limitado a 80 caracteres, direção e posição do corte. Desenho e cotas atuais preservados. Conversão de metros para milímetros na escala selecionada; rejeita vista maior que a área de desenho e orienta escolha de outra escala. Imprimir a 100%, sem ajuste à página.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptArchitecturalSheet.ts
- artifacts/frontend/src/pages/arch/conceptArchitecturalSheet.test.ts
- artifacts/frontend/src/pages/arch/ConceptArchitecturalDocumentation.tsx

## Validação
59 testes locais aprovados em 13 arquivos focados. TypeScript do componente e dependências aprovado. Conversão de escala, proporcionalidade e rejeição de escala inválida/excesso de tamanho testadas. Sem validação visual, download real ou impressão física neste lote. Sem build completo.

## Pendências
Prancha ainda esquemática: lajes, escadas, coberturas, cotas gerais. Sem paredes/esquadrias, PDF direto, múltiplas vistas, cadeia de cotas nem orçamento completo. Campos de título/escala são preferências locais do painel, não persistidos no projeto. Homologação/publicação Contabo seguem adiadas por orientação do usuário. Sem merge/main/deploy.
