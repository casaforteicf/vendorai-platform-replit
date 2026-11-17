# ARQ-MAT-01 — Materialização sólido → BIM (D12) e tela de Orçamento

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-02
**Estado:** implementado e validado tecnicamente (não homologado, não publicado)

## Objetivo
Fechar a lacuna estrutural: o modelador 3D produzia sólidos e toda a cadeia a jusante
(planta 2D, quantitativos, memorial) consumia elementos BIM — sem nenhuma passagem entre os dois.

## Decisão de domínio (aprovada pelo dono do produto)
**Opção A — semântica por face**, registrada como **D12** em
`docs/arqdor/ARQDOR-STUDIO-2.0-RECONCILIACAO-BLOCO-0-V1.md`:

| Regra | Critério geométrico | Resultado |
|---|---|---|
| Parede | volume vertical com base/topo horizontais, altura ≥ 1,0 m e menor dimensão da planta ≤ 0,6 m | `GeometriaParede` com eixo no **centro** da espessura |
| Laje | altura ≤ 0,4 m, ou face horizontal solta | `GeometriaLaje` (contorno + espessura; parâmetro opcional) |
| Telhado | sem plano horizontal dominante e face inclinada entre 5° e 80° | `GeometriaTelhado` |
| Móvel | todo o resto | `GeometriaMobiliario` (caixa + posição em planta) |

Invariantes: função pura (sem `three`, sem `Date`), id determinístico `el_<solidoId>`
(re-materializar **atualiza** em vez de duplicar), transformação do sólido aplicada em mundo.

## Implementado
- `src/arqdor/editor/bim/materializar.ts` — classificação, geração de elementos e lote com
  `criar_elemento_bim` / `atualizar_elemento_bim`.
- Botão **Materializar** na seção BIM do rail do editor (converte todos os sólidos; relata recusas).
- Tela **Orçamento** (`/orcamento`, ambiente habilitado na sidebar): totais por unidade,
  quantitativos agrupados por categoria/material, mapa Praça.ai e memorial descritivo.
- Estado vazio honesto: sem elementos BIM, a tela explica o caminho em vez de mostrar zeros falsos.

## Validação (evidência)
```
tsc -p tsconfig.json                 → exit 0
tsc -p tsconfig.contracts.json       → exit 0
tsc -p tsconfig.contracts-tests.json → exit 0
tsc -p tsconfig.check.json           → exit 0
node tests/run-all.mjs               → 189 asserts, 0 falhas
   camadas 29 · bim 23 · orcamento 28 · colisao 16 · memorial 19 · persistencia 26 · editor 21 · materializacao 27
```
Verificado no navegador: projeto com 4 sólidos → **Materializar** → 3 elementos criados, 1 recusado
(`SOLIDO_SEM_FACES`); planta 2D desenhou os novos elementos; `/orcamento` exibiu 7 elementos,
12 linhas de medição, 47,21 m² / 6,14 m³ e o memorial com as 6 seções.

## Pendência declarada — arrasto do gizmo
`tests/gizmo/e2e-drag.mjs` foi escrito (Playwright sobre o navegador do sistema, seam de projeção
em dev). **Não pôde ser executado neste ambiente**: o sandbox bloqueia o canal mojo do navegador
(`FATAL: platform_channel.cc — Acesso negado`) e o spawn com pipe (`spawn EPERM`).
Status correto: **não validado**. O harness roda em máquina fora do sandbox:
```
npm i --cache .npm-cache playwright-core        # em .e2e/ (fora do versionamento)
PLAYWRIGHT_CORE=<...>/playwright-core/index.js node artifacts/arqdor-studio/tests/gizmo/e2e-drag.mjs
```

## Próximos passos
- Rodar o E2E do gizmo em ambiente sem sandbox (Contabo ou máquina local).
- Materialização em lote com fatiamento de sólido em "L" (hoje: 1 sólido ⇒ 1 elemento).
- Persistência em servidor (Supabase oficial) — fora do escopo local aprovado.