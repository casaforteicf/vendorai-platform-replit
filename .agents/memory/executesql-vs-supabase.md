---
name: executeSql vs Supabase
description: executeSql em code_execution usa banco interno Replit, não Supabase — para ops que afetam produção usar pg diretamente.
---

# executeSql ≠ Supabase

**Regra:** O callback `executeSql` no sandbox `code_execution` conecta ao PostgreSQL **interno do Replit** (Replit-managed DB), não ao Supabase configurado em `SUPABASE_DATABASE_URL`.

**Por quê importa:** A produção usa `SUPABASE_DATABASE_URL`. Qualquer operação que precisa afetar o banco de produção (ex: reset de senha, seed de dados) deve usar `pg` com `SUPABASE_DATABASE_URL` diretamente via bash/node.

**How to apply:**
```js
// ERRADO para produção:
await executeSql(`UPDATE users SET password = '...' WHERE ...`)

// CERTO para produção:
// bash: node script.mjs
// onde o script usa:
import { createRequire } from 'module';
const require1 = createRequire('/home/runner/workspace/artifacts/api-server/package.json');
const require2 = createRequire('/home/runner/workspace/lib/db/package.json');
const bcrypt = require1('bcryptjs');
const { Pool } = require2('pg');
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });
```

**Descoberto quando:** reset de senha de `marcos@vendor.ai` via `executeSql` retornou `UPDATE 1` mas login em produção continuava 401 — a produção lia do Supabase, o executeSql escreveu no Replit interno.
