# ARQ-PREC-06 — Núcleo de precisão (medidas, snap, métricas, offset)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-02
**Estado:** motores implementados e testados; **UI pendente de ligação e verificação**

## Contexto operacional
O servidor de desenvolvimento está **fora do ar** e o sandbox bloqueia `spawn` do Next (`EPERM`),
então nada pôde ser verificado no navegador neste turno. Para não repetir o que causou a queda
(erro de build), entreguei primeiro o que é **provável sem navegador**.

## Implementado (puro, testado)
| Item do pedido | Peça | Cobertura |
|---|---|---|
| 1. Barra de medidas | `modelador/medida.ts` — `interpretarMedida` aceita `2,8`, `2.8m`, `-1,5`, `3x4`, `3 x 4`, `2,5;4`; `formatarMedida` | 9 asserts |
| 2. Snap com cor e eixo | `snap.ts` — `COR_SNAP` (vértice verde, aresta rosa, X vermelho, Y verde, Z azul), `corDoSnap`, `ehPontoMedio`, `eixoDominante`, `travarNoEixo`, `deltaEixo` | 8 asserts |
| 4. Hover inteligente | `modelador/metricas.ts` — `metricasFace` (largura, altura, área, normal) e `metricasAresta` (comprimento, ângulo) | 6 asserts |
| 7. Offset | `modelador/offset.ts` — `offsetPoligono` com detecção de colapso por inversão de aresta | 8 asserts |
| 8. Gizmo com valores | base do readout (`deltaEixo`, `travarNoEixo`) | compartilhado |

## Defeito corrigido no caminho
`offsetPoligono` aceitava colapso: encolher 2,5 m num quadrado 4×4 "atravessava" o polígono e
devolvia um quadrado 1×1 com **área positiva**. A validação agora compara o **sentido de cada
aresta** (produto escalar com a direção original); aresta invertida ⇒ `OFFSET_COLAPSOU`.

## Validação
```
tsc (4 gates) → exit 0
tests/run-all.mjs → 313 asserts, 0 falhas (+ precisao 31)
```

## O que NÃO está pronto (declarado)
- **Ligação na UI dos 8 itens**: barra flutuante, cores do marcador por tipo, trava de eixo com
  Shift, tooltip de hover, duplo clique (repetir extrusão / editar medida), níveis de seleção,
  botão Offset e readout do gizmo **não foram ligados** na tela.
- Itens 3, 5, 6 exigem interação (duplo/triplo clique) que só dá para validar com o app rodando.
- Item 4 precisa de um tooltip DOM sobre o canvas — só testável rodando.

## Próximo passo (ordem proposta, precisa do servidor)
1. Reiniciar o dev server (`npm run dev` em `artifacts/arqdor-studio`).
2. Ligar item 1 (barra flutuante) e item 2 (cores + Shift) e verificar.
3. Ligar 4 (tooltip), 6 (níveis de seleção) e 3 (duplo clique).
4. Implementar 5 e 7 na UI (o motor de offset já existe).
5. Gizmo com readout (item 8) por último.