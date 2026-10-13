# MULTI-03 — Persistência IndexedDB criptografada

Adicionados `arqdorIndexedDraftStore.ts` e testes de escopo e falha segura.

- Operações: salvar, ler, listar IDs por escopo e excluir rascunhos cifrados.
- Índice por usuário, tenant, projeto, contexto e operação. Não realiza upload.
- Chave AES-GCM deve ser provida em sessão autorizada; não é salva no IndexedDB.
- Sem recuperação de chave entre sessões, os rascunhos podem ficar ilegíveis depois do logout.
- IndexedDB não equivale a backup; evicção e limpeza de dados continuam possíveis.
- Integração com o editor Arqdor, testes end-to-end, gestão de chaves, export/recuperação e sincronização seguem pendentes.
- Sem flag de ativação, merge ou deploy; testes não executados.
