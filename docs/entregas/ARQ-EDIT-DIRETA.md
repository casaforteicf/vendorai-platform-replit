# ARQ-EDIT-DIRETA — Coordenadas múltiplas + grips de edição

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente (tsc + 518 asserts + build) · **UAT 1 validado no navegador**

## 1. Input de coordenadas múltiplas

`interpretarMedida` ganhou o formato de **três valores** — `largura; profundidade; altura` — sem
quebrar o de dois (`3x4`, `3;4`) nem o escalar.

Com a ferramenta **Retângulo**, `4;2,8;2` cria a **caixa** `4 (X) × 2,8 (Z) × 2 (Y)`:

- âncora = primeiro ponto clicado no plano; **sem clique, cria em (0,0,0)**;
- três medidas `<= 0` são recusadas com mensagem;
- a câmera enquadra o centro da peça (o `foco` do lote de input);
- um passo de undo por criação.

> Decisão: três valores na ferramenta Retângulo criam **volume**, não face. Um retângulo desenhado
> sobre um sólido continua sendo face (fluxo de desenho); o trio é o atalho de "criar já com altura".

## 2. Grips de edição

`modelador/grip.ts` (puro): `centroNormalDaFace(solido, faceId)` → centro + normal (Newell).

No canvas, o grip é um **losango vermelho** (octaedro) posicionado no centro da face selecionada.
Ele fica **fora do grupo de sólidos** de propósito: clicar no grip estica, não seleciona.

Fluxo:
1. `pointerdown` no grip → captura o ponteiro, desliga a órbita;
2. `pointermove` → projeta o raio no plano da face e mede o deslocamento **ao longo da normal**;
   o losango acompanha o mouse e a HUD mostra `Esticar · 2,35 m` em tempo real;
3. `pointerup` → aplica **um** Push/Pull com o delta total (um passo de undo), sincroniza o
   elemento BIM (`aplicarGeometria`) e limpa a face.

**Limite declarado do MVP:** a geometria é confirmada no **soltar**; durante o arrasto o que é
tempo real são o grip e a medida. Fazer a malha mudar a cada frame exigiria preview de estado
fora do histórico — fica para a próxima iteração, e está registrado como decisão, não como esquecimento.

## 3. UAT

| Passo | Resultado |
|---|---|
| `R` + digitar `4;2,8;2` + Enter | **"Caixa 4 × 2.8 × 2 m criada em (0, 0, 0)."** |
| Inspetor | Nome "Caixa" · 8 vértices · 12 arestas · 6 faces |
| Prévia BIM | "Vai virar Mobiliário **4,00 m × 2,80 m × 2,00 m**" |
| Clicar numa face | nível: face · **grip vermelho visível no centro da face** |

Não verificável por automação: **arrastar o grip** (exige ponteiro pressionado e movimento). O teste
deve ser manual: selecionar face → arrastar o losango → soltar → conferir a medida no inspetor.

## 4. Testes

`tests/precisao` 51 → **63 asserts** (trio de medidas, regressão do par, inválidos, centro/normal do grip).

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0
node tests/run-all.mjs              → 518 asserts, 0 falhas
npx next build                       → exit 0
```

## Observação

O `next dev` ficou **rodando** na 5183 para o seu F5. Não rode `next build` com ele ativo — corrompe
o `.next` (já aconteceu uma vez neste repositório).
