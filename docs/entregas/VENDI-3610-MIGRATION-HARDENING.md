# VENDI-3610 — missing function ordering

Updated 2026-10-23. Existing draft PR #3609; no merge or deployment.

## Evidence
Owner ran read-only inventory on vendi-3593-db/vendi3593_clean: 217 SQL and 9 Drizzle ledger rows; vector and pgcrypto installed. All four public helper/trigger functions referenced by 202609222235 are absent; all three app_security helpers exist. SQL files are lexically ordered: 202609222235 executes before 205 and 210. The latter define the three VendorAI trigger functions. No repository definition was found for optional legacy rls_auto_enable.

## Change
202609222235 hardens only functions already present; it neither creates placeholders nor skips required app_security search_path changes. 205 and 210 apply the same execute ACL to their real function definitions, failing if missing. PUBLIC is revoked unconditionally; optional browser roles are revoked if present; backend vendorai_app remains explicit.

## Compatibility gate
These are historical SQL edits. Preserve existing ledger rows/checksums: do not clear or rewrite the 217 rows, whitelist arbitrary checksums, or reapply applied files automatically. This draft is for the disposable clean-run correction set. Existing databases require separately reviewed forward reconciliation after inventory of original checksums; not authorized for production use by this PR alone.

## Validation status
Code reviewed for function order and optional roles. PostgreSQL execution, clean replay of all 411 SQL + 9 Drizzle, ACL tests with/without optional browser roles and API/RLS smoke remain PENDING on isolated Contabo. No PostgreSQL/Docker runtime available in this workspace. No successful migration test claimed.

## Scheduler inventory
Owner output: backend deploy-backend.sh every 2 minutes contains manual-homolog.lock; frontend deploy-frontend-auto.sh every 3 minutes does not contain that literal. Actual control flow/included scripts not yet inspected. No scheduler or lock changed.
