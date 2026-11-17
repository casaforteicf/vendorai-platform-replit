# ARQ-M1 — Materiais (catálogo, aplicação, cotação, custo)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente (tsc + 429 asserts + build) · **sem UI**

## Decisões do dono aplicadas

| # | Decisão | Efeito no código |
|---|---|---|
| 1 | Escada vira `TipoElemento` | registrado no plano; **não** implementado neste lote (é BIM, não material) |
| 2 | Preço = SINAPI + tabela própria, editável, com fluxo de cotação; Praça.ai na Fase 3 | `fontePreco: 'SINAPI' \| 'PROPRIO' \| 'COTACAO'`; `precoReferencia` separado do vigente |
| 3 | Render no worker legado | fora do M1 |
| 4 | IA pode ação destrutiva com confirmação + 1 `PassoUndo` | fora do M1 |
| 5 | Assets gratuitos (glTF) + caixas LOD | fora do M1 |
| 6 | UI começa por Materiais | contrato pronto para consumo |

## Entregas

| Arquivo | Conteúdo |
|---|---|
| `materiais/schema.ts` | `Material` (unidade, preço, fonte, referência, perda, `pbr`), `MATERIAL_INDEFINIDO`, catálogo base |
| `materiais/catalogo.ts` | consulta, inclusão, atualização de preço **imutável**, filtro por categoria |
| `materiais/aplicar.ts` | material por **elemento**, por **face**, remoção e precedência (face > elemento) |
| `materiais/cotacao.ts` | `itensDeCotacao`, `exportarParaCotacao` (CSV `;` + JSON), `importarCotacao` |
| `materiais/custos.ts` | `custoDoQuantitativo` (quantidade × preço) e `precoUnitarioDe` |

## Decisões de engenharia

**Preço vigente ≠ preço de referência.** `precoUnitario` é o que vale hoje (pode ter sido cotado);
`precoReferencia` guarda a base SINAPI/própria. Sem separar os dois, a banda de sanidade 0,5×–3× (D6)
perde a âncora no primeiro fornecedor que responder.

**`fontePreco` é rastreabilidade, não enfeite.** Sobrescrever um preço SINAPI com resposta de
fornecedor vira `COTACAO` — e o teste garante que o catálogo de entrada **não** é mutado.

**Aparência é separada de custo.** `pbr` existe só para o render; o orçamento nunca lê. É a defesa
contra "mudou a cor e o custo mudou".

**Import tolerante, falha explícita.** O parser aceita BOM do Excel, `;` ou `,`, vírgula decimal,
cabeçalho com acento/variações (`material`, `id`, `preco`, `preço`). Linha desconhecida ou preço
inválido **não** derruba a importação: entra em `ignorados` com motivo. Cabeçalho sem coluna de
preço retorna `CABECALHO_INVALIDO` em vez de aplicar zero.

**Sem preço é sinalizado, não escondido.** Linha com preço 0 marca `semPreco` e conta em
`linhasSemPreco`: total fechado escondendo item sem preço é pior que total incompleto.

## Gates

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0
node tests/run-all.mjs              → 429 asserts, 0 falhas  (389 + 40 do M1)
npx next build                      → exit 0
```

## O que o M1 NÃO fez (de propósito)

- Nenhum componente de UI: catálogo, "Enviar para Cotação" e upload ficam para a interface nova.
- Escada como `TipoElemento`: decisão registrada, implementação é BIM (próximo lote).
- Integração Praça.ai: Fase 3.
- `qtd × preço` é o custo de **material**; composição com mão de obra continua fora de escopo.
