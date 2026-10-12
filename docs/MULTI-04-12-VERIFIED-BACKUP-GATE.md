# MULTI-04.12 — Verificação obrigatória de backup em conflito

O painel `ArqdorConflictReview` deixou de aceitar apenas checkbox para abandonar uma versão local. Agora exige callback `verifyEncryptedBackup`, que deve realizar a criação e a conferência de uma cópia realmente recuperável, devolvendo recibo associado ao projeto, revisão local, revisão remota e fingerprint do snapshot.

O botão de continuar com o servidor permanece inativo sem recibo compatível. Se falhar a verificação, nenhuma operação de descarte é encaminhada. A verificação ocorre novamente no clique.

## Limites para ativação
- O callback é uma **interface contratual**, ainda não implementado no editor. Nenhum backup durável está comprovado.
- A integração deve salvar backup criptografado e verificar leitura/decriptografia, preferencialmente com exportação confirmada pelo usuário ou armazenamento durável confiável. IndexedDB isolado não é backup confiável contra limpeza/evicção.
- A identidade e a fingerprint do snapshot devem ser calculadas a partir de conteúdo local real, não fornecidas livremente pelo usuário.
- O clique ainda não está integrado ao editor nem pode descartar alterações sem validação e comparação atualizada.
- Manter rollout desligado até typecheck, testes de interface, testes de recuperação ponta a ponta e homologação de perda/reconexão.

PR #3487 draft; testes escritos não executados; sem merge ou deploy.
