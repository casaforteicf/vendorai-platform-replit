# Vendi Tenant Studio — piloto Casa Forte

Status: proposta técnica; **não implementado / não liberado em produção**.
Escopo: permitir personalizações de cada tenant sem alterar a base compartilhada de outros clientes.

## Descoberta obrigatória
- Resolver a identidade real do tenant Casa Forte por consulta autenticada à tabela/API de tenants. A chave tentativa `casaforteicf` retornou `tenant_not_found` no Browser Agent (24/10/2026).
- Inspecionar rotas, tabelas de permissões, tenant resolver, Vendi missions, UI do menu e processo de homologação existentes antes de criar migrations.
- Confirmar políticas de RLS e contexto autenticado do tenant com dois tenants reais de teste.

## Etapa 1: Meu Sistema > Personalizar com Vendi
- Entrada apenas para usuários autenticados com papel `tenant_admin` ou permissão explícita `tenant.customize`.
- Interface de conversa, catálogo de solicitações, histórico, status e prévia de mudanças.
- Primeira versão permite: identidade visual, opções de menus, campos configuráveis, relatórios e automações já suportadas pela plataforma.
- Nunca aceitar `tenantId` enviado pelo cliente como autoridade; derivar tenant do contexto de sessão verificado no servidor.
- Todos os recursos persistidos com `tenant_id`, controle de acesso em consultas/mutações e trilha de auditoria.

## Etapa 2: Solicitações de código
- Mudanças de código não são aplicadas diretamente por tenant no monorepo compartilhado nem em produção.
- Cada solicitação produz artefato versionado e teste em sandbox isolado; revisões/PRs verificam dependências, permissões, migrações, segurança e compatibilidade entre tenants.
- Extensões por tenant por feature flag, configuração e registro de componentes; nenhuma execução arbitrária de JS/SQL/CSS fornecido por usuário privilegiado no servidor.
- Publicação apenas após verificação automatizada de isolamento, saúde e rollback, e autorização no escopo do tenant.
- Alterações globais do core sempre sob governança do Superadmin.

## Testes mínimos de aceitação
1. Admin Casa Forte cria configuração e a lê; outro tenant não pode ver nem mudar, mesmo trocando IDs na URL/corpo.
2. Usuário comum Casa Forte não consegue publicar nem criar mudanças privilegiadas.
3. Mudança de configuração Casa Forte não muda UI, API, dados ou pipelines de outro tenant.
4. Solicitacão de código entra em revisão e nunca dispara deploy compartilhado automaticamente.
5. Logs registram autor, tenant, origem, diffs, aprovação, versão implantada e rollback.
6. Falha em testes impede publicação; rollback retorna ao estado anterior do tenant.

## Critérios de entrega
- Resolver tenant ID real, mapear modelos/rotas existentes, implementar permissão no backend e UI, tests de isolamento e testes E2E, validar em homologação.
- Evidenciar commit, PR, resultados de testes e publicação específica antes de chamar a funcionalidade de pronta.
