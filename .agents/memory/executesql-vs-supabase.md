---
name: executeSql vs Supabase
description: executeSql usa banco interno Replit; psql $DATABASE_URL pode ser banco diferente do API server; sempre usar SUPABASE_DATABASE_URL via Node para migrações de produção.
---

# executeSql ≠ Supabase, e DATABASE_URL ≠ SUPABASE_DATABASE_URL

**Regra:** Há três bancos distintos a não confundir:
1. `executeSql` (code_execution) → PostgreSQL **interno do Replit** — nunca afeta produção
2. `psql $DATABASE_URL` → pode ser o Postgres interno do Replit (se DATABASE_URL aponta para ele)
3. `SUPABASE_DATABASE_URL` → banco Supabase real, que o API server usa via `lib/db/src/index.ts`

**O API server usa:** `SUPABASE_DATABASE_URL ?? DATABASE_URL` — logo, se `SUPABASE_DATABASE_URL` está definida, é ela que conta.

**Pattern correto para migrações de produção:**
```bash
cd /home/runner/workspace/lib/db && node --input-type=module << 'EOF'
import pg from '../../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL });
try {
  await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS my_col boolean NOT NULL DEFAULT false`);
  console.log('OK');
} finally { await pool.end(); }
EOF
```

**Atenção:** `psql $SUPABASE_DATABASE_URL` falha com `invalid URI query parameter: "pgbouncer"` — o pgbouncer=true na query string é incompatível com psql; usar Node/pg diretamente.

**Por quê importa:** aplicar via `executeSql` ou `psql $DATABASE_URL` parece funcionar (retorna sucesso) mas o API server continua falhando com "column does not exist" porque lê do Supabase real.

**Descoberto quando:** migration `ia_ativa` aplicada via executeSql + psql $DATABASE_URL → ambos reportaram sucesso mas API server continuou falhando; fix foi Node com SUPABASE_DATABASE_URL.
