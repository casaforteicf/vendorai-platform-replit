# LOTE 06 — Obras, Execução, Assistência e Pós-venda

Versão de desenvolvimento: `v2026.10.10-lote06.1`. Branch isolada, sem merge ou publicação.

## Inventário de 30 sublotes

| Sublotes | Domínio | Evidência / situação |
| --- | --- | --- |
| 06.01–06.02 | Pipeline e transição comercial → execução | Pipeline configurável existente; integrar contrato e auditoria |
| 06.03–06.04 | Lotes parciais, quantidades e saldo | Núcleo puro `partial_execution.ts` incluído nesta versão; persistência transacional pendente |
| 06.05–06.07 | Cronograma, diário e equipe | Auditoria funcional e integração pendentes |
| 06.08–06.11 | Checklists de instalação, transporte, medidas e segmentos | Motor de checklists existente; validar personalização e evidências |
| 06.12–06.19 | OS modular, atividades e colaboração cliente/equipe/IA | Apoiar-se na OS digital e fluxo de assistência existentes; completar a issue #3119 |
| 06.20–06.23 | Anexos, relatório, assinatura e cópias | Integração e validação pendentes |
| 06.24–06.28 | Garantia, satisfação, retrabalho, portal e avisos | Integração e validação pendentes |
| 06.29–06.30 | Custos reais e auditoria | Implementação e validação pendentes |

## Regras críticas de 06.03/06.04

- Cada item do contrato tem identidade estável e unidade de medida explícita.
- Um negócio pode gerar N lotes de execução, com subconjuntos de itens, grupos e ambientes.
- Reservado, em andamento e concluído consomem o saldo disponível; cancelado libera a reserva.
- Quantidade contratada nunca é substituída por quantidade executada.
- Backend deve validar e gravar sob transação, lock por item e idempotência por tenant/negócio/chave, impedindo corrida entre duas solicitações simultâneas.
- Cancelamento de lote já concluído exige procedimento formal de estorno, sem apagar evidências históricas.
- Testes de isolamento multi-tenant, concorrência, reprocessamento e auditoria são necessários antes da homologação.
- Anexos, notificações e histórico devem preservar autorização e visibilidade por usuário e tenant.

## Dependências já identificadas

- #3119: OS modular e histórico integrado.
- #2805: motor de checklist operacional.
- PRs #3105, #3145 e #3165: código existente; não duplicar funcionalidades.

Esta versão não representa conclusão dos 30 sublotes nem aprovação para produção.

## Entrega complementar na mesma branch — 10/10/2026

- `lib/db/migrations/202610101230_execution_lots.sql`: tabelas de lotes, itens de cada lote e trilha de eventos, índice único de idempotência e restrições de quantidade.
- `artifacts/api-server/src/services/execution_lots.ts`: transação com `SELECT ... FOR UPDATE` no negócio, proposta aceita consultada no banco oficial, reserva segura e evento de auditoria.
- A chave do item é o índice do item na proposta aceita (`0`, `1`, ...). A proposta deve ser imutável após aceitação; verificar esse contrato funcional antes de habilitar.
- **Ainda pendente:** acesso autenticado por API, política de mudança de status, estornos auditados, tela e testes de integração no banco. Não aplicar migration em produção.
- **Validações:** GitHub Actions reportou `startup_failure` nos commits inspecionados; isso não equivale a teste passando. Build local e testes de integração não executados nesta conversa.

## Continuação da versão (13h26, horário de Brasília)

- `GET /execution-lots/deals/:dealId/proposals/:proposalId`: consulta lotes, alocações e saldos.
- `POST /execution-lots/deals/:dealId/lots/:lotId/status`: avança/cancela lote dentro do escopo autenticado.
- `execution_lot_lifecycle.test.ts`: testes declarativos de transições; execução não confirmada.
- **Bloqueadores de homologação:** conferir autorização granular de perfis e representantes; garantir imutabilidade do snapshot da proposta aceita; permitir concluir parcialmente por item e validar consistência de status; teste de concorrência/idempotência real no PostgreSQL; aplicar migration apenas em homologação.
- **Governança:** não houve merge ou publicação neste lote.

## Incremento de progresso quantitativo — 10/10/2026

- Migração `202610101330_execution_item_progress.sql` adicionada para diferenciar quantidade reservada de quantidade concluída em cada item.
- Função pura `validateCompletedQuantity` e seus testes foram registrados.
- A persistência do progresso por item e sua integração com o router **não foram concluídas**, pois a operação de gravação do serviço foi bloqueada.
- O cálculo atual de saldo ainda precisa ser reconciliado com `completed_quantity`. Não publicar nem marcar 06.04 como concluído antes de testes de concorrência, estorno, mudança de status e compatibilidade de propostas aceitas.
