# MKT-P2-ACTION — Ação/CTA da peça na UI (Fase 2)

Data: 2026-11-27
Branch: `feat/mkt-piece-action-ui` (base `main` @ e47d7ba7e)
Depende do contrato mergeado em #3779.

## Objetivo
A fila não decide sozinha se pode aprovar: ela consulta a máquina de estados
(`derivePieceAction` + `derivePieceMediaState`) e mostra o motivo quando bloqueado.

## Entregue
- `ContentProductionQueue` importa `derivePieceAction`/`derivePieceMediaState`.
- **Aprovar** habilitado apenas quando a ação do contrato é `approve` e a mídia está `ready`;
  caso contrário, `title` mostra o motivo (`Aguardando a mídia final`, `A mídia falhou…`).
- **Aprovação em lote** ignora peças cujo contrato não permite aprovar e informa
  quantas aguardam mídia (antes: checagem ad-hoc só de vídeo).
- Rótulos continuam vindo de `deriveOperationalState` (ALINHA-01).

## Validação
- Frontend build: **EXIT 0** (bundle budget ok), com `npm install` isolado no worktree.
- Testes: vendor-brain **40/40**; funil **7/7**.
- Bundle contém os motivos do contrato (“Aguardando a mídia final”, “Ação indisponível”).
- `tsc` do frontend: bloqueado por erro **pré-existente** em
  `lib/vendor-brain/src/arqdor-concept-adapter.test.ts` (TS2790), que impede o build das
  libs (`TS6305`). Não é causado por esta mudança; o build real (vite) passa.

## Próximos passos
- Rota de revisão por peça (`/marketing/revisao/:id`).
- Produtor único (worker) — a UI apenas pede produção.
- Resultados com atribuição.
