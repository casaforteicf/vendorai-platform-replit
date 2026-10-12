# UI-01.9 — Vínculos financeiros por transação

Issue #3452 · PR #3453

## Implementado
- `financialRelationships.ts`: modelo preliminar de papéis financeiros ligados ao negócio/transação, sem inferir remuneração pela profissão.
- Valores em centavos inteiros, validação de somatório, destinatários, duplicidade e campos obrigatórios.
- `financialRelationships.test.ts`: testes unitários das validações.
- Nenhuma cobrança, seguro, transferência, payout ou integração de gateway foi acionada.

## Limitações e próximos ajustes
O contrato atual é um rascunho de distribuição financeira e **não** é um motor contábil ou de split: para produção separar os **pagadores** dos **beneficiários** e registrar entradas e saídas em ledger de partidas apropriadas. Não somar o mesmo dinheiro duas vezes por classificar uma pessoa com múltiplos papéis. Considerar retenções, impostos, parcela, estorno, parcialidade de entrega, câmbio, liquidação, chargeback, antifraude, assinatura contratual, prova de aceite e arredondamento em centavos.

## Segurança
- A participação em uma transação não implica permissão de ver valores de outros participantes.
- Comissão de representante permanece oculta por padrão e acessível somente mediante política de campo.
- Backend deverá validar vínculo tenant-negócio-pessoa, contrato e elegibilidade de pagamento; jamais confiar em objeto financeiro vindo do frontend.
- Conciliação financeira separa previsão de direito, obrigação aprovada, instrução ao provedor, liquidação e estorno.
- Seguros devem ter cobertura, prêmio, beneficiários e aceites distintos, conforme produto e obrigações legais.
- Não ativar split/seguros até integração e homologação em sandbox com provedor compatível.

## Próximo sublote
UI-01.10 — auditoria final dos contratos, validação de TypeScript/Vitest, registro mestre, pendências e gate de homologação. Permanecer sem merge e sem produção.
