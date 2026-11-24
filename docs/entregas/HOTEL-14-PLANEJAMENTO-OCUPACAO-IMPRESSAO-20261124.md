# HOTEL-14 — kg/L, cardápio gera fichas, ocupação por data e impressão do briffing

Atualização: 2026-11-24. Branch: `feat/hotel-ops-20261124`.
Base: `d545db4a8`.

## 1. Unidade kg/L no ingrediente

- O formulário de **Ingredientes** agora aceita `g`, `kg`, `ml`, `L` e `un`.
- O catálogo continua na unidade base (`g`/`ml`/`un`): ao salvar em kg/L, a
  quantidade e o preço são convertidos (÷ 1.000) para g/ml, mantendo o motor de
  briffing consistente.
- A importação de ingredientes também aceita kg/L e converte o preço para a
  unidade base (ex.: Leite `L` a R$ 4,50 → `ml` a R$ 0,0045).

## 2. Importar cardápio e gerar as receitas

A central de importação ganhou a opção **“Criar ficha técnica para receitas que
ainda não existem (sem ingredientes, para completar depois)”**, marcada por
padrão no tipo **Cardápios**.

- Ao confirmar um cardápio, cada receita sem ficha é criada como ficha técnica
  vazia (rendimento 1), vinculada ao cardápio.
- O retorno mostra `fichasCriadas`.
- A ficha nasce sem insumos: é preciso completá-la em **Receitas** para o
  briffing gerar demanda. Sem isso o relatório avisa “fichas sem ingredientes”.

## 3. Ocupação por data e refeição

Nova tela **`/hotelaria/restaurante/ocupacao`** (aba **Ocupação** no
Restaurante):

- Período de 7 dias a partir da data escolhida.
- Grade por dia com **Café da manhã, Almoço e Jantar** (hóspedes).
- Salvar dia ou salvar o período.
- Zero remove a previsão daquele serviço; valores positivos fazem upsert.
- Cada linha tem atalho para o relatório do dia.
- Usa `ab_briffing_previsoes` (migration 570), a mesma previsão que a tela de
  Briffing consome.

API complementar: `GET .../ab/briffing/previsoes?de=&ate=` e
`DELETE .../ab/briffing/previsoes/:id`.

## 4. Impressão do briffing com cardápio e demandas por turno

Nova página **`/hotelaria/restaurante/briffing/imprimir?data=aaaa-mm-dd`**:

- Busca a ocupação do dia, os cardápios e as fichas.
- Para cada turno (café/almoço/jantar/outro):
  - mostra a ocupação e o evento;
  - lista o cardápio e as porções por hóspede;
  - calcula e imprime a **demanda consolidada de insumos do turno**
    (quantidade base/kg/L).
- Layout limpo para impressão, com quebra de página por turno, botão
  **Imprimir / Salvar PDF** e rodapé de geração.
- A tela de Briffing e a de Ocupação têm atalhos para esse relatório.

## Validação

- `vitest restaurante-importacao`: **10/10** (kg/L convertido, briffing CSV/texto).
- `tsc` API: exit 0; `build.mjs`: exit 0; `vite build`: exit 0.
- Teste de integração no tenant CasaForteICF com banco de produção:
  - importar Leite em L → `ml`/`0.0045` e confirmar 1 criado;
  - importar cardápio com receita nova e `criarFichasFaltantes` → 1 cardápio +
    **1 ficha criada**;
  - `PUT` ocupação 100 → `GET` por intervalo → `DELETE` 204 → 0.
  - Todos os registros de teste removidos.

## Limite

A ficha criada pelo cardápio nasce **sem ingredientes**; o relatório só terá
demanda depois de completá-la. Não há geração automática de ingredientes a
partir do texto do cardápio.

## Estado

Implementado e validado tecnicamente. Sem merge/deploy automático.
