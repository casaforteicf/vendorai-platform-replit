# MULTI-03.4 — Interface de recuperação do Arqdor

PR #3487 · Commit 7c834b1 · Estado: componente isolado, não ativado no editor.

Foi criado `artifacts/frontend/src/pages/arch/ArqdorRecoveryPanel.tsx` para operações explícitas de exportação e leitura de pacotes de recuperação criptografados.

Contrato de integração obrigatório:
- O editor autenticado deve obter o escopo e autorização de projeto do backend, nunca somente dados da URL ou JWT de convidado.
- O editor fornece o rascunho correto e um callback `onReviewRestore` que abre comparação de revisões e confirmação. O componente não aplica mudanças.
- Não montar esta UI no fluxo público `/projeto/:slug` (identidade de convidado ainda exige handoff de titularidade).
- Não ativar com feature flag enquanto recuperação de sessão, grandes projetos, revogação de acesso e restauração real não forem homologadas.
- Limite provisório de 20 MB no pacote de importação, sem leitura prévia de payloads enormes.
- Exportação via arquivo protegido por senha; senha nunca persistida.
- Fluxos de IA, pagamentos, edições online e autorizações da API continuam exigindo conexão.

Ainda falta: ligação segura ao estado real do editor, confirmação de conflito, revisão visual e testes de integração automatizados e em navegadores.
Nenhum merge, deployment ou edição de dados de clientes foi realizado.
