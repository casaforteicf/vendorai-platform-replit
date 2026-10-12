# Homologação — ONDA 02 (Operação comercial) — 11/10/2026

Registro de homologação **automatizada** da ONDA 02, no commit de `main` após os merges do dia.

## Escopo desta homologação
Verificação **automatizada e reproduzível** (testes + builds). A homologação **funcional de tela** (operar cada fluxo no app com um tenant real) é a etapa de validação em uso — fora do alcance de execução estática e recomendada antes/depois do deploy.

## Evidências automatizadas (todas verdes)

| Gate | Resultado |
|---|---|
| Testes focados ONDA 02 (CRM, comercial, execução parcial, billing, contexto/UI, casal, restauração de lead) | **90 testes · 17 arquivos · 100% passando** |
| `tsc -p tsconfig.launch-ci.json --noEmit` (backend) | **exit 0** |
| `node build.mjs` (esbuild, gate real backend) | **exit 0** |
| `vite build` (frontend) | **exit 0** |

## Entregas da ONDA 02 fechadas hoje

| Item | Situação | Ref |
|---|---|---|
| CRM-21 / ORC-13 / OBR-02 — saldo da execução parcial (unificação dos dois caminhos de lote, sem duplicar reserva) | **Corrigido e mergeado** | PR #3479 |
| CRM-08 — lead excluído sumindo do pipeline operacional (invalidação de cache) | **Corrigido e mergeado** | PR #3480 |
| CRM-22 — filtros e busca na lista de leads | **Entregue** | PR #3476 |
| Testes de execução parcial no vitest (pnpm test verde) | **Entregue** | PR #3472 |
| CRM-17 (pipeline só ativos), CRM-18 (responsável rápido), CRM-19 (anexos unificados), CRM-24 (privacidade de conversas) | **Verificado: já implementado** | — |

## Conclusão

A ONDA 02 está **completa em implementação (0 itens ausentes)** e com **homologação automatizada verde** (90 testes + 3 builds). Os gaps de risco (saldo da execução parcial, exclusão de lead) foram corrigidos e estão no ar. O remanescente dos itens "PARCIAL" é **validação funcional em uso**, não desenvolvimento.

Ressalva honesta: evidência automatizada ≠ homologação funcional de cada tela; esta última se dá no uso/validação com dados reais.
