# VC-001 — Plataforma Central: Hub e navegação por módulo
**Situação:** revisão funcional iniciada; proposta para discussão, **não aprovada para implementação**.
**Programa:** PR #3624.
## Evidência real do repositório (main c713d1cc)
- Frontend principal em `artifacts/frontend/src/`, com `App.tsx`, `AppLegacy.tsx`, `pages/app-runtime/AppRuntimeShell`.
- `App.tsx` usa carregamento lazy da aplicação legada e runtime; possui fallback para demora de carregamento e timeout de GETs. Requer diagnóstico de navegação efetiva sem concluir só pela leitura.
- `pages/Onboarding.tsx` possui wizard por etapas com empresa, WhatsApp, seleção/perfil de agente e plano/trial. Necessário confrontar o fluxo com as decisões de produto.
- `pages/OrganizacaoPainel.tsx` contém consultas a organizações, tenants e indicadores; validar autorização no servidor, sem inferir segurança a partir da UI.
- Diversos arquivos de página e versões legadas coexistem. Antes de remover qualquer uma, mapear rotas reais e dependências.
## Diretrizes de produto já estabelecidas
1. Início do Vendor.ai como seletor visual de sistemas: CRM, Marketing, ERP, IA, Praça.ai, Arqdor, Suporte, conforme habilitação.
2. Ao entrar em um módulo, o menu lateral mostra apenas as opções daquele módulo. Botão Início retorna à seleção geral.
3. Financeiro pertence ao ERP. Arqdor conserva visual dark premium próprio; Praça.ai conserva identidade de marketplace.
4. Suportar tema claro/escuro e identidade única desktop/mobile. Cartões podem trazer conteúdo real, não ações falsas.
## Escopo proposto
- Inventariar rotas, telas, cartões, menu contextual, permissões e funcionalidades por tenant.
- Definir informações dos cartões: título, imagem/ilustração autorizada, descrição, status do plano, CTA real e alertas úteis.
- Criar painel operacional opcional com itens recentes, notificações e atalhos, sempre filtrados por tenant/permissão.
- Buscar produtos/entidades com escopo correto; sem revelar módulos ou dados não autorizados.
- Criar critérios para vazio, carregando, erro e ações inacessíveis.
- Registrar referências visuais com origem, licença e marcação de 'inspiração' vs. tela real.
## Perguntas a decidir antes do código
A. Tela Início será somente hub de módulos ou combinará hub + indicadores/atividades?
B. Produto não contratado aparece como cartão explicativo ou fica oculto?
C. Quais conteúdos reais devem aparecer como prévia no cartão?
D. O Vendi terá ação fixa de assistente no topo da tela inicial?
## Critérios mínimos de aceite
- Entrar e sair de qualquer módulo autorizado sem perder contexto; sidebar apenas do módulo.
- Perfis e tenants diferentes não visualizam dados inadequados.
- Todos os CTA funcionam e têm feedback; nenhum botão mockado.
- Mobile e desktop homologados com capturas de tela.
- Sem regressão de CRM, ERP, Arqdor ou Praça.ai.
## Execução
Somente após decisões: criar Issue específica de implementação, branch/PR, testes de UI/tenant e homologação. Bloquear produção enquanto gates CI e Cloudflare estiverem inválidos.
