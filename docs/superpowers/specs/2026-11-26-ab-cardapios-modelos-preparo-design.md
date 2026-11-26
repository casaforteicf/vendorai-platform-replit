# A&B — modelos de cardápio, escala e modo de preparo

Data: 2026-11-26.

## Objetivo

Permitir que o restaurante monte cardápios reutilizáveis, agende-os por data e
por grade semanal, e calcule a produção com adultos e crianças separados e
rateio de proteína/acompanhamento. A ficha técnica passa a guardar o modo de
preparo.

## Modelo de dados

- `ab_fichas_tecnicas.modo_preparo` (texto livre).
- `ab_cardapio_modelos` (nome, serviço fixo, ativo).
- `ab_cardapio_modelo_itens` (ficha, categoria, percentual de rateio).
- `ab_cardapio_grade` (dia da semana + serviço → modelo).
- `ab_cardapios.modelo_id` (snapshot diário opcional).
- `ab_cardapio_itens.categoria`, `percentual_rateio`, `modelo_item_id`.

O cardápio diário é uma cópia dos itens do modelo. Alterar o modelo não altera
dias já gerados; o dia pode sobrescrever categoria/percentual.

## Regras de cálculo

- 300 g de proteína e 150 g de acompanhamento por adulto (editáveis).
- Percentual por prato em cada grupo; soma 100%.
- Referência de gramas = maior ingrediente da ficha em g/ml.
- Fator do prato = gramas-alvo / referência.
- Crianças: 7–12 = 50%, 0–6 = 30%.
- Hóspedes equivalentes = adultos + crianças ponderadas.
- Pratos “Outro” usam 1 porção da ficha.

## Importação

- O parser captura o bloco “Modo de preparo” e salva na ficha.
- O preview permite editar o texto antes de confirmar.
- CSV/JSON aceitam `modo_preparo`.
- Quantidades importadas são da receita inteira e são divididas pelo rendimento.

## Telas

- Ficha técnica: campo e exibição do modo de preparo.
- Cardápios: categoria/percentual no dia e link para modelos/grade.
- Modelos e grade: CRUD, regra semanal e geração dos próximos 30 dias.
- Briffing: adultos, crianças 7–12, crianças 0–6, padrões 300/150 e rateio.
