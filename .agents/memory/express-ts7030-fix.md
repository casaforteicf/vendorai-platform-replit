---
name: Express route TS7030 fix
description: Como corrigir TS7030 "Not all code paths return a value" em rotas Express 5 TypeScript
---

## Regra

Em Express 5 com TypeScript estrito, handlers assíncronos que têm `return res.status(403).json(...)` como early return MAS terminam com `res.json(rows)` sem `return` geram **TS7030**.

Isso acontece porque TypeScript vê a função como tendo caminhos que retornam `Response` (os `return res.xxx()`) e caminhos que retornam `void` (o `res.xxx()` no final sem return), e com `noImplicitReturns` ou inferência estrita ele reclama.

**Why:** Express 5 mudou o tipo dos handlers internamente; supermercado.ts e varejo.ts sofreram esse problema ao compilar.

## Fix

```bash
sed -i \
  -e 's/^  res\.json(/  return res.json(/g' \
  -e 's/^  res\.status(201)\.json(/  return res.status(201).json(/g' \
  -e 's/^  res\.status(204)\.send()/  return res.status(204).send()/g' \
  artifacts/api-server/src/routes/<arquivo>.ts
```

Só afeta linhas com 2-space de indent (dentro do handler, não dentro de `if` blocks que têm 4 espaços).

**How to apply:** Toda vez que criar um novo arquivo de rotas Express e o typecheck retornar TS7030 nos handlers.

## Arquivos afetados anteriormente

- `varejo.ts` — corrigido via sed
- `construcao.ts` — AINDA tem TS7030 (pre-existing, não corrigido)
- `supermercado.ts` — verificar se tem erros (parecia clean no typecheck)
