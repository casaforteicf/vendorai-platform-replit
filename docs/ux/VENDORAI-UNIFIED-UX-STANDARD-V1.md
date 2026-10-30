# Vendor.ai — padrão visual e UX unificado v1

**Status:** proposta-base para auditoria e migração incremental  
**Escopo:** sistema web autenticado e aplicativo mobile Vendor.ai  
**Data:** 29/10/2026

## Objetivo

Fazer todos os módulos parecerem parte do mesmo produto e oferecer os mesmos padrões de navegação, leitura, interação, acessibilidade e resposta aos estados do sistema. O padrão unifica a experiência; não transforma todos os módulos em telas idênticas nem muda suas funções de negócio.

## Fonte visual única

A identidade de marca existente continua sendo a base:

- Tokens de marca: `lib/vendor-brand/src/tokens.ts`.
- Tokens CSS: `lib/vendor-brand/src/theme.css`.
- Primitivos de produto autenticado: `artifacts/frontend/src/components/ui`.
- Regras compartilhadas de página: `artifacts/frontend/src/ui-standard.css`.

Não criar uma segunda paleta, escala tipográfica ou kit de componentes. Antes de migrar telas, consolidar os valores concorrentes em `index.css`, `vendor-brand.css`, `vendorai-ui2.css`, `ui-standard.css` e folhas específicas. Remover duplicações e regras que dependam da ordem incidental dos imports ou de `!important`.

### Valores de marca vigentes

- Primária Vendor.ai: laranja `#F97316`; variação forte `#EA580C`.
- Azul `#2563EB` para informação e navegação auxiliar, nunca como cor primária de marca.
- Sucesso, alerta e erro usam tokens semânticos.
- Inter para interface e operação; Rigter apenas em usos de marca aprovados; serif editorial só em conteúdo editorial.
- Claro e escuro devem compartilhar os mesmos significados semânticos, estados e contraste. O tema não pode mudar o significado de uma cor ou estado.

A auditoria pode recomendar ajustes de valor, mas eles precisam ser feitos uma vez na fonte central e propagados aos consumidores.

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

- **ARQDOR Studio, vídeo e editores/canvas:** podem manter controles e área de trabalho especializados. Compartilham tipografia, acessibilidade, estados, navegação, botões, campos e tokens semânticos do produto; a área de desenho continua otimizada para sua tarefa.
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

Aplicar o contrato comum ao redor dos canvas do ARQDOR, vídeo e construtores de sites; depois alinhar o aplicativo mobile aos mesmos tokens, estados e acessibilidade.

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
