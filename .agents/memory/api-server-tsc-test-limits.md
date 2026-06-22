---
name: api-server tsc & test limits
description: Why full api-server typechecks/tests behave oddly under tooling and what to trust instead.
---

# api-server typecheck & test limits

- **A full `tsc -p tsconfig.json --noEmit` on `artifacts/api-server` does not finish within the agent tooling time budget** (the bundle is ~16MB; cold tsc > 2min). Do NOT keep retrying it.
  **Trust instead:** `pnpm run typecheck:libs` (covers all `lib/db` schema + drizzle-zod + the `vector` type) plus the esbuild dev build (`restart_workflow artifacts/api-server: API Server` succeeds only if imports/syntax compile). For route-level type safety, review narrowing manually (e.g. `req.user?.x === y` does NOT narrow `req.user`; bind `const user = req.user` and guard).

- **The `api-isolation-tests` workflow intermittently fails with `Test timed out in 5000ms`** on a rotating subset of `*-isolation.test.ts` files (activities / agendamentos / propostas seen). Cause is slow module import (~26s reported) starving the per-test 5s budget — these are flaky timeouts, NOT assertion failures. ~275/278 pass on a good run. Don't chase these as regressions unless an assertion (not a timeout) fails or prospector-specific tests fail.
