# UI-01.8 — Continuidade Web, Mobile e Desktop

Issue #3452 · PR #3453 · Versão UI-01.8

## Implementado nesta etapa
- Contrato TypeScript `projectContinuity.ts`: identidade do projeto, revisão, contexto, superfícies e capacidades.
- Filtro declarativo de funcionalidades por ambiente e conectividade.
- Avaliação de alterações locais por ID de operação e revisão-base com resultado `eligible`, `conflict` ou `denied`.
- Testes unitários `projectContinuity.test.ts`.

**Atenção:** `eligible` NÃO significa sincronização autorizada. O servidor deverá validar sessão, membership, tenant, revision atual e idempotência antes de gravar. Contrato declarativo não comprova funcionamento offline; não há armazenamento local, empacotamento desktop ou sincronizador implementados.

## Experiência única
1. Link público `/projeto/:slug` abre pré-projeto básico, sem exigir instalação.
2. Após comprovação de titularidade e associação à conta (UI-01.7 pendente), a pessoa acessará o mesmo projeto em web/app.
3. Desktop: ferramentas técnicas e persistência local somente após motor offline efetivo.
4. Mobile: pré-projeto simplificado, mensagens, propostas, pagamentos e execução; modelagem profissional pesada preferencialmente desktop.
5. As permissões de projeto e as capacidades contratadas são recebidas da API autenticada; UI nunca gera permissões.

## Próximas implementações
- Persistência de rascunhos locais em armazenamento apropriado por plataforma e versão.
- Sincronizador idempotente com resolução de conflitos, trilha de auditoria e proteção de dados no dispositivo.
- Empacotamento instalável (estudar Tauri e PWA), atualização segura e autenticação.
- API de membros do projeto e transferência validada de rascunho público.
- Testes de rede instável, dispositivos compartilhados, logout, revogação e multi-tenant.

## Entrega e segurança
Sem mudança de rotas ou interface ativa nesta etapa. Sem merge, deploy, cobrança, split ou publicação. Executar testes e typecheck antes de declarar homologação.
