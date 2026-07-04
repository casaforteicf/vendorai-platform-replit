---
name: Startup migration pattern
description: Como aplicar DDL ao Supabase quando drizzle-kit push falha/timeout.
---

## Regra

Quando `pnpm --filter @workspace/db run push` timar out ou travar (prompt interativo), adicionar uma função `runStartupMigrations()` no `artifacts/api-server/src/index.ts` que usa `db.execute(sql\`CREATE TABLE IF NOT EXISTS ...\`)`.

**Why:** drizzle-kit push é interativo (pede confirmação) e pode timeout com Supabase pooler lento. `tsx` não está disponível no ambiente. A startup migration usa o mesmo pool de conexão do api-server (já configurado com DATABASE_URL) e é idempotente.

**How to apply:**
1. Escrever a DDL com `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`
2. Envolver em try/catch (log warn se já existir)
3. `runStartupMigrations().then(() => app.listen(...))` — sequenciado antes do listen
4. Confirmação no log: "startup migrations: X OK"
5. Remover a função após confirmar que as tabelas existem (ou manter — é idempotente)
