# AB-14 — importação, compra manual e equipe

Data: 2026-11-26.

## Entregue

- Receitas: botão **Importar receita** direto na ficha técnica e no cardápio.
- Importação: respeita `?tipo=receitas|ingredientes|cardapios|briffing`.
- Ingredientes: botão **Exportar tabela** em CSV (nome, unidade, preço médio, fornecedor, categoria, código, descrição).
- Ingredientes: seleção com quantidade e **Gerar compra**, criando uma ordem de compra manual (`sugerida`) com os insumos escolhidos.
- Compras: card **Previsão de chegadas** com fornecedor, data prevista, status e quantidade pendente.
- Equipe: nova tabela `ab_equipe`, API CRUD e tela **Equipe e escala** com cargo, dias de trabalho, início, intervalo, fim e ativo.

## Fora deste lote

- O Planejamento semanal continua no módulo legado (`hotel_meal_forecasts`), que usa `hotel_recipe_cards`; ele ainda não lê os cardápios-modelo/fichas novas do A&B. A integração de hóspedes reais por período com o briffing/novo cardápio precisa de um lote próprio.
- Cotações/fornecedores do planejamento legado não foram unificados com a ordem de compra do A&B.

## Validação

- `tsc -p tsconfig.launch-ci.json --noEmit`: exit 0.
- `vite build`: exit 0.
- Migração 575 aplicada e registrada no ledger.
