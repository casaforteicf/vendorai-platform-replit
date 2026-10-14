# Lote CRM-UI-01 — Padrão visual nas superfícies CRM (Fase 1)

Data: 2026-10-14
Branch: `feat/crm-ui-padrao` (a partir de `main` @ `1ea6f2700`) — **enviada**
Commits: `1fc9d35b0`, `5f4e6cf1c`
Pull request: [#3556](https://github.com/casaforteicf/vendorai-platform-replit/pull/3556) — **Draft**, sem merge
Escopo aprovado: **só CRM**, em duas fases (aspeto primeiro, decomposição depois)

## Objetivo
Colocar as superfícies CRM que ainda não tinham adotado o `ui-standard` dentro
do padrão já usado em Leads e Deals, sem refactorizar a estrutura de
componentes (isso é a Fase 2).

## O que estava realmente a bloquear o padrão
1. O mecanismo de adesão é **por classe**, não por biblioteca de componentes:
   `.vendor-page-canvas` para moldura/tipografia/controlos/tabelas e
   `.vendor-product-*` / `.vendor-kpi-*` / `.vendor-work-*` /
   `.vendor-empty-state` para a linguagem de produto. As páginas de Pipeline e
   Empresas simplesmente nunca tinham aplicado essas classes.
2. O cabeçalho de `ui-standard.css` afirmava que Conversations e Deals tinham
   layout próprio. Estava desactualizado: a secção "Premium product screens"
   já os cobre. Corrigido.
3. `compact-page-titles.css` é importado **depois** de `ui-standard.css`
   (`main.tsx:10` vs `main.tsx:12`). Ambas as regras de título são
   `!important`, mas a do compacto tem especificidade maior
   (`main.vendor-scrollbar .vendor-page-canvas h1` = 0-2-1 contra
   `.vendor-product-title` = 0-1-0). Resultado: o `clamp(24px, 2.2vw, 31px)`
   do herói de produto **nunca** se aplicava em nenhuma página com
   `.vendor-page-canvas` — todos os títulos CRM ficavam fixos em 24px.

## Alterações
| Ficheiro | Mudança |
|---|---|
| `artifacts/frontend/src/ui-standard.css` | Novas classes por ecrã `vendor-pipeline-page` e `vendor-companies-page`, ligadas às regras partilhadas já existentes (mínimo 0, herói, cartões, colunas de board `w-72`, responsivos ≤1023px e ≤767px). Cabeçalho corrigido. |
| `artifacts/frontend/src/compact-page-titles.css` | Guarda `:not(.vendor-product-title)` na regra base e na móvel, para que o opt-in explícito no herói de produto não seja esmagado. |
| `artifacts/frontend/src/pages/PipelineOperacional.tsx` | Raiz passa a `vendor-product-page vendor-page-canvas vendor-pipeline-page`; título/subtítulo para a escala de produto. |
| `artifacts/frontend/src/pages/PipelineRelacionamento.tsx` | Idem. |
| `artifacts/frontend/src/pages/Companies.tsx` | Raiz, herói, `.vendor-filter-strip` (em vez de `Card`+`CardContent`, que duplicava a borda), `.vendor-work-item` nos registos e `.vendor-empty-state` para erro/vazio. |
| `artifacts/frontend/src/pages/CompanyCenter.tsx` | Raiz, título/subtítulo, `.vendor-kpi-grid` + `.vendor-kpi-card/-icon/-value/-label`, `.vendor-product-tabs`, `.vendor-empty-state`. |

`NewLeadDialog.tsx` não foi tocado: vive dentro de `[role="dialog"]` e já é
governado pelas regras globais de diálogo, não pelo `.vendor-page-canvas`.

## Gates executados (evidência real)
Executados localmente em Windows, neste clone.

- `pnpm run build` (vite) → **sucesso**, 1m27s. `audit:bundle` posterior:
  todos os orçamentos dentro do limite (main 82.54/140 kB, Leads 33.75/50 kB,
  AppLegacy 43.30/80 kB).
- Regras novas confirmadas no CSS compilado: `vendor-pipeline-page` 9 ocorrências,
  `vendor-companies-page` 5, e o seletor `h1:not(.vendor-product-title)` emite-se
  nas duas breakpoints.
- `pnpm exec vitest run` → **149/150 ficheiros, 798/799 testes passam**.
  Único falha: `src/pages/arch/conceptClientBriefTemplates.test.ts` (timeout de 5s
  num teste de geometria do Arqdor). Reproduz isoladamente; **não** é do CRM nem
  deste lote.
- `pnpm run typecheck` → 1 erro: `src/pages/scout/ScoutConfigPanel.tsx(107,1) TS1005`.
  **Reproduzido em `main` puro.** É o commit `1ea6f2700 "etapa 1/2 — parte inicial"`:
  a função `executionModeFromAcao` está truncada a meio do corpo. O ficheiro não é
  importado por ninguém, por isso o build não o alcança. Fora do escopo deste agente.
- `pnpm run audit:ui` → **gate bloqueado**: `httpContractHighs 176` (baseline 170),
  `visibleErrorHighs 58` (baseline 56). **Medido em `main` puro: números idênticos.**
  A regressão pré-existe a este lote; este lote não a introduz nem a corrige.
  Consequência prática: `pnpm test` falha no `pretest` antes de correr o Vitest,
  por isso a suite foi invocada com `vitest run` direto.

## Bloqueio de ambiente (a explicar por que quase nada tem evidência executada)
`pnpm-lock.yaml` tem `overrides` que colocam toda a cadeia de binários nativos em
`'-'` excepto `linux-x64-gnu`: `rollup>@rollup/rollup-*`, `esbuild>@esbuild/*`,
`lightningcss>lightningcss-*`, `@tailwindcss/oxide>@tailwindcss/oxide-*`.
Em Windows/macOS o `vite build` e o `vitest` **não arrancam**.
Para obter evidência foi preciso extrair manualmente os pacotes win32-x64
(`@rollup/rollup-win32-x64-msvc@4.60.3`, `@esbuild/win32-x64@0.27.3`,
`lightningcss-win32-x64-msvc@1.32.0`, `@tailwindcss/oxide-win32-x64-msvc@4.3.0`)
para dentro de `node_modules/.pnpm/`. O `pnpm-lock.yaml` **não foi alterado** e
`git status` mantém-se limpo em relação a isso. Este ponto deve ser decidido em
conjunto com quem trata da infraestrutura, porque afeta a reprodutibilidade do build.

## Estado
| Etapa | Estado |
|---|---|
| Planejado → Implementado | **Concluído** |
| Validado tecnicamente | **Parcial** — build e suite de testes do frontend executados; typecheck e `audit:ui` bloqueados por falhas pré-existentes reproduzidas em `main` |
| Homologação (Contabo) | **Não realizada** |
| Aprovação de release | **Não dada** |
| Produção | **Não alterada** |
| Push / PR / merge | Branch enviada; **PR #3556 aberto em Draft** — sem merge, sem deploy |

## Limites do que este lote prova
- Nenhuma página CRM foi vista num browser. O dev server não tem backend por
  omissão (`vite.config.ts:330` aponta para `localhost:8080`) e não há sessão de
  homologação; abrir as páginas autenticadas exigiria apontar para produção, o que
  não foi feito. **A validação visual humana continua por fazer.**
- As mudanças são de classe CSS e ordem de cascade. Não alteram comportamento,
  chamamentos de API nem isolamento de tenant.

## Pendências conhecidas, não resolvidas neste lote
1. `ui-standard.css` declara `:root` **duas vezes** com valores em conflito
   (1440px/16px raio/12px controlo/h1 1.625rem vs 1480px/14px/10px/h1 1.5rem).
   A segunda silencia a primeira. Enquanto não for consolidado, qualquer ajuste
   de token na primeira bloco é inócuo e enganador.
2. Tipografia do produto usa `!important` (`ui-standard.css:367-381`, `:634-636`),
   o que torna quase impossível um override por página — foi exatamente isto que
   permitiu a colisão com `compact-page-titles.css`.
3. Há 31 ficheiros `.css` em `src/`, dos quais **10 importados estaticamente** em
   `main.tsx:9-18` e 3 carregados sob demanda (`video-route-theme`,
   `leads-table-fix`, `arqdor-theme`) — vários com a mesma missão
   (`ui-standard.css`, `vendorai-ui2.css`, `compact-page-titles.css`,
   `vendor-brand.css`). A ordem de importação decide conflitos, o que torna a
   adesão ao padrão frágil.
4. Fase 2 (decomposição página a página para composição shadcn, referência
   `pages/scout/ScoutConfigPanel.tsx`) não iniciada.
5. Falhas pré-existentes em `main`: `ScoutConfigPanel.tsx` truncado, `audit:ui`
   acima da baseline, teste do Arqdor com timeout.
