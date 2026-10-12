# MULTI-04.16 — Arquivo de backup verificado na resolução de conflitos

Implementação criada em PR #3487 (draft):

- `arqdorVerifiedConflictFile.ts` calcula SHA-256 do rascunho e exige correspondência com a identidade de backup, tenant/projeto/revisão e senha.
- `ArqdorConflictReview.tsx` agora pede um arquivo escolhido pelo usuário e senha; só libera a ação de prosseguir após descriptografar e comparar os dados desse arquivo com o rascunho. Removeu a dependência exclusiva de um callback de confirmação arbitrária.
- `arqdorVerifiedConflictFile.test.ts` cobre correspondência e divergências (ainda não executado).

**Bloqueios de ativação:** o painel ainda não está montado no editor principal; revisar revalidação da versão remota imediatamente antes de qualquer descarte. O recibo em memória não comprova que o arquivo continuará disponível após o usuário sair, nem substitui exportação em outro dispositivo. Testes completos em navegador, CI e banco isolado pendentes. Backend continua com writers legados sem revisão CAS obrigatória. Nenhum deploy, migração ou merge.
