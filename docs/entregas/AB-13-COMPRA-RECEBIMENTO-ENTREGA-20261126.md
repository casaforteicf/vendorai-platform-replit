# AB-13 — ordem de compra ligada ao recebimento e entrega

Data: 2026-11-26.

## Objetivo

Fechar o ciclo: requisição/estoque preditivo → ordem de compra → pedido pendente de
entrega → recebimento por lote → baixa da pendência.

## Entregue

- `ab_ordens_compra.fornecedor` e `data_entrega_prevista`.
- Status novos: `pendente_entrega` e `parcialmente_recebida`; `enviada` migrado.
- `ab_ordem_compra_itens.quantidade_recebida` com limite `0 <= recebido <= quantidade`.
- `ab_recebimentos.ordem_id` e `ordem_item_id`, com FKs e índices.
- Recebimento pode ser vinculado a uma ordem/item; quantidade não pode passar do pendente.
- Recebimento aprovado soma a quantidade recebida e atualiza a ordem:
  - falta receber → `parcialmente_recebida`;
  - tudo recebido → `recebida`;
  - bloqueado não soma.
- API `GET /ab/recebimentos/pendentes` lista pedidos/itens em aberto e o produto mapeado.
- Tela de recebimento carrega catálogo real e pedidos pendentes.
- Tela de ordens mostra recebido/pendente, fornecedor, entrega prevista e link para receber.
- “Marcar recebida” manual foi removido do fluxo; a API recusa receber com pendência.

## Validação

- `vitest ordens-compra`: 6/6.
- `vitest Recebimento.test.tsx`: 8/8.
- `tsc -p tsconfig.launch-ci.json --noEmit`: exit 0.
- `vite build`: exit 0.
