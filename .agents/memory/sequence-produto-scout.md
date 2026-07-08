---
name: Revenue Scout "sequencia_produto" opportunity type
description: How the next-product-in-sequence proactive offer flow works (purchase detection, deferral via cliente_etapa_projeto, dedup rules)
---

## Purchase detection
`propostas` (status="aceita", `itens[].produtoId`) is the only generic, cross-vertical
source of "this client bought product X" — used to compute days-since-purchase for
`sequencia_produto` rules. There is no separate "orders" table.

**Why:** the CRM has multiple verticals (Obras, Varejo, etc.) with different domain
models; `propostas` is the one purchase record common to all of them.

## Deferral instead of fixed recurrence
When a client says "not that stage yet" in reply to a proactive offer, the flow does
**not** reschedule on a fixed calendar. It asks a stage question, stores the free-text
answer in the generic `cliente_etapa_projeto` table, and marks the opportunity
`"adiado"` with `proximaTentativaEm` estimated by a light AI call from the stage text
(default 14 days, capped at 120). The next Revenue Scout pass only reopens the
opportunity once `proximaTentativaEm` has passed.

**Why:** a fixed weekly nag was explicitly rejected — timing should track the client's
actual reported progress, not a calendar.

**How to apply:** `sequencia_produto` rules use a dedicated eligibility+dedup branch in
`revenueScout.ts`'s `analisarCliente` (separate from the generic switch/dedup path used
by other rule types) because it needs to check `status IN (pendente,enviado,
aguardando_etapa)` OR `(adiado AND proximaTentativaEm > now)` to decide whether to skip.

## Auto-closing the Scout scoreboard
When a deal wins, `reconcileScoutOnDealWon` (in `revenueScout.ts`) auto-marks any
`scout_oportunidades` row with status `"enviado"` for that lead as `"converteu"` (sets
`dealId`) if it was sent within the last 45 days — called from both `proposalAccepted()`
and `runDealClosure()` (confirm_closure.ts), non-blocking. Without this, the Scout
conversion rate silently understates reality because the only other path to
`"converteu"` is a manual `POST .../oportunidades/:id/converter` call.

**Why:** a lead can independently reply and go through the normal SDR/Closer routing
after receiving a Scout offer — that's a real Scout-attributed sale, but nothing else
in the codebase links `scout_oportunidades` to the deal that closed it.
