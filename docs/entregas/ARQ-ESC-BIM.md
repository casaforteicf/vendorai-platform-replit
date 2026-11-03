# ARQ-ESC — Escada como `TipoElemento` (BIM Core)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente (tsc + 447 asserts + build) · **sem UI**

## Decisão aplicada

Decisão 1 do dono (2026-11-03): **escada vira `TipoElemento`**, entra no quantitativo e na planta 2D.
A geometria sólida da escada já existia (`modelador/escada.ts`, Bloco 4); o que faltava era o
**elemento BIM** — sem ele a escada não era medida nem orçada.

## Entregas

| Arquivo | Mudança |
|---|---|
| `bim/schema.ts` | `TipoElemento` += `'escada'`; `GeometriaEscada` + inclusão na união `Geometria` |
| `orcamento/quantitativos.ts` | `categoriaDe('escada') = 'estrutura'`; medição da escada (m², m³, un, m) |
| `bim/derivar2d.ts` | `TipoLinha2D` += `'escada'`; `derivarEscada` (contorno + linha por degrau) |
| `viewport2d/Viewport2D.tsx` | cor do tipo (exigência do `Record<TipoLinha2D, string>`) |
| `tests/escada/check.ts` | 18 asserts de quantitativo, orçamento, planta 2D e dados inválidos |

## Geometria contratada

```ts
interface GeometriaEscada {
  posicao: [number, number];   // canto mínimo da projeção em planta
  largura: number;             // X
  comprimento: number;         // Y em planta = soma dos pisos (projeção horizontal)
  alturaTotal: number;         // soma dos espelhos
  numeroDegraus: number;
}
```

## Medição e a decisão que mais importa

Concreto **não** usa a caixa envolvente. Usa o prisma de degraus — o mesmo volume do sólido do
modelador:

```
volume = largura × piso × espelho × n(n + 1) / 2      (piso = comprimento/n, espelho = alturaTotal/n)
```

Para a escada de referência (1 m · 4,48 m · 2,8 m · 16 degraus) isso dá **6,664 m³**; a caixa
envolvente daria **12,54 m³** — quase o dobro, e é o erro clássico de orçamento de escada.
O teste trava a diferença (`concreto < caixa envolvente`).

| Unidade | O que representa | Perda |
|---|---|---|
| m² | área ocupada em planta | 1,03 (estrutura) |
| m³ | concreto do prisma de degraus | 1,03 |
| un | número de degraus | **1,00** |
| m | soma dos espelhos (2,80 m) | 1,03 |

## Defeito corrigido de passagem

`quantitativos()` aplicava coeficiente de perda em **todas** as unidades, inclusive `un`. Ninguém
compra 1,03 porta. Agora `un` é contagem pura (coeficiente 1) e o campo `coeficientePerda` registra
o valor realmente aplicado. Nenhuma suíte existente quebrou — o comportamento antigo não estava
coberto por teste, o que é a própria evidência de que era um furo.

## Planta 2D

Retângulo da projeção (4 linhas) + **uma linha tracejada por degrau** (n − 1 = 15), com `tipo`
próprio `'escada'`. É a convenção de planta baixa: projeta-se o piso ocupado e marcam-se os degraus;
o desenvolvimento inclinado não entra em planta.

## Gates

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0
node tests/run-all.mjs              → 447 asserts, 0 falhas  (429 + 18)
npx next build                       → exit 0
```

## O que NÃO foi feito (de propósito)

- **Materialização sólido → elemento BIM**: `classificarSolido` ainda não reconhece uma escada a
  partir do sólido. Hoje o elemento de escada é construído com os parâmetros (`GeometriaEscada`),
  não por classificação automática. Reconhecer a escada pelo perfil de degraus é trabalho separado
  e precisa de decisão de produto (tolerância de detecção).
- Nenhuma UI: seleção, edição e criação de escada na interface ficam para a tela nova.
