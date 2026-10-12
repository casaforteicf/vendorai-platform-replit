# MULTI-04.7 — Testes PostgreSQL em duas sessões

Arquivo: `tests/multi04-pg-concurrency.mjs`, no PR #3487 (draft).

O teste requer **PostgreSQL real e descartável** em localhost, com uma base cujo nome contenha `test`, `scratch`, `disposable` ou `isolated`. A checagem do host evita conexões remotas, mas ainda assim a URL precisa ser avaliada pelo operador antes de rodar.

Exemplo com base local autorizada e previamente criada:

```bash
MULTI04_TEST_DATABASE_URL='postgres://test_user:senha@127.0.0.1:5432/vendorai_isolated_test' node tests/multi04-pg-concurrency.mjs
```

O script cria uma tabela própria com nome temporário, abre dois clientes, demonstra bloqueio por `FOR UPDATE`, rejeita uma escrita com revisão obsoleta, demonstra `ROLLBACK` de alterações e de registro de auditoria e exclui a tabela de teste ao final. **Não testa a rota de restauração nem a implementação completa com Drizzle**.

### Limites
- Código de teste preparado, **não executado** nesta etapa (sem acesso validado a Postgres isolado; ferramenta de terminal remoto indisponível por limite de uso).
- Não usar o banco oficial nem conectar em bancos externos. Risco remanescente: rodar em um serviço local que na realidade encaminha conexões à produção; confirmar infraestrutura antes de executar.
- Antes de habilitar o recurso: validar estrutura de timestamp, tipos do schema, revogação de tokens e concorrência com autosave legado. O autosave PATCH anterior não usa CAS, portanto ainda pode sobrepor uma restauração posterior. Essa lacuna impede homologação.
- PR draft; sem merge, deploy ou migração.
