# CRM-07 — coluna do board vazia após transferir lead

Atualização: 2026-11-25. Branch: `fix/pipeline-board-lead-filter-20261125`.
Base: `2dc36c89b`.

## Sintoma

Depois de mover o lead para **Execução / Pedidos → Pedido confirmado**, a coluna
aparecia com **0** cards, mesmo com o card criado no banco.

## Causa

`PipelineOperacional.tsx` filtrava os cards da etapa com:

```ts
card.etapa === key && (!card.leadId || leadMap.has(card.leadId))
```

O contexto de leads só é carregado quando `needsContext` fica verdadeiro
(abrir um card, abrir entrega/suporte). Ao apenas visualizar o board,
`leadMap` está vazio, então todo card com `leadId` era escondido. O card do
lead transferido tinha `leadId`, por isso a coluna ficou zerada.

## Correção

- O board agora filtra apenas por `etapa` (`cardsForStage`).
- `leadLabel`, `responsavelLabel` e `dealTitle` continuam vindo da API de
  work-cards, então o card aparece completo antes de carregar o contexto.
- Helper extraído para `src/lib/pipeline-board.ts` e coberto por teste.

## Validação

- Card real `15b795e7-a58d-4296-b4b3-75899cbdbe8c` em
  `execucao/pedido_confirmado`, deal `423606f5-7c91-4eae-8e0c-b39897cec2c7`.
- `vitest src/lib/pipeline-board.test.ts`.
- `vite build`.
