# ARQDOR — referências de UX inspiradas em editores residenciais

Data da referência: 2026-09-19

## Objetivo

Padronizar o Arqdor como um editor profissional de arquitetura residencial, com identidade própria, usando como referência padrões públicos de navegação e interação documentados pelo Planner 5D. Não reutilizar código proprietário, marca, logotipo, ilustrações ou assets de terceiros.

## Tipografia adotada

Stack operacional do Arqdor:

```css
font-family: Inter, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
```

A família exata usada internamente pelo Planner 5D não foi confirmada nas páginas públicas. A stack acima reproduz a leitura visual de um editor moderno sem depender de fonte proprietária externa.

## Tokens visuais Arqdor

- Acento principal: `#f97316`
- Acento forte/hover: `#ea580c`
- Texto principal: `#111827`
- Texto secundário: `#64748b`
- Borda: `#e2e8f0`
- Canvas: `#f6f7f9`
- Superfície: `#ffffff`
- Raio de cards: 13–16 px
- Raio de inputs e botões: 10–12 px
- Barra de aplicação: aproximadamente 68 px
- Tool buttons: 44 × 44 px

## Telas e padrões de referência

### 1. Lista de projetos / Spaces
Referência oficial:
https://support.planner5d.com/en/articles/15819864-spaces-on-web

Aplicação no Arqdor:
- Dashboard de projetos
- Projetos recentes
- Criar novo projeto
- Organização por cliente/projeto
- Busca e filtros

### 2. Editor principal 2D/3D
Referência oficial:
https://support.planner5d.com/en/articles/5876772-how-to-navigate-through-planner-5d

Aplicação no Arqdor:
- Barra superior compacta
- Alternador 2D/3D
- Pavimentos
- Undo/redo
- configurações
- render
- compartilhamento
- biblioteca lateral
- canvas central
- propriedades contextuais

### 3. Biblioteca / catálogo
Referência oficial:
https://support.planner5d.com/en/articles/5876855-catalogue-menu-web

Aplicação no Arqdor:
- Construção
- Ambientes
- Interiores
- Exteriores
- Busca
- Modelos
- Materiais e componentes

### 4. Tour de uso
Referência oficial:
https://support.planner5d.com/en/articles/9945344-product-tour-for-new-users

Aplicação no Arqdor:
- Portas e janelas
- busca
- mobiliário
- materiais
- troca 2D/3D

### 5. Visualização 3D
Referência oficial:
https://support.planner5d.com/en/articles/15112460-how-to-use-3d-mode

Aplicação no Arqdor:
- alternância 2D/3D no mesmo workspace
- edição preservada entre vistas
- câmera e navegação 3D

### 6. Pavimentos
Referência oficial:
https://support.planner5d.com/en/articles/16475679-how-to-create-a-new-floor

Aplicação no Arqdor:
- seletor de pavimento
- adicionar pavimento
- editar pavimentos
- visualização do pavimento inferior como referência

### 7. Dimensões e medidas
Referência oficial:
https://support.planner5d.com/en/articles/16963387-how-to-change-dimensions-and-measurement-units

Aplicação no Arqdor:
- cotas
- medidas paramétricas
- unidade métrica
- edição de paredes, aberturas e objetos

### 8. Paredes e divisórias
Referência oficial:
https://support.planner5d.com/en/articles/15934552-how-to-create-partition-walls

Aplicação no Arqdor:
- desenho de paredes
- fechamento de espaços
- divisão de ambientes
- edição de altura/espessura

### 9. Render e visualização
Referência oficial:
https://support.planner5d.com/en/articles/5885899-how-to-create-renders-on-web

Aplicação no Arqdor:
- preview
- render conceitual
- qualidade
- iluminação
- câmera
- histórico de versões

### 10. Compartilhamento
Referência oficial:
https://support.planner5d.com/en/articles/15116256-how-to-share-projects

Aplicação no Arqdor:
- link de projeto
- portal cliente
- permissão de visualização
- colaboração futura

### 11. Comentários e revisão
Referência oficial:
https://support.planner5d.com/en/articles/11578259-how-to-use-comments-in-your-project

Aplicação no Arqdor:
- comentários ancorados no projeto
- feedback do cliente
- respostas
- filtros de comentários

### 12. Configurações do projeto
Referências oficiais:
https://support.planner5d.com/en/articles/5876772-how-to-navigate-through-planner-5d
https://support.planner5d.com/en/articles/16847471-how-to-lock-rooms-and-hide-objects

Aplicação no Arqdor:
- nome do projeto
- unidades
- mostrar cotas
- objetos
- bloquear paredes
- snap
- aparência do editor

### 13. Colaboração
Referência oficial:
https://support.planner5d.com/en/articles/14602018-how-to-use-live-collaboration-tool

Aplicação futura no Arqdor:
- presença de usuários
- cursores
- colaboração em tempo real
- permissões editar/visualizar

## Arquivos que recebem o sistema visual compartilhado

- `ArchDashboard.tsx`
- `Projetos.tsx`
- `ProjetoDetalhe.tsx`
- `Catalogo.tsx`
- `Marketplace.tsx`
- `ConceptPlanner.tsx`
- `RenderStudioPage.tsx`
- `PortalCliente.tsx`

CSS compartilhado:
- `planner5d-reference.css`

## Regra de produto

A referência externa serve para comportamento, ergonomia e hierarquia de interface. O Arqdor mantém:
- identidade laranja própria;
- nomenclatura própria;
- componentes próprios;
- fluxo comercial próprio;
- integrações Vendor.ai;
- biblioteca e lógica arquitetônica próprias.
