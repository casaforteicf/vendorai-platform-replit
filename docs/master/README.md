# Registro Mestre de Melhorias — MASTER-20261010

Este lote cria **somente rastreabilidade** do escopo aprovado. Não implementa as funcionalidades listadas, não homologa e não publica. Cada item requer evidência técnica separada.

- `improvements-registry.json`: inventário estruturado por ID, módulo, status, homologação, produção e referência quando conhecida.
- `node scripts/validate-master-improvements.cjs`: valida integridade local sem dependências externas.

Status `verification_required` significa **desconhecido/necessita auditoria**, não significa código ausente. `code_in_pr` significa código proposto, não homologado. A coluna de produção inicia `not_verified` por cautela. Nunca automatizar publicação baseado apenas neste inventário.

**Próxima fase:** conciliar este inventário com o Registro Mestre histórico, commits, branches e releases; então dividir os requisitos em lotes executáveis com critérios de aceite e PRs distintos. Preservar a política de não fazer merge/deploy sem a etapa de homologação e publicação autorizada.
