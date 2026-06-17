---
name: Drizzle jsonb default type conflict
description: TS2345 ao usar .default({}) em coluna jsonb com .$type<T>() — como resolver
---

## Regra

Ao usar `.$type<CustomInterface>()` em uma coluna `jsonb` do Drizzle, chamar `.default({})` causa:
```
TS2345: Argument of type '{}' is not assignable to parameter of type 'CustomInterface | SQL<unknown>'
```

Isso acontece porque TypeScript não consegue inferir que `{}` satisfaz a interface genérica em modo estrito.

**Why:** A interface tipada é mais restrita que `{}` — Drizzle usa o tipo genérico na assinatura do `.default()`.

## Fix

Remover `.default({})` do schema TypeScript. O default pode existir no banco de dados (SQL migration) mas não é necessário no schema Drizzle — o campo é marcado `.notNull()` e sempre preenchido no insert.

```typescript
// ERRADO — causa TS2345
config: jsonb("config").$type<SiteGeneratorConfig>().notNull().default({}),

// CERTO — remove default do TS, mantém na migration SQL se quiser
config: jsonb("config").$type<SiteGeneratorConfig>().notNull(),
```

**How to apply:** Toda vez que criar um campo `jsonb` tipado com interface customizada.
