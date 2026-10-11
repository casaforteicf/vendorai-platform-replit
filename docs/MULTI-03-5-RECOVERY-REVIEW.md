# MULTI-03.5 — Revisão de conflitos antes de restaurar

**PR:** #3487. **Status:** código em draft, testes não executados, não habilitado em produção.

## Entrega
- `arqdorRecoveryReview.ts`: avaliação pura de escopo e revisão, estados `denied`, `conflict` e `review`.
- `arqdorRecoveryReview.test.ts`: testes de revisão correspondente, divergente e bloqueio entre tenants/projetos.
- `ArqdorRecoveryPanel.tsx`: requer `verifiedRemoteProject` fornecido pela integração autorizada e verifica o conflito ao importar e imediatamente antes de encaminhar ao callback de revisão.

## Condições para ativação
1. A integração com o editor deve obter a revisão remota mais atual e a autorização do backend; o estado React não é fonte de autorização.
2. A comparação no frontend é somente aviso/gate de UX, não substitui escrita com CAS/ETag/If-Match transacional no backend.
3. O callback de revisão não deve persistir alterações. Qualquer commit final deve exigir confirmação e revalidação no servidor, preservando a versão anterior e auditoria.
4. Não montar painel no editor público do convidado; não habilitar flag antes de revisão de autorização.
5. Executar Vitest, typecheck, testes no navegador com arquivos grandes, sessão revogada e conflito simultâneo. Validar o PR antes de qualquer merge.
