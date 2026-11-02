# ARQDOR STUDIO 2.0 — FOUNDATION

Branch: `codex/arqdor-contracts-fix` · Base: `main` · App: `artifacts/arqdor-studio/`

## O que este branch contém

**Domínio completo do editor, puro e testado** — sem UI, sem banco, sem dependência instalada.
São 28 arquivos `.ts` e ~3.000 linhas, com **141 asserções de comportamento** rodando em Node.

```
artifacts/arqdor-studio/
├── tsconfig.json                 gate completo (precisa de @types/node)
├── tsconfig.contracts.json       gate rápido — roda SEM instalar nada
├── tsconfig.contracts-tests.json gate dos testes negativos
├── tsconfig.check.json           emite CJS para rodar os checks
├── src/arqdor/editor/
│   ├── modelador/                schema, plano, hitTest, pushpull, gizmo, store-core, desenho
│   │   └── ferramentas/          linha, retangulo, circulo, arco
│   ├── bim/                      schema, camadas, store-core, derivar2d
│   ├── mep/                      schema (roteamento 2D), colisao (AABB)
│   ├── orcamento/                quantitativos (medição, perda, Praça.ai)
│   ├── documentacao/             memorial descritivo
│   ├── persistencia/             documento versionado v2 + migração v1→v2
│   ├── ia/, moveis/, portal/, video/, interiores/   contratos tipados
│   └── transacao.ts              histórico global (Passo discriminado por escopo)
└── tests/                        camadas, bim, orcamento, colisao, memorial, persistencia
```

## Comandos

```powershell
cd artifacts/arqdor-studio

npx tsc -p tsconfig.contracts.json           # gate rápido, sem deps
npx tsc -p tsconfig.contracts-tests.json     # testes negativos (R1–R3 + anti-any)
npx tsc -p tsconfig.json --noEmit            # gate completo (precisa de pnpm install)
pnpm test:camadas                            # 141 asserções de comportamento
```

`tsc -p tsconfig.json` exige `@types/node`. Sem ele: `TS2688: Cannot find type definition file for 'node'` —
é ambiente, não código.

## Suítes de comportamento

| Suíte | Asserts | Cobre |
|---|---|---|
| camadas | 29 | visibilidade, modos, exceções, migração, faxina |
| bim | 23 | store + undo, ordenação por nível, áreas, derivar2d |
| orcamento | 28 | medição, vão contábil, perda, agrupamento, Praça.ai |
| colisao | 16 | AABB, margem, tomada ancorada, ranking por volume |
| memorial | 19 | seções, tabela, ausência de placeholder, determinismo |
| persistencia | 26 | round-trip, migração v1→v2, integridade, contador |

## O que ainda NÃO está testado

**A UI.** Os 141 asserts cobrem o domínio, não a integração. Quando os stores Zustand e os
viewports entrarem, o primeiro ponto a verificar é a **fonte única de visibilidade (D4)**: se a UI
passar a derivar visibilidade de `modo.camadasVisiveis` em vez de `camada.visivel`, o estado
inconsistente volta e nenhum teste atual pega isso.

## Registro de reconciliação

`docs/arqdor/ARQDOR-STUDIO-2.0-RECONCILIACAO-BLOCO-0-V1.md` — ADRs, correções E1–E18, defeitos
D1–D7 encontrados ao implementar, e as instruções pendentes para o DeepSeek atualizar a doc dos
14 documentos.

## Convenção

Commits `feat(arqdor):` / `docs(arqdor):` / `test(arqdor):`. Autor: `marcosreisdorfer@gmail.com`.
Push neste PC: `git -c http.sslBackend=openssl -c "http.extraheader=AUTHORIZATION: basic <b64>" push`.