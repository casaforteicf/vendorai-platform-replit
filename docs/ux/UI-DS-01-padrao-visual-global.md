# UI-DS-01 — Design System único Vendor.ai

Data: 2026-10-20 · **Padrão obrigatório proposto** · sem alteração de produção neste documento.

## Objetivo
Todas as páginas do Vendor.ai devem compartilhar tipografia, escala, cores, espaçamento, bordas, estados e comportamento de componentes. O padrão B+C (premium e produtivo + central de ambientes) é a direção unificada. Uma vertical pode alterar conteúdo e fluxo, não criar uma identidade fragmentada.

## Tokens de referência a consolidar com o tema real
- Fontes: Inter como principal para interface; IBM Plex Sans opcional apenas em superfícies técnicas existentes do Arqdor se já aprovado, mas nunca misturar arbitrariamente dentro da mesma página.
- Escala de tipografia: 12 px legenda/metadado; 14 px corpo compacto e controles; 16 px corpo destacado; 20 px subtítulo de página; 24 px título principal. Exceções por acessibilidade/zoom e breakpoints. Alturas de linha 1.4–1.6 nos parágrafos.
- Peso: 400 texto, 500 elementos de interface, 600 títulos. Evitar variações decorativas.
- Cor: superfícies predominantemente claras nas telas de produtividade, menu em grafite premium, azul como ação principal, roxo reservado para funcionalidades/estados IA; sem cor distinta por tela por conveniência. Estados semânticos de sucesso/alerta/erro/info com contraste WCAG AA.
- Espaçamento: grid de 4 px; 4/8/12/16/24/32 px. Radius: 8 px em inputs, 12 px em cards e 16 px em modais maiores, conforme tokens reais.
- Controles: alturas coerentes (36–40 px desktop, 44 px de área tocável no mobile); ícones 16–20 px, alinhamento consistente; estados hover/focus/disabled/loading/erro/sucesso.
- Densidade: adequada a CRM/ERP com tabelas compactas legíveis; mobile usa navegação contextual, ações prioritárias e listas em lugar de tabelas largas.
- Sem CSS global baseado em estrutura frágil ou display:none em botões essenciais; usar variantes semânticas e feature flags/autorizações explícitas.
- Identidade da empresa/tenant (logo e marca) pode surgir em pontos definidos, sem sobrescrever todo o design system.
- Portal externo: mesma linguagem visual, composição simplificada para cliente; Arqdor conserva ferramentas especializadas sem quebrar consistência de fonte/controles e navegação.

## Componentes canônicos
PageHeader; SectionHeader; AppShell; ContextSidebar; Button; IconButton; Input; Select; Search; DatePicker; Textarea; Dialog; Drawer; Tabs; Card; Badge; Table; DataGrid; EmptyState; ErrorState; LoadingState; Toast; FilePicker; AttachmentPicker; ActionMenu; ConfirmDialog.

Todos recebem regras fixas de estilo, teclado, foco, estados e responsividade. Proibido criar versões pontuais do mesmo componente sem justificativa documentada.

## Auditoria de conformidade
Inventariar todos os arquivos de página e componentes com classes CSS inline de cor/tamanho, estilos locais, fontes importadas, Tailwind e bibliotecas antigas. Para cada tela: contraste, escala tipográfica, botões, alinhamento, paddings, responsividade, acessibilidade, consistência de formulários, tabelas, estados e performance.

## Critérios de aceite
1. Uma tela referência aprovada (Central, CRM, Comercial) desktop + mobile.
2. Tokens tipados e componentes compartilhados presentes e aplicados sem alterar regras de negócio.
3. Testes visuais de regressão em todas as rotas habilitadas, incluindo estados loading/empty/error/modal.
4. WCAG AA em texto e controles principais, teclado e foco aparente.
5. Preservar permissões e APIs; não ocultar ações essenciais por CSS.
6. Nenhuma tela publicada com fonte, cor, tamanho ou componente divergente sem exceção aprovada.
7. Feature flag, controle de rollout, rollback, confirmação de SHA e testes reais antes de publicação.

## Execução incremental
(1) Auditoria visual e inventário. (2) Tokenização global sem remodelar produto. (3) Componentes canônicos. (4) Migração por ambientes, priorizando navegação/CRM/Comercial/Operações. (5) Mobile e portal externo. (6) QA visual e funcional E2E. (7) Publicar apenas mediante aprovação.

Referências existentes para reconciliar: issues #2763 (UI 2.0), #3452 (navegação), #3529 (sidebar contextual). Não duplicar implementações já integradas. 
