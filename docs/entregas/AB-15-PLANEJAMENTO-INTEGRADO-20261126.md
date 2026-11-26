# AB-15 — planejamento integrado do restaurante

Data: 2026-11-26.

## Entregue

- Nova tela **Planejamento integrado** no lugar do planejamento legado do restaurante.
- Aplicação de hóspedes por período (data inicial/final, serviço e quantidade por dia)
  em `ab_briffing_previsoes`.
- Cálculo de necessidades usando:
  - cardápios do dia (`ab_cardapios` + itens);
  - fichas técnicas e insumos;
  - categorias/percentuais de proteína e acompanhamento;
  - padrão 300 g de proteína e 150 g de acompanhamento por adulto, editável;
  - estoque físico em `ab_estoque_insumos`.
- Tabela por insumo com **necessário, disponível e comprar**.
- Botão **Gerar ordem de compra** para as faltas, criando ordem manual `sugerida`.
- Filtro por período e atalhos para Cardápios e Compras.

## Decisão

O planejamento do restaurante deixa de usar `hotel_meal_forecasts`/`hotel_recipe_cards`.
O planejamento legado continua acessível em `/hotelaria/planejamento`, mas a rota
`/hotelaria/restaurante/planejamento` usa o A&B novo.

## Validação

- `tsc -p tsconfig.launch-ci.json --noEmit`: exit 0.
- `vite build`: exit 0.
- API e cálculos verificados em produção com cardápio, hóspedes e insumos.
