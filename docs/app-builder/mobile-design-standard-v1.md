# VendorAI App Builder — Mobile Design Standard V1

## Objetivo

Este documento define o padrão visual e de experiência obrigatório para apps mobile gerados pelo VendorAI App Builder. O padrão é universal: deve funcionar para varejo, construção, serviços, imobiliário, saúde, educação, automotivo, financeiro, agenda, marketplace e demais segmentos sem copiar identidade, marca, dados ou conteúdo de apps de referência.

O cliente personaliza a marca; o Builder preserva a qualidade da experiência.

## Princípios

1. **Mobile-first real**: toda tela respeita safe areas de iOS/Android, teclado, barras do sistema e navegação por gesto.
2. **Marca do cliente, estrutura VendorAI**: cores, logo, imagens, conteúdo e tom pertencem ao cliente; layout, acessibilidade e padrões de interação seguem o Design System.
3. **Dados fictícios no preview**: nunca usar nome, CPF, telefone, endereço, e-mail ou imagens pessoais reais como dados de demonstração.
4. **Privacidade por padrão**: dados sensíveis são mascarados em telas de uso comum. Ex.: CPF `***.842.170-**`.
5. **Navegação previsível**: 3 a 5 destinos principais na barra inferior. Uma ação central destacada é opcional e configurável.
6. **IA não inventa layout livremente**: o Arquiteto IA organiza componentes oficiais do Builder e somente solicita novos componentes como `gap` quando necessário.
7. **Ação clara**: cada tela deve deixar explícito o objetivo principal e o próximo passo.
8. **Estados completos**: loading, vazio, erro, offline, sucesso, indisponível e permissão negada fazem parte da tela, não são exceções posteriores.
9. **Sem duplicidade funcional**: uma função existe em um único lugar canônico e pode ser referenciada por outras telas.
10. **Acessibilidade mínima**: alvo de toque de pelo menos 44x44 px, contraste adequado, labels sem depender apenas de cor e suporte a fonte dinâmica sempre que possível.

## Estrutura canônica do aplicativo

### 1. App Header

- Respeita safe area automaticamente.
- Pode conter: perfil/voltar à esquerda, logo ou título no centro, notificações/ações à direita.
- Nunca pode ficar sob a status bar do aparelho.
- Título deve truncar de forma controlada e nunca sobrepor ícones.

### 2. Bottom Navigation

- Entre 3 e 5 destinos.
- Ícone + rótulo sempre que houver espaço.
- Destino ativo visualmente evidente.
- Pode conter ação central destacada.
- A ação central é semântica e configurável: comprar, agendar, orçamento, scanner, QR code, IA, carteira, criar, etc.
- Não pode encobrir conteúdo, FABs, campos, banners ou acionadores.

### 3. Conteúdo

- Área rolável com espaçamento consistente.
- Cards reutilizáveis.
- Seções curtas, com hierarquia clara.
- Conteúdo crítico não pode depender de carrossel automático para ser descoberto.

## Tokens mínimos

O Builder deve representar o tema usando tokens semânticos, e não cores fixas espalhadas pelo código.

```json
{
  "standard": "vendorai-mobile-v1",
  "theme": {
    "primary": "#...",
    "onPrimary": "#...",
    "secondary": "#...",
    "background": "#...",
    "surface": "#...",
    "text": "#...",
    "mutedText": "#...",
    "border": "#...",
    "success": "#...",
    "warning": "#...",
    "danger": "#..."
  },
  "shape": {
    "cardRadius": 16,
    "controlRadius": 12
  },
  "spacing": {
    "screen": 16,
    "section": 20,
    "card": 16
  },
  "interaction": {
    "minTouchTarget": 44,
    "safeArea": true
  }
}
```

Os valores de cor são definidos por app/cliente. O padrão não impõe verde, laranja ou qualquer paleta fixa.

## Catálogo oficial de componentes

### Navegação
- `app_header`
- `bottom_navigation`
- `section_tabs`
- `segmented_control`
- `breadcrumb` (web/tablet)

### Descoberta
- `search_bar`
- `category_scroller`
- `filter_sheet`
- `sort_control`
- `banner_carousel`

### Conteúdo
- `hero`
- `text`
- `callout`
- `cards`
- `list`
- `metrics`
- `divider`
- `empty_state`

### Produto/serviço
- `product_grid`
- `product_card`
- `service_card`
- `detail_header`
- `price_block`
- `quantity_control`
- `favorite_action`
- `share_action`

### Operação
- `action_form`
- `quick_actions`
- `timeline`
- `status_card`
- `order_summary`
- `map_location_card`
- `calendar_picker`
- `notification_list`

### Conta
- `profile_header`
- `profile_fields`
- `preferences_list`
- `legal_links`

Quando um componente ainda não existir no runtime/registry, o Arquiteto IA deve registrá-lo como gap em vez de simular suporte.

## Telas-base

O catálogo canônico inclui, conforme relevância do segmento:

1. Splash / carregamento inicial
2. Login
3. Cadastro
4. Recuperação de acesso
5. Onboarding
6. Home
7. Busca / descoberta
8. Lista/categorias
9. Detalhe de produto, serviço ou entidade
10. Favoritos
11. Carrinho / seleção
12. Checkout / confirmação ou conversão equivalente
13. Histórico / atividade
14. Detalhe de pedido/agendamento/processo
15. Notificações
16. Perfil
17. Preferências
18. Unidades / localização
19. Ajuda / FAQ / contato
20. LGPD / privacidade / termos / exclusão da conta

Nem todos os apps precisam de todas as telas. O Arquiteto IA deve escolher apenas as relevantes.

## Estados obrigatórios

Toda jornada crítica deve prever:

- `loading`: preferir skeleton ao spinner solto para conteúdo estruturado;
- `empty`: explicar o estado e oferecer próxima ação quando houver;
- `error`: mensagem simples + tentar novamente;
- `offline`: informar falta de conexão e preservar o que puder ser consultado;
- `success`: confirmar operação concluída;
- `unavailable`: item/serviço indisponível;
- `permission_denied`: explicar por que a ação não está disponível;
- `session_expired`: retorno seguro ao login sem perder contexto quando possível.

## Cards e listas

- Card inteiro pode ser clicável quando representa uma entidade única.
- Ações secundárias devem ser visualmente separadas.
- Não usar menus de três pontos para esconder a ação principal.
- Imagens devem ter proporção definida e placeholder coerente.
- Títulos têm limite previsível de linhas.
- Preço antigo, desconto, preço atual e validade devem ter hierarquia inequívoca quando existirem.

## Dados pessoais em preview e templates

É proibido usar dados pessoais reais fornecidos em referência visual como seed de template, teste, screenshot ou documentação.

Use nomes e dados sintéticos, por exemplo:
- Nome: `Carlos Henrique Souza`
- CPF mascarado: `***.842.170-**`
- E-mail: `carlos.souza@exemplo.com`
- Telefone: `(49) 98888-1234`
- Endereço comercial: endereço fictício ou claramente de demonstração.

## Regra de identidade

Referências externas servem para identificar padrões de UX, nunca para copiar:
- marca;
- logo;
- nome empresarial;
- paleta exclusiva;
- banners;
- fotos;
- textos promocionais;
- dados pessoais;
- endereços;
- conteúdo protegido.

O resultado precisa parecer um produto próprio do cliente criado sobre o Design System VendorAI.

## Regra para o Arquiteto IA

Toda nova arquitetura mobile deve declarar `definition.designSystem.standard = "vendorai-mobile-v1"` e descrever tema, navegação, telas, estados e componentes. O runtime continua sendo a fonte de verdade: componentes não existentes devem ser gaps e nunca capacidades inventadas.

## Critério de pronto

Uma versão mobile não deve ser considerada pronta para publicação enquanto houver:
- conteúdo sob status bar ou bottom bar;
- ação principal escondida;
- navegação sem rótulo/sem clareza;
- tela crítica sem estado de erro/vazio/loading;
- dado sensível exposto sem necessidade;
- componente inventado sem registry/runtime;
- identidade de referência copiada;
- contraste ou alvo de toque inadequado;
- fluxo sem próximo passo claro.
