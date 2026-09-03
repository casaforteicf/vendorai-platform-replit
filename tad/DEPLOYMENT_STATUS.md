# TAD V0.23 deployment readiness

Production target: tad-vendorai

- Version: 0.23.0
- Modes enabled by default: PAPER / SHADOW
- LIVE trading in production: disabled by default
- LIVE code path: implemented behind independent fail-closed gates
- Operational profiles: Conservador / Intermediário / Arriscado
- Daily trade count: opportunity-driven, no fixed daily cap
- Markets: Crypto ACTIVE; B3, US, Forex and Commodities READY_FOR_FEED until real market feeds are connected
- Private exchange adapter: Binance USD-M Futures server-only, signed requests, deterministic order idempotency
- Protection: exchange-resident conditional stop via Algo Order API; emergency reduce-only flatten if stop placement fails
- Controls: ADMIN-only persisted arm + independent kill switch; both default safe
- Validation: dedicated TAD CI runs workspace typecheck and production build

Merging this version does not enable real-money execution. Operational activation requires the V0.23 database migration, private exchange credentials, successful readiness/reconciliation, explicit server flags, explicit ADMIN arm, and an explicitly cleared kill switch.
