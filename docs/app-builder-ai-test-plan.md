# Plano de validação ponta a ponta — App Builder + Arquiteto IA

## Fluxo principal

1. Selecionar um app de tenant existente.
2. Abrir Arquiteto IA em modo profundo.
3. Solicitar revisão completa do app.
4. Conferir arquitetura, papéis, dados, integrações, gaps e scores.
5. Confirmar que qualquer incompatibilidade de registry aparece como finding.
6. Aplicar somente quando `validation.ok = true`.
7. Verificar criação de nova Template Version em rascunho.
8. Abrir Preview e validar navegação desktop/tablet/mobile.
9. Publicar somente por ação humana após revisão.

## Fluxo pré-tenant

1. Criar app como Prospect ou Interno.
2. Executar Arquiteto IA com contexto do projeto.
3. Construir e versionar o app.
4. Confirmar que runtime operacional e usuários externos continuam bloqueados.
5. Vincular o projeto a um tenant real.
6. Confirmar preservação do histórico e dos snapshots.
7. Revisar novamente com IA no contexto do tenant e só então publicar.

## Casos de falha obrigatórios

- Action inexistente no registry.
- `defaultPageId` apontando para página inexistente.
- IDs de página duplicados.
- Tipo de bloco não suportado.
- JSON inválido vindo do modelo.
- Falha na segunda passagem: manter a primeira proposta e emitir warning, sem fingir revisão bem-sucedida.

Este plano deve ser usado em QA manual e convertido gradualmente em testes automatizados.