# ARQ-LAYOUT-01 — Casca rígida e limpeza de elementos soltos

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-02
**Estado:** implementado e validado tecnicamente (não homologado, não publicado)

## Objetivo
Transformar a casca em três regiões rígidas — (A) sidebar escura, (B) header sobre o conteúdo, (C) conteúdo — e eliminar textos/elementos soltos (ex.: aviso "Ponto 1 registrado" flutuando).

## Escopo autorizado
- Grade fixa do App Shell; header em Flexbox com busca, projeto ativo e ações (Salvar).
- Dashboard limpo: fundo claro, "Novo projeto" verde no topo direito, grade de cards.
- Remover qualquer texto ou div fora da estrutura.

## Implementado
| Item | Detalhe |
|---|---|
| Grade da casca | `.arq-app` = `grid-template-columns: 240px minmax(0,1fr)`; altura `100vh`, `overflow: hidden` |
| Coluna direita | `.arq-content-area` = `grid-template-rows: 64px minmax(0,1fr)`; conteúdo em `.arq-content` (scroll próprio) |
| Sidebar | altura fixa de viewport, rolagem própria, densidade reduzida para caber 800 px |
| Header | Flexbox: busca (flex 1, máx. 520 px), seletor de projeto, slot `acoes`, chip Salvo, ícones, avatar |
| Ações do header | novo slot `acoes` no `Topbar`; o editor injeta o botão **Salvar** (grava na hora, via `salvarProjeto`) |
| Editor | `.arq-editor-page` (toolbar → corpo → status). O aviso saiu do meio da tela e passou a viver na **barra de status** |
| Dashboard | título/subtítulo em uma linha (ellipsis), abas em uma linha, Filtros/ordenação alinhados à direita |
| Coluna direita | 340 px → 300 px para devolver largura à grade |

## Arquivos
- `src/app/globals.css` (seções v2/v3/v4)
- `src/arqdor/editor/shell/AppShell.tsx`, `Topbar.tsx`
- `src/arqdor/editor/EditorShell.tsx`
- `src/app/page.tsx`

## Validação (evidência)
```
tsc -p tsconfig.json               → exit 0
tsc -p tsconfig.contracts.json     → exit 0
tsc -p tsconfig.contracts-tests.json → exit 0
tsc -p tsconfig.check.json         → exit 0
node tests/run-all.mjs             → 162 asserts, 0 falhas (29+23+28+16+19+26+21)
```
Verificação visual em `http://127.0.0.1:5180` (dashboard e modelagem) — capturas no relatório do lote.

## Pendências / próximos passos
- Homologação na Contabo e promoção permanecem fora deste lote.
- Ambientes Materiais, Render, Especificações, Orçamento e Entrega continuam desabilitados (sem backend).
- Capas dos cards seguem como placeholder até existirem imagens reais.