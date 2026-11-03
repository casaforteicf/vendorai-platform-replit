# ARQ-M2 — Biblioteca de Interiores (famílias, colocação, vínculo, quantitativo)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente (tsc + 480 asserts + build) · **sem UI**

## Entregas

| Arquivo | Conteúdo |
|---|---|
| `biblioteca/familias.ts` | `FamiliaMovel` (categoria, dimensões, LOD, material padrão, tags), catálogo de 6 famílias, busca/filtro |
| `biblioteca/colocar.ts` | `colocarFamilia` (sólido + elemento BIM), `desvincularSolido`, `vincularSolido`, `temVinculo`, `familiaDoElemento` |
| `biblioteca/quantitativo.ts` | `quantitativoMoveis` (sempre `un`, agrupado por família), `totalMoveis` |
| `bim/schema.ts` | `GeometriaMobiliario.familiaId?` — rastreia a família de origem |
| `tests/biblioteca/check.ts` | 33 asserts (catálogo, colocação, ADR-003, quantitativo, orçamento) |

## Decisões de engenharia

**Família ≠ móvel paramétrico.** `moveis/schema.ts` (painéis, ferragens, diagnóstico) continua sendo o
modelador de marcenaria. A biblioteca é catálogo: identidade estável + dimensões + LOD. Colocar uma
família gera um sólido simples (caixa) e um `ElementoBim` de mobiliário — não um móvel paramétrico.

**ADR-003 respeitada e testada.** O vínculo `modeladorSolidoId` é opcional. O teste desvincula e
confirma que o elemento **permanece desenhável** pelas próprias `dimensoes`/`posicao`; refazer o
vínculo também é testado. Nada de FK rígida — orçamento e render não perdem o móvel quando o sólido
some.

**LOD por custo, não por estética.** `lod.simples = 'caixa'` é o que o viewport desenha; `detalhado`
(assetId no R2) só entra no render. O catálogo inicial não traz asset detalhado — coerente com a
decisão de começar com glTF gratuito e caixas primitivas.

**Móvel nunca é medido por área.** `quantitativoMoveis` devolve `unidade: 'un'` sempre, agrupado por
família ("6 cadeiras de jantar"), que é a lista de compras — não o orçamento de material.
Móvel colocado à mão (sem `familiaId`) cai em `FAMILIA-INDEFINIDA`: não desaparece do quantitativo.

**Perda não se aplica a móvel.** Cada elemento entra como 1 `un` com coeficiente 1 (correção feita no
lote da escada). O teste trava isso.

## Gates

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0
node tests/run-all.mjs              → 480 asserts, 0 falhas  (447 + 33)
npx next build                       → exit 0
```

## O que NÃO foi feito (de propósito)

- **UI**: seleção de família, preview e colocação por arrasto ficam para a tela nova.
- **Assets detalhados**: `lod.detalhado` existe no contrato, mas nenhuma família aponta para asset
  ainda (decisão: glTF gratuito depois; compra fora de escopo).
- **Material padrão**: nenhuma família do catálogo traz `materialPadraoId` — o catálogo de materiais
  (M1) não tem mobiliário. Consequência visível e correta: móvel entra no custo como "sem preço"
  sinalizado, não como zero silencioso.
- **Vínculo com móvel paramétrico**: colocar família cria caixa; converter em marcenaria é fluxo
  separado (modelador de móveis).
