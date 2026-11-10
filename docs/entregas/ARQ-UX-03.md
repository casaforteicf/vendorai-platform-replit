# ARQ-UX-03 — Inserção paramétrica, exclusão e correção de layout

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-02
**Estado:** implementado e validado tecnicamente (não homologado)

## Motivo
Desenhar no grid com o mouse ficou impreciso e frustrante. O fluxo principal passa a ser
**digitar medidas**, com o desenho como alternativa.

## Implementado
| # | Item | Como ficou |
|---|---|---|
| 1 | Excluir sólido | Botão vermelho **"Excluir sólido"** (lixeira) no inspetor, visível com sólido selecionado. Remove o sólido **e** o elemento BIM vinculado (`el_<solidoId>`); `Ctrl+Z` restaura. |
| 2 | Inserção por coordenadas | Botão **"Inserir medidas"** no rail abre modal com Nome, X/Y/Z (canto mínimo), Largura X, Altura Y, Profund. Z e presets **Parede / Laje / Pilar / Caixa**. Cria o sólido exato (8 vértices, 12 arestas, 6 faces). |
| 3 | Layout | Editor virou **grade** (`168px | 1fr | 320px`); `.arq-editor-canvas` com `overflow: hidden` — era isso que fazia o canvas WebGL **vazar sobre o inspetor**. Aba Conflitos ocupa a linha inteira via `:has()`. Abas com altura fixa e alinhamento por flex. |
| 4 | Propriedades editáveis | **Posição (X, Y, Z)** e **Escala (X, Y, Z)** em campos numéricos; commit em `Enter`/blur via `atualizar_solido` (um passo de undo por edição). |

## Novas peças
- `src/arqdor/editor/modelador/caixa.ts` — `criarCaixa` puro (valida dimensões > 0) + presets.
- `src/arqdor/editor/painel/ModalInserir.tsx` — modal com validação e presets.
- Store: `inserirCaixa` (id monotônico + histórico) e `removerSolido` (limpa seleção).

## Validação
```
tsc (4 gates) → exit 0
tests/run-all.mjs → 251 asserts, 0 falhas (+ insercao 19)
```
Navegador: modal abriu com parede 4 × 2,8 × 0,15 → **Inserir** → sólido criado em (0,0,0)
("Parede inserido em (0, 0, 0) com 4 × 2.8 × 0.15 m"), classificação imediata "Vai virar Parede";
edição de posição moveu o sólido; **Excluir sólido** removeu e avisou o undo.

## Limites
- O projeto usado no teste tem sólidos de exploração antigos — criar projeto novo para testar limpo.
- Rotação continua só pelo gizmo (não há campo de rotação digitável).
- O CSS é próprio (não Tailwind); a correção foi na folha `globals.css` do app.