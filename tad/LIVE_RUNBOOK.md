# TAD V0.23 — LIVE Readiness Runbook

LIVE is fail-closed. Merging this version does not activate real trading.

## Required sequence

1. Apply the V0.23 Supabase migration so `tad_live_controls` exists. Defaults are `armed=false` and `kill_switch=true`.
2. Configure server-only Binance credentials. Never expose the API secret in client code or `NEXT_PUBLIC_*` variables.
3. Start on a non-production Binance Futures environment/base URL.
4. Keep `TAD_LIVE_TRADING_ENABLED=false` while validating signed private connectivity, account access, market freshness and reconciliation.
5. Validate `/api/live/readiness` as an authenticated ADMIN. Every readiness check must be true.
6. Validate `/api/live/reconcile` and confirm exchange positions match the intended account state.
7. Set `TAD_LIVE_TRADING_ENABLED=true` only for the controlled environment. This alone still cannot execute because persisted `armed` and the kill switch are independent gates.
8. Clear the persisted kill switch explicitly, validate readiness again, then arm explicitly. Clearing does not arm; arming does not clear.
9. Use only a recent approved TAD decision. `/api/live/execute` accepts decisions no older than 60 seconds and recomputes a maximum quantity from real available balance, final TAD risk and stop distance.
10. The entry uses an idempotent client order id. A conditional STOP_MARKET is then sent through Binance Algo Order API. If the protective stop fails, TAD attempts an immediate reduce-only market flatten and records the failure in audit.
11. Reconcile after every controlled execution before expanding use.
12. For the Binance production host, `TAD_ALLOW_PRODUCTION_EXCHANGE=true` is an additional independent server-only gate.

## Emergency behavior

Set `kill_switch=true` immediately to block new entries. The kill switch intentionally does not cancel existing protective stop orders. Existing exchange risk protection should remain resident while the account is reconciled.

## Required controls

- ADMIN-only persisted arm/kill controls with RLS
- server-only API credentials
- signed private connectivity and clock check
- fresh market data
- approved trade Risk Gate and Risk Budget
- approved robustness (Walk-Forward + Monte Carlo)
- Data Health = HEALTHY
- Supervisor = OPERATE or REDUCE_RISK
- tracked-symbol allowlist
- valid stop direction and price
- recent approved decision
- live quantity <= risk-derived maximum
- deterministic idempotency identifiers
- exchange-resident protective stop
- audit events for blocked, requested, confirmed, failed and reconciliation states

## Production rule

Do not set production execution flags or credentials merely because the code is merged. Production activation is an operational change and should occur only after CI/build, migration, private API connectivity and controlled non-production validation are green.
