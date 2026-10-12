# Auditoria Lote UI20 — Agenda e escopo (2026-10-11)

## Achado e correção
A rota `GET /tenants/:tenantId/agendamentos` referenciava `tenantId` sem declará-lo no handler. Nesta branch foi acrescentada a leitura explícita do parâmetro e uma verificação de mesma empresa para usuários não superadmin.

A regra de leitura de agenda foi alterada: administradores tenant/superadmin podem consultar a equipe; qualquer usuário não administrador somente os compromissos com `responsavelId === req.user.sub`. Identidade ausente é recusada.

## Impacto a homologar
- Revisar fluxos legítimos de agenda compartilhada para funcionários não administradores: se houver concessões explícitas por agenda, precisarão de uma política dedicada, não de liberação ampla.
- Confirmar que o middleware de autenticação define `req.user.sub` em todos os caminhos.
- Verificar GET por ID, slots e endpoints de criação/alteração/exclusão separadamente: **não estão cobertos por esta correção**.
- Validar isolamento A/B entre tenants, admin vs vendedor vs suporte e conta sem responsável.
- Executar testes de TypeScript/API e E2E. **Nenhum teste foi executado nesta sessão.**
- Não publicar nem fazer merge sem validação e homologação.
