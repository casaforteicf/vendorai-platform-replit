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

## Teste controlado em produção

Ordem de teste com 1.000 g de costelas e produto temporário mapeado:

- recebimento de 400 g → ordem `parcialmente_recebida`, item com 400 g recebidos;
- recebimento de 600 g → ordem `recebida`, item com 1.000 g;
- tentativa de receber 1 g depois de fechada → HTTP 409;
- dados de teste removidos (recebimentos, ordem, item, produto e mapa).

O retorno de estoque informou “Nenhum local de estoque ativo” porque o hotel ainda
não tinha local cadastrado. Foi criado o local **Estoque Central** para o tenant
AJ.

## Insumo é o produto de estoque

No A&B o insumo é o próprio produto. A migração 574 adiciona
`ab_estoque_insumos` (saldo físico por local e insumo), aceita `insumo_id` no
recebimento e soma esses saldos no sync do motor preditivo. O caminho antigo por
`produtos_catalogo` continua válido para recebimentos legados, mas não é mais
necessário para o fluxo de restaurante.
