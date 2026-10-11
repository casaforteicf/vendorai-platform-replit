# MULTI-03.6 — Handoff seguro de recuperação

PR #3487 (draft), sequência do MULTI-03.5.

## Implementado
- O painel `ArqdorRecoveryPanel.tsx` requer callback `fetchCurrentAuthorizedProject` para reler do backend a revisão atual antes de encaminhar um backup ao fluxo de revisão.
- `arqdorRecoveryHandoff.ts` aplica fail-closed: sem conexão, 403, erro no backend, retorno incompleto ou mudança de revisão, nenhuma restauração é autorizada para revisão.
- Testes Vitest em `arqdorRecoveryHandoff.test.ts` cobrem leitura fresca, concorrência e falhas remotas.

## Ainda não implementado
- O painel ainda não está montado no editor Arqdor.
- Não há endpoint de escrita atômica CAS/If-Match nem confirmação final integrada ao backend.
- Ainda não existe fluxo de edição de conflitos e comparação visual dos objetos do projeto.
- Não há testes executados/homologação. Este PR não autoriza produção.

## Critério obrigatório para a próxima etapa
A restauração real deve ser uma operação no backend, transacional e autorizada. Receber revisão esperada, revalidar membro e escopo, verificar versão atual sob lock ou update condicional, preservar snapshot anterior, registrar idempotência e auditoria, aceitar apenas schema de projeto validado e rejeitar conflitos HTTP 409. O frontend nunca define sozinho uma gravação segura.
