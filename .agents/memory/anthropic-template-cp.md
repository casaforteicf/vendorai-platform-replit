---
name: Anthropic integration template cp danger
description: O cp do skill ai-integrations-anthropic sobrescreve conversations.ts e messages.ts do projeto com versões simplificadas do template
---

## Regra

O comando `cp -r .local/skills/ai-integrations-anthropic/templates/lib/* lib/` copia dois arquivos de schema que provavelmente JÁ EXISTEM no projeto com estrutura diferente:
- `lib/db/src/schema/conversations.ts`
- `lib/db/src/schema/messages.ts`

O template usa exports `conversations`/`messages` (sem sufixo Table), mas o projeto usa `conversationsTable`/`messagesTable`. Sobrescrever quebra o build do esbuild com "No matching export" para todos os arquivos que importam `conversationsTable` e `messagesTable`.

**Why:** O template do skill é genérico e não conhece a estrutura do projeto. O projeto já tinha essas tabelas integradas ao schema completo (multi-tenant, com FK para tenants, leads, etc.).

## Fix

Após o `cp`, imediatamente restaurar os arquivos sobrescritos:

```bash
git --no-optional-locks show HEAD:lib/db/src/schema/conversations.ts > lib/db/src/schema/conversations.ts
git --no-optional-locks show HEAD:lib/db/src/schema/messages.ts > lib/db/src/schema/messages.ts
```

## Prevenção

Ao usar esse skill em projetos que já têm `conversations.ts`/`messages.ts`, verificar ANTES do `cp` se os arquivos existem e, se sim, salvar backup:

```bash
cp lib/db/src/schema/conversations.ts lib/db/src/schema/conversations.ts.bak
cp lib/db/src/schema/messages.ts lib/db/src/schema/messages.ts.bak
# faz o cp do skill
# restaura os backups
```

**How to apply:** Sempre que usar `ai-integrations-anthropic` em um projeto que já tem o módulo de conversas implementado.
