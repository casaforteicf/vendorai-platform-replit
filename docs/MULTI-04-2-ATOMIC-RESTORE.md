# MULTI-04.2 — Transação de restauração com histórico

## Entregue na branch (PR #3487, não publicado)
- Migração SQL para `arch_concept_restore_audit` com snapshot completo anterior, usuário executor, operação idempotente, versões e horário.
- `arqdor-recovery-transaction.ts`: seleciona projeto com lock `FOR UPDATE`, revalida tenant e titular, impede gravar projetos não-draft, compara updatedAt, registra snapshot e atualiza geometria na **mesma transação**; falha de qualquer etapa desfaz tudo.
- Reenvio do mesmo operationId retorna `already_applied` sem escrever de novo.

## Riscos / bloqueios obrigatórios
1. **Não aplicar migração ao banco oficial** antes de teste SQL isolado, backup e revisão de permissões.
2. Nenhuma rota usa esta função; revisão, autorização e validação de payload ainda precisam de endpoint autenticado específico. Não aceitar JSON arbitrário do arquivo de recuperação.
3. Atualização CAS por updatedAt precisa de teste em PostgreSQL real, inclusive precisão da coluna timestamp e concorrência com autosave legado (que ainda não usa CAS).
4. Testar rollback em falha de inserção de auditoria e concorrência com operações de upload/alterações de configuração.
5. Proibir leitura do snapshot por tenants/clientes não autorizados, definir retenção, tamanho máximo, auditoria e processo de reversão explícita.
6. Frontend só enviará operações aprovadas após comparar versões; backend será sempre autoridade final.
7. Typecheck/CI e testes transacionais ainda não executados; **não homologado**, sem merge nem deploy.

## Status
MULTI-04.2: código de infraestrutura criado; restauração de clientes segue desativada.
