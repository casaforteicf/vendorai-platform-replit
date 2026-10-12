# Critérios de segurança do OAuth de calendários

Status: pendente de implementação e validação.

1. O estado retornado pelo provedor deve ser autenticado e possuir validade curta.
2. Vincular a solicitação à empresa, agenda e identidade que iniciou a conexão.
3. Impedir reutilização do estado consumido, inclusive em requisições simultâneas.
4. Rejeitar estados ausentes, adulterados, vencidos e associados a outra sessão.
5. Não gravar credenciais externas antes de validar toda a autorização.
6. Manter destinos de retorno em lista explícita.
7. Adicionar testes de sucesso, expiração, adulteração, concorrência, tenant diferente e usuário não administrador.
8. Realizar testes reais e homologação antes de habilitar em produção.

A implementação do estado assinado não foi registrada nesta rodada devido ao bloqueio da ferramenta de escrita. O OAuth atual não deve ser declarado homologado.
