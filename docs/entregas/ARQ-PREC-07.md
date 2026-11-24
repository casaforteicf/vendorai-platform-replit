# ARQ-PREC-07 — Barra de medidas e snap visual na UI (lote 1 de 6)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-02
**Estado:** itens 1 e 2 ligados; verificação parcial no navegador

## Entregue
| Item | Implementação | Verificação |
|---|---|---|
| **1. Barra de medidas** | `painel/BarraMedidas.tsx` flutua no canto inferior direito do viewport; aceita `2,8`, `2.8m`, `3x4`; Enter aplica; digitar número em qualquer lugar foca a barra; Esc limpa | **verificado**: com face selecionada no Push/Pull, digitei `2,8` + Enter → `Push/Pull de 2.8 m aplicado em "Parede"` (sólido foi de 8 para 12 vértices) |
| **2. Snap visual + trava** | cor por tipo (`corDoSnap`: vértice verde, aresta rosa, X vermelho, Y verde, Z azul); **Shift** trava no eixo dominante a partir do último clique (`eixoDominante` + `travarNoEixo`); marcador muda de cor e ganha halo | implementado e tipado; **não confirmado visualmente** (a automação só clica, não paira o mouse) |

## Fluxo do retângulo por medida (implementado, não testado)
Com a ferramenta Retângulo e o primeiro canto já clicado, digitar `3x4` na barra cria o
retângulo de 3 × 4 m a partir daquele canto.

## Validação
```
tsc -p tsconfig.json → exit 0 · tsconfig.check → exit 0
tests/run-all.mjs → 313 asserts, 0 falhas
```

## Pendente (lotes seguintes)
3. Tooltip de hover (medidas/área) · 4. Seleção inteligente (face/loop/sólido) ·
5. Duplo clique para alterar medida · 6. Ferramenta Offset na UI · 7. Readout do gizmo.
O motor dos quatro já existe e está testado (`metricas.ts`, `offset.ts`, `medida.ts`).