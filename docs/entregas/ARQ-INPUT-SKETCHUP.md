# ARQ-INPUT — Camada de interação estilo SketchUp (mouse + teclado)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** implementado · validado tecnicamente (tsc + 506 asserts + build) · **sem CSS/layout**

## 1. Seleção — a causa real do "clique não acerta"

O raycaster estava correto: `DoubleSide`, `mapaFaces` por triângulo, `getBoundingClientRect`.
O problema era **anterior** a ele:

```ts
if (modo !== 'desenho') { /* ...raycast e seleção... */ }
```

A ferramenta inicial era `'linha'` → `modo = 'desenho'` → **o bloco de seleção nunca executava**.
O usuário clicava na geometria e o app entendia "clique no plano para desenhar".

Correções:
- ferramenta inicial passa a ser **`selecionar`** (Espaço é o Select do SketchUp);
- seleção múltipla real no store: `selecionados: string[]` + `alternarSelecionado`;
- **Ctrl / Cmd / Shift** no clique adiciona ou remove da seleção; sem modificador, substitui;
- destaque na cena usa o conjunto (não só o principal);
- o **principal** (último clicado) continua alimentando gizmo e inspetor;
- excluir agora remove **toda a seleção** num único passo de undo e limpa os vínculos BIM.

Clicks 1/2/3 (face → loop → sólido) foram preservados como estavam.

## 2. Teclado — mapa pedido, em módulo puro

`input/atalhos.ts` decide; o `EditorShell` só despacha.

| Tecla | Ação |
|---|---|
| Espaço | Selecionar |
| L / R / C / A | Linha / Retângulo / Círculo / Arco |
| P | Push/Pull |
| M | Mover (gizmo) |
| Q (ou O) | Rotacionar (gizmo) |
| S | Escalar (gizmo) |
| F | Offset (abre o inspetor) |
| E | Excluir seleção |
| Ctrl+Z | Desfazer |
| Ctrl+Shift+Z | Refazer |

Regras: com Ctrl/Cmd/Alt pressionado **só** Ctrl+Z e Ctrl+Shift+Z valem (evita brigar com atalhos do
navegador); teclado é ignorado quando o foco está em `INPUT`/`TEXTAREA`/`SELECT`; Espaço dá
`preventDefault` para não rolar a página; tecla de gizmo é alternável (aperta de novo e desliga).

## 3. Inserção — a peça "aparecia longe"

A peça já nascia em (0,0,0) quando os campos eram zero; o que faltava era **a câmera saber disso**.
Agora o canvas aceita `foco: { alvo, versao }` e, ao inserir, o editor passa o **centro da peça**:
`orbitais.target` vai para o centro e a câmera reposiciona a 4,5 m de altura e 7,5 m de recuo.
Coordenadas não finitas caem em 0 (nunca geram peça em `NaN`).

## 4. Navegação — já estava, conferida

`OrbitControls.mouseButtons`: **meio = PAN**, **direito = ROTATE**, roda = zoom; menu de contexto
suprimido. Nada mudou neste lote — foi verificado no código.

## Testes

| Suíte | Asserts |
|---|---|
| `tests/input` | 26 (todos os atalhos + seleção múltipla) |

Gates: `tsc` 0 · `tsc -p tsconfig.check.json` 0 · **506 asserts** · `next build` 0.

## O que NÃO foi verificado por automação

Gestos de arrasto (PAN com botão do meio, ORBIT com direito, zoom na roda, alça do gizmo) e
modificadores no clique: a automação disponível só dispara clique simples, sem `ctrlKey`. Precisam do
seu teste manual. O clique de seleção e as teclas são verificáveis e foram exercitados.

## Risco conhecido que permanece

Duplo clique (400 ms) e a contagem de 1/2/3 cliques convivem: dois cliques rápidos selecionam o loop
antes de o duplo clique abrir a medida. Continua sendo decisão de projeto — se o loop incomodar no uso
real, o caminho é movê-lo para Alt+clique.
