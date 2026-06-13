---
name: Supabase pooler region quirk
description: The vendorai-core Supabase project uses aws-1-sa-east-1 (not aws-0) for its pooler endpoint.
---

# Supabase Pooler Region — vendorai-core

**Rule:** This project's Supabase pooler is on `aws-1-sa-east-1.pooler.supabase.com:6543`, not `aws-0-*`. All `aws-0-*` regions return `tenant/user not found`.

**Why:** Supabase assigns projects to specific pooler clusters per region. The project ref is `gfocphuiyyufwzcyihbk` and its pooler lives on `aws-1-sa-east-1`.

**How to apply:**
- `SUPABASE_DATABASE_URL` must use `aws-1-sa-east-1.pooler.supabase.com:6543` with `?pgbouncer=true`
- Always copy from Supabase Dashboard → Project Settings → Database → Connection string → **Transaction pooler** tab
- Direct connection (`db.*.supabase.co:5432`) is blocked from Replit (DNS ENOTFOUND)
- `drizzle-kit push` works fine through the pooler for schema migrations
