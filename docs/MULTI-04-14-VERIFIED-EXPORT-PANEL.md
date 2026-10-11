# MULTI-04.14 — Verificação ligada ao painel

A interface ArqdorRecoveryPanel passou a executar verifyRecoveryRoundTrip antes de preparar o arquivo de recuperação criptografado.

O teste verifica se o pacote gerado pode ser descriptografado com a senha e se o rascunho recuperado coincide com o original. Não comprova a gravação do arquivo no dispositivo.

Pendências: teste de download e reabertura em dispositivo real, confirmação de persistência antes de permitir descartar alterações, integração ao ConceptPlanner com escopo validado pelo servidor, testes automatizados executados e homologação.

PR #3487 permanece draft, sem merge e sem deploy.
