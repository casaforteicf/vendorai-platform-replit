# ARQ-PERSIST-01 — Persistência no servidor (Fase 1, prioridade zero)

**Versão:** Arqdor Studio 2.0 · app `artifacts/arqdor-studio`
**Data:** 2026-11-02
**Estado:** implementado e validado tecnicamente (não homologado)

## Objetivo
Tirar o projeto do `localStorage`. Depois deste lote, limpar o cache do navegador não apaga nada:
a fonte da verdade é o servidor.

## Arquitetura
| Peça | Arquivo | Papel |
|---|---|---|
| Schema | `src/lib/db/schema.ts` | tabela `arqdor_projetos` (`jsonb` com o documento v2) |
| Contrato | `src/lib/db/armazenamento.ts` | interface + `ErroPersistencia` + escolha de adaptador |
| Postgres | `src/lib/db/postgres.ts` | Drizzle + pool único; usado quando existe `DATABASE_URL` |
| Desenvolvimento | `src/lib/db/arquivo.ts` | grava em `.data/arqdor/projetos.json` (escrita atômica `.tmp` + rename) |
| HTTP | `src/lib/db/http.ts` | mapeamento erro → status (409/404/422/500) |
| Rotas | `src/app/api/projetos/**` | GET/POST, GET/PUT/DELETE por id, projeções de elementos |

**Decisão:** o documento versionado é a unidade de persistência e vive em `jsonb`. Elementos e sólidos
estão dentro dele — a validação (`validar`) já é atômica no domínio; tabelas relacionais criariam duas
verdades. As rotas `/elementos` são projeção **read-only**.

## Cliente
`src/arqdor/editor/persistencia/apiStore.ts` (fetch) substitui o armazenamento local.
`localStore.ts` ficou só com o ponteiro de sessão (`arqdor.projetoAtivo`) e `novoDocumento()`.
Dashboard, editor (autosave + botão Salvar) e Orçamento passaram a ler/gravar via API, com
estado de erro visível quando o servidor não responde.

## Validação (evidência)
```
tsc -p tsconfig.json / contracts / contracts-tests / check → exit 0
node tests/run-all.mjs → 203 asserts, 0 falhas
   camadas 29 · bim 23 · orcamento 28 · colisao 16 · memorial 19 · persistencia 26
   · editor 21 · materializacao 28 · persistencia-remota 13
```
Prova em disco e no navegador:
- `POST /api/projetos` → `.data/arqdor/projetos.json` com o documento v2;
- desenho no editor → autosave → arquivo com `solidos=1, verts=4, faces=1`;
- **F5** → geometria volta do servidor; dashboard lista o projeto real (não os exemplos);
- adaptador de arquivo testado com segunda instância lendo o mesmo caminho (prova de disco, não memória).

## Para apontar ao Supabase oficial
Basta definir `DATABASE_URL` no ambiente do app; nenhum código muda. A tabela precisa existir:
```sql
CREATE TABLE IF NOT EXISTS arqdor_projetos (
  id text PRIMARY KEY,
  nome text NOT NULL,
  versao integer NOT NULL,
  documento jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
```
(ou `pnpm drizzle-kit push` com o schema do `src/lib/db/schema.ts`)

## Pendências
- Migração `drizzle-kit` não gerada neste lote (SQL acima cobre).
- Sem `DATABASE_URL` neste ambiente: o caminho Postgres está codado e compila, mas **não foi executado** contra um banco real. Status honesto: validado no adaptador de arquivo; Postgres implementado, não exercitado.
- Concorrência/otimistic lock entre duas abas: não implementado.