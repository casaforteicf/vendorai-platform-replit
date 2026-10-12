# ARQ-PARAM-29 — confirmação e totais do orçamento

Versão: 2026.10.12.29
Código: 5ad7d6d1f369a10d50390e4f2c3dd69a72f201ca
PR: https://github.com/casaforteicf/vendorai-platform-replit/pull/3423

## Entrega
Só anuncia sincronização após resposta ok:true, projeto correspondente, quantidade igual à prévia e totais válidos/coerentes. Exibe subtotal sincronizado e total geral retornado pelo servidor. Resposta incompleta avisa que a gravação não pôde ser confirmada, sem afirmar que foi revertida. Prévia rejeitada se IDs repetidos ou soma de totais dos itens divergir do subtotal. Totais confirmados são limpos ao mudar contexto ou iniciar outra consulta.

## Arquivos
- artifacts/frontend/src/pages/arch/ConceptOpeningBudget.tsx
- artifacts/frontend/src/pages/arch/ConceptOpeningBudget.test.tsx

## Verificação
92 testes locais aprovados em 18 arquivos focados. TypeScript strict do componente e dependências aprovado após guarda explícita da prévia. Novos testes de recibo incompleto, divergência de subtotal e exibição do total geral. API simulada em jsdom. Sem sessão/banco/navegador reais ou build completo.

## Pendências
Homologação HTTP/banco, transação e concorrência reais continuam pendentes. Não realiza estorno automático quando a resposta é inválida; orienta consultar orçamento antes de reenviar. Integração cobre esquadrias, não orçamento integral da obra. Contabo/publicação adiadas pelo usuário; sem merge/main/deploy.
