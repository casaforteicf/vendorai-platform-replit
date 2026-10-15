# Matriz inicial de aceite — Infraestrutura e qualidade — frente F08

Data: 13/10/2026. Fontes GitHub: #3490 (VENDI executor), #3445 (classificador), #3468 (gates), #3512 (protocolo). **Índice de critérios por área; não substitui nem recataloga os 51 IDs da Onda 01 ou os 77 IDs da Onda 03.** Uma futura auditoria fará conciliação ID por ID, com deduplicação por requisito e vínculo explícito à evidência.

| ID | Área | Critério de aceite verificável | Referência inicial | Situação |
|---|---|---|---|---|
| F08-01 | Baseline e gates | pnpm, libs, tsc backend, build API, Vite, orçamento e testes com SHA e logs reais | #3468 | NÃO HOMOLOGADO NESTA AUDITORIA |
| F08-02 | Detecção de regressões | Diferença completa main/branch de diagnósticos TS e testes de consumidores sem mascarar erros | #3512 | NÃO HOMOLOGADO NESTA AUDITORIA |
| F08-03 | Homologação Contabo | Validar SHA candidato isolado, navegador, RBAC e saúde efetiva antes da ativação | #3490 | NÃO HOMOLOGADO NESTA AUDITORIA |
| F08-04 | Deploy seguro | Merge autorizado, cron identificado, frontend/backend no release correto e rollback recuperável | CLAUDE.md | NÃO HOMOLOGADO NESTA AUDITORIA |
| F08-05 | Observabilidade | Logs sem segredos, trace de falha, custo de IA e alertas confiáveis | #3445 | NÃO HOMOLOGADO NESTA AUDITORIA |
| F08-06 | Segurança de operador | Privilégio mínimo, grants read-only, 401/403, timeout e auditoria | #3490 | NÃO HOMOLOGADO NESTA AUDITORIA |
| F08-07 | Armazenamento R2 | Leitura/gravação/autorização sem regressão em arquivos já migrados | CLAUDE.md | NÃO HOMOLOGADO NESTA AUDITORIA |
| F08-08 | Migrations Supabase | Revisão, aprovação, aplicação idempotente, confirmação de estado e plano de recuperação | Protocolo de agentes | NÃO HOMOLOGADO NESTA AUDITORIA |
| F08-09 | Offline e conflitos | Testar retomada, sincronização e concorrência sem perda/duplicação | Inventário de código pendente | NÃO HOMOLOGADO NESTA AUDITORIA |
| F08-10 | E2E e captura visual | Playwright com fluxos reais, screenshot/trace, dispositivo e SHA | #3512 | NÃO HOMOLOGADO NESTA AUDITORIA |

## Condições para avançar
- Confrontar cada item com arquivos/contratos/rotas reais e tabelas de mapeamento preexistentes, sem afirmar que está ausente ou implementado sem leitura de código.
- Designar dono por lote e branch; atualizar SHA, testes, tenant/usuário de ensaio, screenshot/trace e flag.
- Preservar integrações já publicadas; PR drafts e testes em descrição não são prova de produção.
- O estado informado acima significa **ausência de evidência de homologação nesta auditoria**, não reprovação ou ausência de código.
- Nenhuma migration, credencial, deploy ou alteração de produção incluídos.
