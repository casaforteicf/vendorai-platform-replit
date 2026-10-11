# MULTI-04.3 — revisão de validação da rota (11/10/2026)

PR #3487, em rascunho. Rota criada, mas **não montada no roteador principal** e **flag desligada**.

Foi substituída a validação permissiva de geometria por campos estritos e limites de número, tamanho e tipos, conforme o schema existente de salas e aberturas do Arqdor. Testes de validação foram escritos, mas ainda não executados.

Bloqueios: conferir autenticação real e proibir JWT de pré-projeto convidado; evitar `as any` na rota; implementar limite HTTP de payload independente de Content-Length; executar TypeScript, Vitest e SQL de concorrência/rollback isolado; revisar imutabilidade das revisões do autosave antigo; verificar migração e auditoria antes de habilitar endpoint e integrar o editor. Nenhum deploy ou alteração de banco oficial.
