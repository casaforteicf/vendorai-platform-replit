# Matriz inicial de aceite — Vendor.ai — frente F07

Data: 13/10/2026. Fontes GitHub: #3468 (Onda 01, 51 IDs), #3466 (Onda 03, 77 IDs), #3435 (AGENT-01). **Índice de critérios por área; não substitui nem recataloga os 51 IDs da Onda 01 ou os 77 IDs da Onda 03.** Uma futura auditoria fará conciliação ID por ID, com deduplicação por requisito e vínculo explícito à evidência.

| ID | Área | Critério de aceite verificável | Referência inicial | Situação |
|---|---|---|---|---|
| F07-01 | CRM/negócios | Qualificar cliente PF/PJ, responsáveis, funil, transferências e revisão de histórico sem perda ou duplicidade | #3468 | NÃO HOMOLOGADO NESTA AUDITORIA |
| F07-02 | Agenda e atividades | Responsável, prazo e automações por etapa; sem disparo duplicado | #3468 | NÃO HOMOLOGADO NESTA AUDITORIA |
| F07-03 | TAD e navegação | Entrar, acessar módulo autorizado, retornar e retomar contexto com permissões | #3506 | NÃO HOMOLOGADO NESTA AUDITORIA |
| F07-04 | Agentes IA / suporte | Configuração segura, idempotência, opt-in, execução e evidência de rotinas; AGENT-01 não está ativo | #3435 | NÃO HOMOLOGADO NESTA AUDITORIA |
| F07-05 | Obras/execução | Transferência parcial por itens/fases, diário e registro de aceite preservando saldo | Inventário de código pendente | NÃO HOMOLOGADO NESTA AUDITORIA |
| F07-06 | Omnichannel | Associar mensagens e e-mails ao cliente/lead sem vazamento entre tenants | Inventário de código pendente | NÃO HOMOLOGADO NESTA AUDITORIA |
| F07-07 | Marketing e marketplace | Permissões, cotação, comissões e trilha auditável de eventos | Inventário de código pendente | NÃO HOMOLOGADO NESTA AUDITORIA |
| F07-08 | ERP e financeiro | Orçamentos, recebimentos parciais, propostas versionadas e permissões monetárias | Inventário de código pendente | NÃO HOMOLOGADO NESTA AUDITORIA |
| F07-09 | Conexões e onboarding | Fluxos OAuth/IMAP, estados reconexão, wizard e isolamento de credenciais | Inventário de código pendente | NÃO HOMOLOGADO NESTA AUDITORIA |
| F07-10 | E2E por tenant | Autenticar diferentes papéis/tenants; testar fluxo principal de ponta a ponta | #3468 | NÃO HOMOLOGADO NESTA AUDITORIA |

## Condições para avançar
- Confrontar cada item com arquivos/contratos/rotas reais e tabelas de mapeamento preexistentes, sem afirmar que está ausente ou implementado sem leitura de código.
- Designar dono por lote e branch; atualizar SHA, testes, tenant/usuário de ensaio, screenshot/trace e flag.
- Preservar integrações já publicadas; PR drafts e testes em descrição não são prova de produção.
- O estado informado acima significa **ausência de evidência de homologação nesta auditoria**, não reprovação ou ausência de código.
- Nenhuma migration, credencial, deploy ou alteração de produção incluídos.
