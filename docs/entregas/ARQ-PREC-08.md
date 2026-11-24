# ARQ-PREC-08 — Tooltip de hover e seleção inteligente (lote 2)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-02
**Estado:** implementado e verificado no navegador

## Entregue
| Item | Implementação | Verificação |
|---|---|---|
| **Tooltip de face** | no `pointermove`, raycast no mesh → pontos da face → `metricasFace` → dica `L × A m · área m²`, posicionada perto do cursor e **limitada dentro do canvas** | **verificado**: dica exibiu `4.00 × 2.80 m · 11.20 m²` |
| **Tooltip de aresta** | quando o hover cai numa aresta (`snap.tipo = aresta_ponto`), lookup da aresta no sólido → `metricasAresta` → `comprimento m · ângulo°` | implementado; não verificado (depende de pairar sobre a aresta) |
| **Seleção inteligente** | contador de cliques por alvo (janela de 450 ms): 1 = face/aresta, 2 = **loop** (contorno da face via `loopDaFace`/`loopDeAresta`), 3 = **sólido** | **verificado** no nível face: barra de status mostrou `nível: face` e `Face selecionada` |
| **Loop de arestas** | `modelador/loop.ts` — `loopDaFace`, `loopDeAresta`, `facesDaAresta` | 7 asserts |

## Correção feita durante a verificação
Primeira versão da dica **cortava a área** na borda direita do canvas (`white-space: nowrap`). Agora a
posição é limitada ao viewport (`Math.min(desejado, largura - offsetWidth - 8)`), então `11.20 m²` aparece.

## Validação
```
tsc -p tsconfig.json / tsconfig.check → exit 0
tests/run-all.mjs → 320 asserts, 0 falhas (+ loop 7)
```

## Pendente (lotes 3 e 4)
- Duplo clique para alterar a medida da face (item 5 do pedido original).
- Ferramenta **Offset** na UI (motor pronto em `modelador/offset.ts`).
- Readout do gizmo ao arrastar (item 8).
- Destaque visual do loop/face na cena (hoje a seleção aparece na barra de status e no inspetor,
  não como overlay colorido no mesh).