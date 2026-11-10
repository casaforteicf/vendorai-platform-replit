# ARQ-UX-02 — Conversão contextual, hitbox do gizmo e estado BIM visível

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-02
**Estado:** implementado e validado tecnicamente (não homologado)

## Objetivo
Ajustes de usabilidade apontados no teste em PC real.

## Implementado
| # | Antes | Agora |
|---|---|---|
| 1 | Botão **Materializar** fixo no rail, agia em todos os sólidos | Saiu do rail. Vive no **painel de Propriedades**, só com sólido selecionado, e converte **apenas esse sólido**. O rótulo é o resultado da regra D12 (`Converter em Parede/Laje/Telhado/Mobiliário`) e o painel antecipa as medidas |
| 2 | Setas do gizmo com alvo fino e clique no vazio **desmarcava** o sólido no meio do arrasto | `TransformControls.setSize(0.9 → 1.5)` e, com o gizmo ativo, clique no vazio **não desmarca** mais — era isso que fazia o arrasto "não segurar" |
| 3 | Sólido convertido continuava verde, indistinguível de desenho solto | Sólido convertido renderiza em **azul BIM** (`#2f6fd0`, selecionado `#7cb3ff`) e o painel mostra o selo `BIM · <tipo>` |

## Correção de domínio encontrada no caminho
Face solta (sem volume) virava **laje com espessura 0,00 m** — volume zero no orçamento.
Agora cai no padrão construtivo `0,12 m` quando o parâmetro não é informado (`PADROES_MATERIALIZACAO.espessuraLajePadraoM`), com teste próprio.

## Validação
```
tsc -p tsconfig.json / contracts / contracts-tests / check  → exit 0
node tests/run-all.mjs → 190 asserts, 0 falhas (materialização: 28)
```
Verificado no navegador: sólido 6 desenhado → push/pull 2,8 m → painel "Vai virar Parede · 1,45 m × 2,80 m · 0,40 m" → **Converter em Parede** → sólido azul, selo `BIM · Parede`, status "8 elemento(s)".
Gizmo: setas com o dobro do alcance visual; clique ao lado da seta mantém a seleção.

## Pendência herdada
O E2E do arrasto (`tests/gizmo/e2e-drag.mjs`) segue **não executado** neste ambiente (sandbox bloqueia o canal mojo do navegador). A hipótese do "clique não segura" foi tratada por análise e correção de comportamento, mas **continua sem validação automatizada**.