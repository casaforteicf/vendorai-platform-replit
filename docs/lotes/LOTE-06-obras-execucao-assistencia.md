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
