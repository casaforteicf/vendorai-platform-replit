# AB-17 — Briffing com seleção de insumos e compra

Data: 2026-11-26.

## Entregue

- Briffing consolidado agora tem checkbox por insumo, **Selecionar todos**, **Gerar cotação** e **Compra direta**.
- A compra usa a quantidade calculada de cada item selecionado e agrupa vários itens na mesma cotação/ordem.
- Só insumos com ID de catálogo são compráveis; itens livres aparecem desabilitados.
- Ocupação: link **Importar ocupação/API** leva à importação de briffing (`tipo=briffing`), além da edição por data/serviço já existente.
- Ocupação continua salvando por data e serviço e alimentando o briffing.

## Validação

- `tsc -p tsconfig.launch-ci.json --noEmit`: exit 0.
- `vite build`: exit 0.
