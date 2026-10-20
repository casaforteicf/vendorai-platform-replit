# UX-UNIFY-01 — Ações únicas e ambientes por vertical

Estado: especificação técnica inicial, sem mudança de produção. Data: 2026-10-20.

## Regra
Uma intenção do usuário deve ter uma ação principal. Múltiplas telas e motores existentes podem atender à mesma ação; não eliminar serviços nem dados por nomes semelhantes.

## Matriz de consolidação

| Intenção | Acesso principal | Atalhos contextuais | Proteção |
|---|---|---|---|
| Encontrar pessoa, empresa ou negócio | CRM / busca | Comercial, Prospector | Manter entidades e papéis separados |
| Prospectar | CRM / Prospector | Comercial, Marketing | Conversão explícita de prospect em lead |
| Criar orçamento e proposta | Comercial / Nova proposta | CRM, catálogo, Arqdor | Versões, composições e histórico |
| Iniciar execução | Operações / Nova operação | Negócio, pedido | Fluxo específico por vertical: obra, produção, serviços, hotelaria |
| Consultar Biblioteca da Empresa | Marketing / Biblioteca | CRM, Comercial, Arqdor, Operações, IA | Uma fonte de arquivos, filtros e permissões contextuais |
| Contatar cliente | Omnichannel / Conversas | CRM, Operações, Comercial | Histórico unificado por vínculo |
| Criar atividade | Agenda / Nova atividade | Todos os ambientes | Responsável, prazo, sem duplicação |
| Acionar IA | IA Hub / Assistentes | Cada ambiente | Um lançador, agentes especializados |
| Gerenciar Portal do Cliente | Cliente, negócio, pedido ou operação / Portal | Operações, Comercial, Arqdor | Portal canônico e token/permissões validados |
| Consultar financeiro | ERP / Financeiro | Comercial, Operações | Segregar custos, saldos e comissões |
| Operar marketplace | Praça.ai | Comercial, Operações | Vitrine, cotação e gestão sem duplicar pedidos |
| Suporte | Ajuda / Suporte | Todos | Distinguir ajuda de OS e assistência técnica |

## Navegação final
- Início: Central de Ambientes com favoritos e retomada. Só mostrar módulos habilitados, autorizados e adequados à audiência.
- Ambientes: CRM, Comercial, Operações, ERP, Marketing, IA Hub, Inteligência, Arqdor, Praça.ai. Ordenação e visibilidade dependem do tenant/vertical/plano/papel.
- Sidebar contextual: mostrar funções do ambiente atual, com retorno claro para Início.
- Operações: nome genérico do ambiente, mas rotinas internas variam por vertical. Não renomear rotas técnicas até mapear dependências.
- Biblioteca: entrada primária em Marketing e seleção contextual nas outras áreas, sem duplicar armazenamento.
- Portal: experiência externa do cliente separada da administração interna; manter links válidos.
- Botões legados: migrar para a ação canônica por adaptadores; só remover UI duplicada após testes, mantendo deep links durante transição.

## Inventário exigido antes de mexer na interface
Para toda rota, ação, botão ou flag registrar: ID, tela, intenção, handler/API, condição de visibilidade, permissão, vertical, estado verificado em produção, substituto canônico, dependências e teste.
Classificação: operante e visível; operante mas escondido; oculto por permissão; sem rota do lançador; mock/incompleto; erro confirmado; duplicado apenas na apresentação.

## Evidências consultadas em 20/10/2026
- adaptiveModuleLauncher.ts: PDV, Parceiros e Portal do Cliente têm rota de lançador nula; isso não demonstra que não existam em outros fluxos.
- TadCentralRoute.tsx: interseção entre módulos habilitados e permitidos; erro de verificação oculta acessos com segurança.
- UnifiedAssistantLauncher.tsx: oculta intencionalmente launchers originais de JARVIS, Marketing IA e Dev IA para unificar o acesso; verificar se novo launcher funciona em desktop e mobile.
- Issues existentes: #3052 (portal), #3529 (navegação), #3452 (unificação), #2763 (UI 2.0), #3570/#3572 (P0 API/pipeline), #1764 (estabilização).

## Entrega em etapas
1. Inventariar rotas, botões, feature flags e autorizações com comparação à produção e SHA.
2. Resolver P0 comprovados antes de modificar fluxos.
3. Criar catálogo tipado de ações canônicas com testes de permissão.
4. Alterar UI para uma ação primária e atalhos contextuais. Preservar implementações legadas.
5. Implementar navegação por vertical com feature flag desativada por padrão.
6. Validar Portal e Biblioteca com adaptadores e vínculos canônicos.
7. Executar testes de criar/editar/salvar/recarregar/reabrir, mobile/desktop, diferentes tenants e papéis.
8. Homologar, verificar build/typecheck/migrations, registrar SHA e rollback, solicitar aprovação de publicação.

Este documento é o ponto inicial do trabalho; não afirma que os fluxos foram integrados, testados ou publicados.
