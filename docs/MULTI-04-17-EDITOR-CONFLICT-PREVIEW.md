# MULTI-04.17 — Prévia segura de conflitos no editor

PR #3487, flag `VITE_MULTI04_REVISION_AUTOSAVE` desativada por padrão.

Quando o salvamento condicional recebe HTTP 409, o editor `ConceptPlanner` interrompe gravações, tenta consultar a revisão atual autorizada do mesmo projeto e mostra uma prévia somente leitura das diferenças de `rooms`, `openingOverrides` e `configuration`. Se a busca falhar, mantém o bloqueio e informa que não foi possível comparar.

O editor não sobrepõe a versão do servidor, não atualiza automaticamente a geometria local e não inicia restauração. A comparação é apenas uma lista limitada de caminhos de campos, sem dif visual 2D/3D.

### Próximos gates
- Não está integrado o `ArqdorConflictReview` com backup criptografado confirmado ao estado completo do editor, porque falta construir um `LocalDraft` com escopo de sessão autorizado e persistência real da cópia.
- A prévia usa a foto do payload capturada no momento da tentativa; edições feitas depois do erro podem não aparecer nessa prévia.
- Todos os endpoints legados que escrevem no mesmo projeto precisam ser auditados para CAS.
- Testar typecheck, Vitest, navegação, autosave concorrente, expiração da sessão, rede offline e render. Nenhum teste foi executado nesta etapa.
- Sem merge, deploy, migração ou ativação da flag em produção.
