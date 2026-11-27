# MKT-P2-PRODUCER — Fechando o produtor único (Fase 2)

Data: 2026-11-27
Branch: `feat/mkt-retry-claim` (base `main` @ 50a53e9d7)

## Diagnóstico
- A fila (`ContentProductionQueue.generateDirectItem`) **já reserva** a peça via
  `POST /content-calendar/:id/iniciar-producao` antes de gerar (ALINHA-01).
- A produção do plano (`MediaPlanAutoProductionBridge`) **também já reserva**.
- O **retry de falhas** (`MediaPlanFailedRetryBridge`) era o único caminho que gerava
  **sem reserva** — dois produtores possíveis — e **sem os headers de contexto**
  (`x-vendorai-calendar-item-id`, `-media-plan-id`, `-campaign-id`).

## Entregue
- Retry agora **reserva** a peça quando ela ainda não tem geração:
  - `409` → “já está em produção em outra sessão” (não gera);
  - falha na reserva → erro claro;
  - em qualquer erro depois da reserva, **libera** (`contentGenerationId: null`).
- Retry passa a enviar os **headers de contexto** em `/content/generate`, garantindo a
  mesma proveniência (`contextAudit`) dos demais caminhos.

## Validação
- Frontend build: **EXIT 0** (bundle budget ok).
- Testes: vendor-brain **40/40**; funil **7/7**.
- Sem mudança de API.

## Observação
A geração continua no servidor (`/content/generate`); a UI apenas **pede** e o claim
garante um único vencedor entre abas, tela e worker. O worker respeita o mesmo claim.
