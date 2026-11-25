# Etapa 1 — Critérios de segurança antes de ativar identidade global

## Verificado estaticamente (29/10/2026)
- `routes/public_proposals.ts`: registro e login consultam `customer_portal_users` por `tenant_id + lower(email)`. Sessão do portal também é validada contra o tenant.
- `202609282245_global_customer_portal.sql`: e-mails são únicos apenas dentro de cada tenant; a sessão pertence a um usuário legado.
- O schema novo da PR #3679 adiciona tabelas de identidade e vínculo, mas **não cria nem autentica contas globais**.

## Gate 1 — schema (ambiente isolado)
Executar a migration da PR em cópia restaurada; depois rodar `lib/db/tests/customer-global-identity-preflight.sql`. O teste somente lê catálogo e exige FORCE RLS, nenhuma política, nenhuma leitura do role da aplicação e vínculo íntegro. Não executar produção a partir desta PR.

## Gate 2 — serviço de identidade (pendente)
Desenvolver prova de posse do login legado com desafio de verificação, revogação e prevenção de takeover. E-mail equivalente **não** prova que duas contas antigas são da mesma pessoa. Não auto-vincular registros.

## Gate 3 — tenant/módulo (pendente)
Introduzir autenticação global separada da sessão de proposta legado, guardas por `identity + tenant membership + resource grant`, e testes de negação cruzada Tenant A↔B, inclusive Praça.ai comprador e ARQDOR.

## Gate 4 — rollout (pendente)
Feature flag desligada por padrão, migração aditiva e reversível na aplicação, piloto, logs sem dados sensíveis e backup verificado.

Nenhuma tela pode ser alterada sem autorização; zero redundância.
