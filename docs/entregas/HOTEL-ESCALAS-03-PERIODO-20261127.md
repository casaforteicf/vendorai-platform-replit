# HOTEL-ESCALAS-03 — seletor de período (mês)

Data: 2026-11-27. Base: `main` `7f5e2be8c`.

## Objetivo e escopo

Permitir gerar a escala de outros períodos na tela `/hotelaria/escalas`, sem
redesenhar layout, cores, logomarca ou algoritmo. Continua um período ativo por
tenant; os anteriores ficam no histórico versionado (restauráveis).

## Implementação

- Campo **Período** (`input type="month"`) no cabeçalho, no mesmo padrão visual
  dos demais controles.
- `trocarPeriodo(state, novoInicio)` em `artifacts/frontend/src/lib/escala-ab.ts`:
  - mantém equipe, horários, regimes, tarifas, pares críticos e extras;
  - zera ocupação, metas e feriados do período anterior;
  - preserva as folgas (T/F) para ajuste;
  - recalcula os 35 dias a partir do novo início.
- Confirmação antes de trocar; a gravação continua sendo o botão **Salvar**
  (nova versão no histórico).

## Arquivos alterados

- `artifacts/frontend/src/lib/escala-ab.ts`
- `artifacts/frontend/src/lib/escala-ab.test.ts`
- `artifacts/frontend/src/pages/hotelaria/HotelEscalas.tsx`
- `docs/entregas/HOTEL-ESCALAS-03-PERIODO-20261127.md`

## Validação (local, 2026-11-27)

- `tsc -p tsconfig.launch-ci.json --noEmit`: exit 0.
- `vitest run src/lib/escala-ab.test.ts`: 5/5 (inclui troca de período).
- `vite build`: exit 0.
- `node build.mjs` (esbuild): exit 0.

## Publicação

Merge na `main` dispara o auto-deploy existente da Contabo (homolog → produção).
Conferir em `/opt/vendorai/deploy-state/last-status` e
`/opt/vendorai/deploy-state/last-frontend-status`.

## Pendências

- Aba **COZINHA** de novembro ausente: a aba do arquivo está em dezembro
  (dia 1 = TER) e sem folgas marcadas; os 12 nomes não foram importados.
- Um período ativo por tenant; trocar o mês e salvar cria nova versão e mantém
  a anterior no histórico.
