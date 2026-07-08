---
name: activity_tipo Postgres enum drift from TS schema
description: some values declared in the Drizzle TS enum for activity_tipo were missing from the actual Postgres enum type, causing silent insert failures for those tipos.
---

# activity_tipo enum drift

**Descoberto quando:** ao adicionar um novo valor (`feedback_entrega`) ao enum `activityTipoEnum` e aplicar via `ALTER TYPE ... ADD VALUE`, uma checagem de `pg_enum` revelou que dois valores já declarados havia tempo no schema TS (`escalacao_humano`, `handoff_agente`) nunca haviam sido aplicados ao tipo Postgres real no Supabase. Qualquer `INSERT` com esses tipos falhava com `invalid input value for enum activity_tipo`.

**Por quê importa:** o Drizzle TS schema é a fonte da verdade *pretendida*, mas não há garantia de que o enum Postgres em produção esteja sincronizado — principalmente combinado com o problema conhecido de `drizzle-kit push` reportar "No changes detected" silenciosamente (ver `drizzle-push-silent-fail.md`).

**Como aplicar:** ao tocar em qualquer enum Postgres existente (não só ao adicionar um valor novo), rode uma query `SELECT enumlabel FROM pg_enum JOIN pg_type ...` contra o Supabase real (`SUPABASE_DATABASE_URL`, nunca `executeSql`) e compare com os valores declarados no schema TS. Se houver drift, aplique os valores faltantes com `ALTER TYPE <enum> ADD VALUE IF NOT EXISTS '<valor>'` antes de considerar a migração completa.
