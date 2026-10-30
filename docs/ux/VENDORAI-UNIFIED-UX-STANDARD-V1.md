# Vendor.ai — padrão visual e UX unificado v1

**Status:** padrão aprovado para implementação incremental; primeira aplicação preparada em PR  
**Escopo:** sistema web autenticado e aplicativo mobile Vendor.ai  
**Data:** 29/10/2026

## Entrega inicial

A primeira aplicação atualiza os tokens centrais, o login, o launcher TAD, a identidade pública, os logos vetoriais e introduz `VendorBackButton` na Central de Operações do Vendi. As demais rotas autenticadas devem adotar os tokens e o componente compartilhado na sequência da auditoria; este PR estabelece a base e não declara a migração visual de todas as telas concluída.

## Objetivo

Fazer todos os módulos parecerem parte do mesmo produto e oferecer os mesmos padrões de navegação, leitura, interação, acessibilidade e resposta aos estados do sistema. O padrão unifica a experiência; não transforma todos os módulos em telas idênticas nem muda suas funções de negócio.

## Fonte visual única

A identidade de marca existente continua sendo a base:

- Tokens de marca: `lib/vendor-brand/src/tokens.ts`.
- Tokens CSS: `lib/vendor-brand/src/theme.css`.
- Primitivos de produto autenticado: `artifacts/frontend/src/components/ui`.
- Regras compartilhadas de página: `artifacts/frontend/src/ui-standard.css`.

Não criar uma segunda paleta, escala tipográfica ou kit de componentes. Antes de migrar telas, consolidar os valores concorrentes em `index.css`, `vendor-brand.css`, `vendorai-ui2.css`, `ui-standard.css` e folhas específicas. Remover duplicações e regras que dependam da ordem incidental dos imports ou de `!important`.

### Nova direção de cor

Remover o laranja da interface do Vendor.ai. Usar azul como cor primária a partir do azul já presente na paleta:

- Primária: `#2563EB`; ação/hover: `#1D4ED8`; superfície suave: `#EFF6FF`.
- Tema escuro: primária clara `#60A5FA`, com fundo e superfícies neutros azul-marinho.
- Sucesso, alerta e erro mantêm tokens semânticos próprios; não usam a cor primária.
- Inter para interface e operação; Rigter apenas em usos de marca aprovados; serif editorial só em conteúdo editorial.
- Claro e escuro compartilham os mesmos significados semânticos, estados e contraste.
- Remover laranja de botões, links ativos, foco, navegação, cartões, tela de login e cor de status-bar do app.
- Atualizar a marca Vendor.ai para a nova paleta usando os arquivos vetoriais oficiais, preservando desenho e proporções.

O azul parte do token informativo já existente. A migração deve mudar o significado desse token para primário de forma centralizada, sem deixar a cor antiga ou referências hardcoded em telas.

### Padrão único de retorno

Criar um componente compartilhado `VendorBackButton` para páginas internas:

- Rótulo visível “Voltar” com ícone de seta; área de toque mínima de 44 px; foco e nome acessível.
- Posição fixa no início do cabeçalho de conteúdo, antes do título. Não criar versões locais por módulo.
- Cada tela declara a rota-pai no componente; o botão sempre navega para esse destino explícito, inclusive quando a pessoa abriu a URL diretamente. Nunca depender de histórico vazio nem enviar para fora do produto.
- Manter contexto útil (filtros, busca, página e tenant) ao retornar.
- Para formulários com alterações não salvas, acionar a confirmação já padronizada antes de sair.
- Não exibir em páginas-raiz como `/tad`; usar breadcrumb em caminhos profundos, sem duplicar botão e breadcrumb.
- Em diálogos e drawers, “Fechar” continua fechando a camada atual; não deve imitar navegação de página.

O inventário de rotas deve identificar páginas de entrada, detalhe, edição, fluxo em etapas e páginas-raiz e registrar o destino de retorno esperado para cada uma.

## Contrato comum de interface

1. **Estrutura:** cabeçalho de página com título e descrição curta; ações principais agrupadas; conteúdo com largura, margens e ritmo vertical previsíveis.
2. **Navegação:** localização atual evidente, nomes consistentes entre menu e página, retorno previsível, atalhos acessíveis e nenhum módulo disponível escondido por diferenças visuais.
3. **Tipografia:** uma escala compacta para interface; hierarquia por tamanho e peso, sem títulos concorrentes para o mesmo nível.
4. **Componentes:** botões, campos, cartões, abas, tabelas, filtros, menus, diálogos e notificações usam os componentes comuns e seus estados documentados.
5. **Estados funcionais:** carregando, vazio, erro, sem permissão, desabilitado, salvo e concluído devem ser explícitos e não parecerem estados interativos equivalentes.
6. **Formulários e dados:** rótulos persistentes, erros junto ao campo, confirmação clara para ações destrutivas, tabelas com leitura móvel e ações identificáveis.
7. **Acessibilidade:** foco visível, navegação por teclado, contraste AA, alvos de toque de pelo menos 44 px e sem informação transmitida apenas por cor.
8. **Responsividade:** validar larguras de 360 px, 768 px e 1440 px; evitar conteúdo cortado e rolagem horizontal acidental.
9. **Conteúdo:** português brasileiro simples e consistente; usar o nome da ação que a pessoa entende, não o nome interno da implementação.
10. **Permissões:** esconder ou desabilitar controles não autorizados não substitui a validação no servidor.

## Variações controladas

- **Ferramentas de projeto 3D, vídeo e editores/canvas:** podem manter controles e área de trabalho especializados. Compartilham tipografia, acessibilidade, estados, navegação, botões, campos e tokens semânticos do produto; a área de desenho continua otimizada para sua tarefa.
- **Marca do tenant:** aplica-se apenas a superfícies white-label/co-branded previstas no produto. Não redefine a identidade do painel Vendor.ai.
- **Site público, autenticação e conteúdo gerado:** podem ter composição própria, mantendo logo, cores e fontes oficiais da marca Vendor.ai quando a superfície representar a plataforma.

## Diagnóstico inicial já observado

Na auditoria autenticada de `/tad`:

- A central inicial usa tema escuro com cartões multicoloridos; a Central de Operações do Vendi usa superfície clara.
- O cabeçalho identifica a conta como “Administrador”, enquanto o menu do Vendi mostra “SUPER ADMIN”.
- PDV, Parceiros e Portal do Cliente são apresentados como “Tela em integração”; a distinção visual precisa continuar legível como estado indisponível.
- A navegação para Vendi IA abriu `/vendi/operacoes` e mostrou 31 capacidades.
- A grade inicial mantém uma composição de três colunas no desktop e rolagem vertical para os demais módulos.

Essas diferenças devem ser tratadas no sistema compartilhado. Não se altera o conteúdo ou a disponibilidade dos módulos apenas para uniformizar a aparência.

## Sequência de adoção

### Fase 0 — Inventário e baseline

Catalogar rotas e telas ativas por módulo, tema, shell, componentes, estados, permissões, largura móvel, duplicação visual e dependências de CSS. Separar páginas reais de legado, rotas públicas, canvas especializados e páginas em integração.

### Fase 1 — Fundação

Consolidar tokens, tema claro/escuro, componentes compartilhados e navegação. Resolver colisões de CSS antes de adicionar novas exceções. Usar `/tad` e a Central de Operações do Vendi como piloto conjunto: corrigir a diferença de linguagem e os rótulos de perfil, sem mudar permissões nem ferramentas.

### Fase 2 — Módulos operacionais

Migrar CRM, Prospector, Marketing, Omnichannel, Agenda, ERP, Operações, Marketplace, Inteligência, Administração e Suporte. Cada migração deve usar componentes comuns, manter os fluxos existentes e ter comparação visual de desktop e móvel.

### Fase 3 — Áreas especializadas e mobile

Aplicar o contrato comum ao redor de canvas especializados, vídeo e construtores de sites; depois alinhar o aplicativo mobile aos mesmos tokens, estados e acessibilidade.

### Fase 4 — Fechamento

Percorrer cada rota ativa com perfis autorizados e dados de teste. Registrar evidência visual, navegação, foco, estados, responsividade e critérios funcionais. Nenhum módulo recebe status concluído só por importar tokens ou CSS.

## Critérios de aceite por tela

- Usa o shell, tokens, tipografia e componentes comuns corretos.
- Mantém os fluxos, dados e permissões atuais.
- Tem hierarquia e próxima ação claras.
- Exibe estados carregando, vazio e erro de forma verificável.
- Funciona por teclado e em 360/768/1440 px.
- Não apresenta conflitos de tema, texto cortado, controles ambíguos ou rolagem horizontal acidental.
- Tem antes/depois visual e evidência de validação registrada.
- Produção só muda no fluxo de publicação autorizado, depois dos gates e do aceite do conjunto correspondente.

## Regra de mudança

Executar por lotes pequenos e revisáveis, agrupados por shell ou módulo, com um inventário de rotas atualizado. Não fazer uma reescrita visual geral em uma única PR: isso dificulta detectar regressões e preservar funções já usadas pelos tenants.
