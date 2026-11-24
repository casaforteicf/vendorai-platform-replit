# ARQ-BLOCO4 — Layout de imersão + telhado (2 águas) e escada (reta)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente (tsc + 357 asserts + build) · layout conferido no navegador

## Parte A — Layout de imersão

| Regra pedida | Entrega |
|---|---|
| sidebar some no editor, vira botão de menu | `AppShell imersivo` não renderiza `Sidebar`; a topbar ganha hambúrguer (`/` = dashboard) e perde o campo de busca |
| canvas 100% da tela | `.arq-app-imersivo` colapsa a grade para uma coluna; `.arq-content-imersivo` sem padding e com overflow escondido |
| barra vertical fina só com ícones | rail de 56 px com 40×40 por ferramenta; rótulo só em `title`/`aria-label` |
| 11 ícones pedidos | Selecionar, Linha, Retângulo, Círculo, Arco, Push/Pull, Mover, Rotacionar, Escalar, Offset, Excluir (+ inserir/novo/desfazer/refazer, separados por linhas) |
| inspetor compacto, inteligente e colapsável | sem seleção mostra **só Camadas**; com seleção mostra Propriedades/Booleanas/BIM/Vãos; botão de lista na toolbar colapsa (`data-aside="fechado"` → coluna vai a 0) |
| navegação SketchUp | entregue no lote anterior (meio = PAN, direito = ORBIT, roda = ZOOM, menu de contexto suprimido) |

Novo ícone `offset` (retângulo com contorno interno) adicionado ao conjunto inline.

## Parte B — Bloco 4: motores

### `modelador/telhado.ts` — duas águas
Base retangular no plano X/Z, cumeeira paralela a X no meio de Z, duas águas, duas empenas e base.
Beiral expande a base sem mudar a altura. **6 vértices · 9 arestas · 5 faces**, sólido fechado.

### `modelador/escada.ts` — escada reta
Perfil de degraus (espelho + piso) extrudado na largura. Espelho padrão 18 cm quando o número de
degraus não é informado. **2 vértices por ponto do perfil**, malha fechada.

### `modelador/orientacao.ts` — winding garantido
`volumeAssinado` (divergência) + `orientarParaFora` + `malhaFechada`.

**Defeito encontrado pelos testes:** a primeira versão invertia "todas as faces se o volume fosse
negativo" — o que só corrige o sinal global. Com uma face torta, o volume saía menor que o real:
telhado com beiral dava **58,33 m³ em vez de 63**. A escada dava **1/3** do volume (2,221 em vez de
6,664). Correção: coerência propagada pela **topologia** (faces vizinhas percorrem a aresta
compartilhada em sentidos opostos) e só no fim o sinal global pelo volume. Depois: 48 / 63 / 6,664 exatos.

## UI

`ModalInserir` ganhou os presets **Telhado 2 águas** (X = cumeeira, Z = vão, Y = altura) e
**Escada reta** (X = largura, Y = altura a vencer, Z = piso do degrau), com legenda explicando os
três campos. `useModeladorStore` ganhou `inserirTelhado`/`inserirEscada`, espelhando `inserirCaixa`
(um passo de undo por inserção).

## Gates

```
npx tsc -p tsconfig.json --noEmit   → exit 0
npx tsc -p tsconfig.check.json      → exit 0
node tests/run-all.mjs              → 357 asserts, 0 falhas  (340 + 17 do Bloco 4)
npx next build                      → exit 0  (/modelagem 179 kB)
```

## Validação em navegador

- Layout imersivo conferido em `:5183`: sem sidebar, hambúrguer presente, rail de ícones à esquerda,
  canvas full-bleed, inspetor à direita mostrando **apenas Camadas** sem seleção.
- Inserção de telhado/escada **não** foi exercitada no navegador (a verificação foi pelos testes puros
  e pelo build). O gesto e a forma final ficam para o seu teste.

## Incidente operacional (registrado)

Rodar `next build` com o `next dev` no ar corrompeu o `.next` (`Cannot find module './431.js'`).
Recuperação: parar o dev, remover `.next`, subir de novo. Fica a regra: **não rodar build com dev ativo**
no mesmo diretório.

## Pendências

1. Teste humano: inserir telhado e escada, conferir formas e dimensões.
2. Contraste dos ícones desabilitados no rail pode subir um pouco (hoje 0,4 de opacidade).
3. Promoção para produção (push em `main`) segue não executada.
