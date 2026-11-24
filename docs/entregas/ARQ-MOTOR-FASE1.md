# ARQ-MOTOR-FASE1 — gizmo, offset, corte de vão e roteamento MEP

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente (tsc + 389 asserts + build) · **sem alteração de UI**

## Escopo desta entrega

Só motor. Nenhum componente visual foi tocado (decisão do solicitante: a UI será refeita com o DeepSeek).

| # | Item | Entrega | Arquivo |
|---|---|---|---|
| 1 | Gizmo | rotação composta em quatérnion + entrada "rotação alvo" | `modelador/gizmo-math.ts`, `modelador/gizmo.ts` |
| 2 | Offset | já generalizado; agora provado em horizontal, vertical e 45° | `modelador/offset.ts` |
| 3 | Corte de vão | booleana de malha: parede atravessada deixa de ser caixa | `modelador/vao-booleano.ts` |
| 4 | MEP | A* 2D por camada com custo de curva e obstáculos | `mep/roteador.ts` |

## 1. Gizmo — o que estava errado

`somar ângulos de Euler` (`rotacao + delta`) só funciona com UM eixo. Com dois, o sólido "escapa" da
seta: Y=90° seguido de X=90° não é `(90,90,0)`.

Correção:
- `eulerParaQuaternion` / `quaternionParaEuler` (XYZ) com round-trip;
- `comporRotacao(atual, delta)` = **q_delta · q_atual** (delta aplicado depois);
- `gerarOpRotacionar` passou a compor em vez de somar;
- `gerarOpRotacionarPara(solido, rotacaoAlvo)` calcula `q_delta = q_alvo · q_atual⁻¹` — é a porta
  correta para o TransformControls, que entrega rotação absoluta, não delta.

**Bug pego pelo teste:** a primeira versão usava `q_atual · q_delta` (aplicava o delta *antes*) e a
segunda usava `q_atual⁻¹ · q_alvo`. As duas faziam o segundo arrasto aterrissar fora do alvo.

> Nota de integração: o `EditorShell` atual ainda passa **diferença de Euler** para `gerarOpRotacionar`.
> O motor está correto para um delta de verdade; ao refazer a UI, usar `gerarOpRotacionarPara`.

## 2. Offset — qualquer plano

`offsetDaFace` monta a base ortonormal da face (normal de Newell, `u` = 1ª aresta, `v` = n × u),
projeta, roda `offsetPoligono` e devolve 3D. Provado agora em três casos:

| Face | Resultado |
|---|---|
| horizontal 4 × 4 | área interna **13,69 m²** |
| vertical 4 × 2,8 (z = 0) | área **9,25 m²**, todos os vértices em z = 0 |
| inclinada 45° (y = z) | área **0,64 m²**, vértices mantêm y = z |

## 3. Corte de vão — booleana de malha

`cortarVao(parede, {offset, largura, altura, peitoril})`:
- as duas faces da parede viram **anéis de 4 quads**;
- o furo ganha **4 revelos** (peitoril, verga, duas ombreiras);
- casca externa remanescente fecha o sólido.

**16 vértices · 16 faces · malha fechada**, com volume exato:

| Caso | Volume |
|---|---|
| parede 4 × 2,8 × 0,15 | 1,68 m³ |
| porta 0,9 × 2,1 | **1,3965 m³** |
| janela 0,9 × 1,2 com peitoril 1 m | **1,518 m³** |
| vão fora da parede | `VAO_FORA_DA_PAREDE` |

> Tensão arquitetural registrada: a **ADR-001** decidiu que o furo de vão é *abertura paramétrica*
> (`GeometriaParede.aberturas[]`), não booleana. Este módulo é o cortador de **malha**; não foi ligado
> ao BIM nem substitui `esquadrias.abrirVao`. A escolha de qual usar na UI nova é decisão do dono.

## 4. MEP — roteamento

`rotearTubo({de, para, diametroMm, camada, opcoes, obstaculos?})`, contrato `RoteadorTubo` do schema:
- A* com **direção no estado** (sem isso o custo de curva não funciona e a rota sai em escadinha);
- plano de corte fixo (`alturaPlanoM`): sobe da origem, corre no plano, desce no destino;
- caixa de busca cresce até cobrir os obstáculos (senão o contorno cai fora da grade → "sem rota");
- `maxCelulas` estourado devolve `null`; waypoints colineares são removidos.

| Caso | Resultado |
|---|---|
| reta 0→4 m | comprimento **4 m**, tudo no plano |
| L (4 m + 3 m) | comprimento **7 m**, ≤ 4 waypoints |
| obstáculo no meio | desvia e chega, custo > 4 m |
| `maxCelulas: 5` | `null` |

## Gates

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0
node tests/run-all.mjs              → 389 asserts, 0 falhas  (357 + 32 novos)
npx next build                      → exit 0  (/modelagem 179 kB)
```

## Observações

- `next dev` foi parado antes do build (rodar build com dev ativo corrompe `.next`). O servidor
  **não** foi religado ao fim deste lote.
- Nada foi ligado à UI/store além do motor: `cortarVao` e `rotearTubo` ainda não têm chamador.
