# ARQ-UX-05 — Pele premium v6 no editor (skin escuro, sem Tailwind)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-03
**Estado:** **implementado · validado tecnicamente · homologado visualmente pelo solicitante** · não promovido a produção

## Itens

| # | Pedido | Situação real | Ação |
|---|---|---|---|
| 1 | aplicar o visual do DeepSeek (sidebar escura, topbar verde, inspetor premium) | desenho entregue em Tailwind puro; o app **não tem Tailwind** (sem dependência, sem config, sem `@tailwind`) e o arquivo exportava `default` enquanto o consumidor importa `{ EditorShell }` (TS2614) | peau **portada** para o sistema `arq-*` existente, escopada ao editor. Nenhuma linha de lógica tocada |
| 2 | manter canvas, ferramentas, painéis e autosave intactos | `EditorShell` é o orquestrador (stores, canvas WebGL, BIM, autosave, atalhos) | colar o arquivo do design mataria a página; ele foi **recusado como substituição** e usado como referência visual |
| 3 | rodar `tsc --noEmit` e preservar os 320 testes | baseline 320/320 em 16 suítes | mantido 320/320; `tsc` exit 0 |
| 4 | build de produção | — | `next build` **exit 0**, 9 rotas, `/modelagem` 175 kB |

## O que foi feito

- Tokens **aditivos** (`--arq-ed-base/painel/vazio/tinta/suave/linha`); nenhum token existente alterado.
- Skin escopada por `.arq-content:has(.arq-editor-page)` — dashboard e orçamento seguem claros.
- Abas com indicador mint, rail escuro com rótulos mint, viewport `#07120F`, inspetor `#0F1F1A` com cabeçalho "Inspetor".
- Campos, botões, primário mint, perigo, selo BIM, checkboxes e barra de status no escuro; aba Conflitos escurecida.
- Botão "Salvar" da topbar como primário mint (`arq-btn-salvar`).

## Defeito que só a verificação visual pegou

`.arq-tool` dentro do inspetor ("Modos", "Revelar todos", "+" de camada) herdava `color: var(--arq-texto)`
— grafite `#1A1D1F` sobre `#0F1F1A`: rótulo **invisível**. O `tsc` ficaria verde do mesmo jeito.
Corrigido com bloco escopado `.arq-editor-aside .arq-tool`. Detectado em harness estático (mesmo DOM
`arq-*` + `globals.css` real, Chromium), não em teste automatizado.

## Validação

```
tsc -p tsconfig.json --noEmit            → exit 0
node tests/run-all.mjs                   → 320 asserts, 0 falhas (16 suítes)
npx next build                           → exit 0 (9 rotas; /modelagem 175 kB)
```

**Homologação:** declarada pelo **solicitante** em 2026-11-03, com validação visual própria
(botões legíveis no escuro, barra de medidas flutuante no lugar, tooltip de ângulo/comprimento).
Este agente **não** verificou a página em runtime — a sessão não tinha projeto ativo/banco, e a
validação de CSS foi feita em harness estático. Os dois registros ficam separados de propósito.

**Produção:** não promovida. O push em `main` não foi executado — nesse repositório ele dispara o
auto-deploy da Contabo (homolog → prod). Promoção continua sendo ato explícito.

## Reversibilidade

Revertendo `globals.css` e as 11 linhas de TSX o editor volta ao estado anterior. Sem migração, sem banco.

## Pendências (decisão de UX, dono: design/DeepSeek)

1. O desenho não prevê rail de ferramentas nem painel de camadas; ambos seguem nas posições atuais.
2. Aba Conflitos foi escurecida por inferência — uma linha de CSS reverte para "folha" clara.
3. `ModalInserir` continua claro (diálogo sobreposto, não escopado).
