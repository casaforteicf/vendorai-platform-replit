# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — Drizzle table definitions (source of truth for DB schema)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `lib/api-zod/src/generated/` — auto-generated Zod validators (do not edit manually)
- `lib/api-client-react/src/generated/` — auto-generated React Query hooks (do not edit manually)
- `artifacts/api-server/src/routes/` — Express route handlers

## Architecture decisions

- **Contract-first API**: OpenAPI spec drives Zod validators and React Query hooks via Orval codegen. Always update the spec first, then run `pnpm --filter @workspace/api-spec run codegen`.
- **`lib/api-zod/src/index.ts` exports selectively**: Orval generates duplicate names across `generated/api.ts` (Zod schemas) and `generated/types/` (TS interfaces). The barrel re-exports `*` from `api.ts` and only the non-conflicting types from `types/` to avoid TS2308 ambiguity errors.
- **Supabase Postgres**: `DATABASE_URL` is set as a runtime-managed secret pointing to the user's existing Supabase instance. Run `pnpm --filter @workspace/db run push` to apply schema changes.

## Product

- Multi-tenant backend API. Tenants represent client organizations with token/message usage limits and lifecycle status (active/suspended/cancelled).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
