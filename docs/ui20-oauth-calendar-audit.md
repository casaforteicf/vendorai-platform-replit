# Auditoria OAuth Google Agenda — UI 2.0

## Corrigido
- O callback só utiliza `returnTo` quando seu valor é `/agenda` ou `/configuracoes`; outros destinos são ignorados.
- `agendaId` ausente ou vazio invalida o state.

## Bloqueios críticos antes da homologação
- O `state` atual é apenas base64url de JSON, sem assinatura/nonce: não protege contra adulteração ou vinculação indevida de OAuth a uma agenda. Implementar e validar state assinado, de uso único, com prazo de validade e vinculado à sessão/usuário administrador que iniciou a conexão.
- Validar callbacks de falha, replay, cross-tenant e reconexão concorrente.
- Validar integração Scheduler e agentes que criam compromissos por fluxos internos. Não ampliar permissões de usuário para contornar bloqueios sem serviço delegado autenticado.
- As migrations 530/531 estão apenas no código, não aplicadas. Typecheck/build/testes automatizados não executados.

**Não publicar o lote até concluir estes bloqueios e homologar.**
