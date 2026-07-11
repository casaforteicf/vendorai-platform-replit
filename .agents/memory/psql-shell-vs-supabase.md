---
name: psql shell vs Supabase
description: psql "$DATABASE_URL" no bash shell do Replit conecta ao Postgres interno (heliumdb), não ao Supabase. runStartupMigrations() é o único meio confiável de seeding no Supabase.
---

## A regra

`psql "$DATABASE_URL"` e `executeSql` no code_execution sandbox ambos conectam ao **Postgres interno do Replit** (`postgresql://postgres@helium/heliumdb`), NÃO ao Supabase da produção.

O API server (`artifacts/api-server`) acessa o Supabase via o segredo `DATABASE_URL` injetado pelo Replit na inicialização do workflow — esse valor é diferente do `$DATABASE_URL` disponível no shell bash.

**Why:** O shell bash herda env vars do container Replit base, que tem um Postgres local embutido como `DATABASE_URL`. O workflow do API server injeta o segredo real (Supabase URL) no processo Node.js.

## Como seeding no Supabase funciona

A única forma confiável de executar SQL no Supabase a partir deste ambiente é usar `runStartupMigrations()` no `artifacts/api-server/src/index.ts`. O padrão é:

```typescript
try {
  await db.execute(sql`INSERT INTO ... ON CONFLICT ... DO UPDATE SET ...`);
  logger.info("startup seed: XYZ OK");
} catch (err) {
  logger.warn({ err }, "startup seed: XYZ skipped");
}
```

## Gotchas críticos

- **DO NOTHING é perigoso para seeding de credenciais**: se a linha já existir com creds nulas (de um boot anterior com dados incompletos), `ON CONFLICT DO NOTHING` não corrige. Use `DO UPDATE SET` para credenciais.
- **SELECT FROM outro tenant como fonte**: se o tenant fonte migrou de Z-API para Meta no Supabase, `AND zapi_instance_id IS NOT NULL` retorna 0 linhas e o INSERT insere nada silenciosamente.
- **Verificar via log de startup**: "startup seed: X OK" só significa que o SQL não deu erro — não que linhas foram inseridas. Para confirmar, logar o resultado do SELECT subsequente.

## How to apply

Sempre que precisar seeding de dados de sistema (ex: tenant institucional, planos padrão, configs de integração), coloque em `runStartupMigrations()` com UPSERT. Nunca use psql no shell para dados que precisam ir ao Supabase.
