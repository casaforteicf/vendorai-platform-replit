# ARQ-PARAM-25 — especificações no quadro de esquadrias

Versão: 2026.10.12.25
Código: e34f1bf89ecc3b35246989fb41043d3e035ff6fa
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Quadro/CSV reutilizam fabricante, perfil, vidro, folhas, tipo de abertura e catalogProductId das aberturas autorais. Detalhes expansíveis mantêm tabela compacta. Ausências indicadas como não informadas/não vinculadas. Folhas não inteiras/positivas não recebem número inventado. Mantém campos existentes da geometria e conferência.

## Arquivos
- artifacts/frontend/src/pages/arch/conceptDocumentationWalls.ts
- artifacts/frontend/src/pages/arch/conceptOpeningSchedule.ts
- artifacts/frontend/src/pages/arch/conceptOpeningSchedule.test.ts
- artifacts/frontend/src/pages/arch/ConceptOpeningSchedule.tsx
- artifacts/frontend/src/pages/arch/ConceptOpeningSchedule.test.tsx

## Verificação
78 testes locais aprovados em 16 arquivos focados. TypeScript do quadro e dependências aprovado. Novos testes de preservação/exportação de especificações e campos ausentes/detalhes no componente. Sem build completo, navegador ou consulta a catálogo/backend.

## Pendências
Exibe dados autorais e ID do produto, sem resolver catálogo, estoque ou preços. Não gera geometria de perfis/folhas/vidros a partir destes dados. Integração completa com orçamento, PDF/múltiplas vistas e validação real seguem pendentes. Homologação/publicação Contabo adiadas pelo usuário; sem merge/main/deploy.
