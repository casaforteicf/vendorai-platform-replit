# VendorAI App Builder — Mobile App Standard V2.1

## Objetivo

Padronizar todos os apps mobile criados pelo App Builder em uma experiência consistente, moderna, white-label e preparada desde a arquitetura para comércio, ERP, estoque, financeiro e VendorAI.

O padrão visual parte de uma linguagem de apps de varejo modernos: navegação inferior persistente, Home com informação útil e acesso rápido, catálogos em grade, busca, categorias, histórico, perfil, notificações, menu e estados vazios bem definidos. O padrão é universal e não depende do segmento.

## Regra central

O tenant pode mudar marca, cores, conteúdo, ordem e capacidades habilitadas. Não pode quebrar safe-area, hierarquia, acessibilidade, estados de carregamento, navegação, espaçamento mínimo ou comportamento dos componentes oficiais.

## Shell oficial

### Header

- respeita safe-area Android/iOS;
- perfil à esquerda;
- marca/logo ao centro;
- notificações à direita;
- variações somente quando justificadas pelo caso de uso;
- conteúdo nunca entra sob status bar, notch ou câmera.

### Bottom navigation

- até 5 destinos;
- texto + ícone;
- item ativo sempre evidente;
- respeita safe-area;
- conteúdo tem padding inferior suficiente para nunca ficar escondido.

O Runtime Renderer V2 já aplica a navegação inferior no mobile e preserva a navegação horizontal no desktop.

## IDs canônicos de páginas commerce

Quando uma tela existir, o Arquiteto IA deve preferir:

- `home`
- `catalog`
- `search`
- `categories`
- `product-detail`
- `cart`
- `checkout`
- `orders`
- `order-detail`
- `promotions`
- `stores`
- `profile`
- `notifications`
- `menu`

A página `catalog` ativa o catálogo estruturado oficial do Runtime.

## Padrões oficiais de tela

1. Home
2. Busca
3. Categorias
4. Catálogo / produtos / serviços
5. Detalhe de produto ou serviço
6. Carrinho
7. Checkout
8. Pedidos / compras
9. Detalhe de pedido
10. Promoções / campanhas / conteúdo
11. Unidades / lojas / mapa
12. Perfil
13. Notificações
14. Menu / conta / preferências
15. Empty state
16. Loading state
17. Error / retry state

Nem todo app precisa de todas as telas. O Arquiteto IA escolhe somente as necessárias ao objetivo do produto.

## Componentes oficiais

- AppHeader
- HeroBannerCarousel
- SearchBar
- CategoryScroller
- QuickActions
- ProductGrid
- ProductCard
- ProductDetail
- StoreCard
- MetricCard
- PurchaseHistory
- NotificationList
- ProfileFields
- ContentCarousel
- EmptyState
- BottomNavigation

A evolução do Runtime deve priorizar componentes oficiais em vez de HTML livre ou layouts arbitrários por tenant.

## Catálogo real no Runtime

A V2.1 adiciona a data source oficial `catalog.products`.

Ela lê somente produtos ativos do catálogo real do tenant e retorna:

- id, nome, SKU e marca;
- categoria;
- imagem;
- preço base e preço promocional;
- validade da promoção;
- disponibilidade e estoque quando controlado;
- prazo de entrega;
- destaque.

O executor é allowlisted no backend e sempre usa o `tenantId` do App User autenticado. O frontend nunca informa o tenant da consulta.

A tela `catalog` consome essa data source pela rota autenticada do App Runtime e oferece busca, filtro por categoria, preço/promoção e situação do estoque. Não existe cópia paralela do catálogo no app.

## Personalização white-label

A identidade é expressa por tokens, não por CSS livre:

```json
{
  "designSystem": {
    "standard": "vendorai-mobile-v2",
    "themeTokens": {
      "brandPrimary": "#...",
      "brandSecondary": "#...",
      "surface": "#...",
      "text": "#..."
    },
    "density": "comfortable",
    "radius": "large",
    "typography": "system",
    "iconStyle": "outline"
  }
}
```

## Arquitetura de integração obrigatória

Todo app deve nascer com `definition.integrationArchitecture`, mesmo quando a primeira versão ainda não utiliza todos os domínios.

### Catálogo

Entidades: produto/serviço, categoria, mídia, atributos, preço, preço promocional e condições comerciais.

### Estoque

Entidades: saldo, disponibilidade, reserva, depósito/unidade e prazo.

### Compras / comércio

Entidades: carrinho, checkout, pedido, item, status, entrega/retirada, devolução e cancelamento.

### Financeiro

Entidades: pagamento, cobrança, contas a receber, estorno, cashback, voucher e conciliação quando aplicável.

### ERP

Integração por contrato de capacidade, não por telas específicas do fornecedor. Deve permitir mapear pelo menos clientes, produtos, preços, estoque, pedidos, fiscal e financeiro.

### Fiscal

NF/documento fiscal, status, chave/identificador e comprovantes permitidos.

### VendorAI

O app publica eventos e dados úteis para CRM, Customer Intelligence, automações, agentes, marketing, suporte e analytics. O VendorAI devolve ações/inteligência sem se tornar fonte duplicada do ERP quando o ERP for a autoridade.

### Identidade / LGPD

App User, perfil, consentimentos, preferências, exportação quando aplicável e exclusão de conta.

### Engajamento

Push, in-app, e-mail e WhatsApp conforme consentimento e disponibilidade do canal.

### Localização

Unidades, distância, mapa, área de atendimento, retirada e disponibilidade local quando aplicável.

### Analytics

Eventos mínimos: app_open, screen_view, search, category_view, product_view, add_to_cart, checkout_started, purchase_completed, promotion_view, notification_opened, profile_updated e support_requested quando aplicável.

## Contrato de cada integração

Cada domínio deve registrar no mínimo:

```json
{
  "domain": "inventory",
  "sourceOfTruth": "erp",
  "direction": "bidirectional",
  "provider": "registry-key-or-gap",
  "entities": ["stock", "availability"],
  "events": ["stock.changed"],
  "actions": ["inventory.reserve"],
  "permissions": ["inventory.read"],
  "syncMode": "webhook+reconciliation",
  "healthCheck": true,
  "fallback": "read_only_cached"
}
```

## Autoridade dos dados

Cada entidade precisa de uma fonte oficial. Exemplos:

- ERP pode ser autoridade de estoque, fiscal e contas;
- App Product pode ser autoridade do carrinho e sessão;
- VendorAI pode ser autoridade de lead, inteligência, segmentação e automação;
- provedor de pagamento pode ser autoridade do status financeiro da transação.

Não manter duas fontes de verdade concorrentes.

## Sincronização e segurança

- escrita externa sempre idempotente;
- webhook preferido para mudanças externas;
- reconciliação periódica para corrigir perdas de evento;
- log de sincronização e erro obrigatório;
- health status por conexão;
- segredos fora da definição do template;
- isolamento por tenant;
- permissões explícitas por Data Source e Action;
- sem SQL, URL, código ou segredo arbitrário em template.

## Compras e checkout

O Runtime V2.1 já possui leitura real de catálogo e disponibilidade. Carrinho, checkout, pagamento, criação de pedido, reserva de estoque, estorno e devolução não devem ser simulados como concluídos.

Essas escritas só entram como executáveis quando existirem Actions/workflows oficiais no registry, com idempotência, permissões e source-of-truth definidos. Até lá o Arquiteto IA desenha a jornada e registra os executores faltantes como `gaps`.

Quando a Action oficial de compra for habilitada, a regra do VendorAI será: confirmou a compra -> gerar checkout automaticamente. Não haverá configuração por produto para ligar/desligar geração automática de checkout.

## App Product × App Admin × VendorAI SaaS

O padrão mantém o modelo existente:

`APP PRODUCT -> eventos/dados -> VENDORAI -> inteligência/automação -> APP PRODUCT`

O App Admin administra o próprio produto: catálogo, conteúdo, usuários, pedidos, agenda, notificações e configurações que façam parte do produto vendido. O VendorAI SaaS amplia a operação com CRM, marketing, IA, automação e inteligência. ERP e financeiro permanecem integrados por source-of-truth definido.

## Comportamento do Arquiteto IA

A partir deste padrão, toda geração/revisão mobile deve incluir:

- `definition.designSystem`;
- `definition.mobileShell`;
- `definition.integrationArchitecture`;
- `definition.analyticsPlan`;
- `definition.offlinePolicy`;
- `definition.productModel`;
- `definition.valueAgent`.

A IA deve usar registries oficiais. Capacidade não encontrada vira `gap`; nunca é considerada disponível por suposição.

## Status de implementação

Implementado na V2.1:

1. padrão obrigatório no Arquiteto IA;
2. IDs canônicos de páginas commerce;
3. bottom navigation mobile real com safe-area;
4. manutenção da navegação desktop existente;
5. data source `catalog.products` tenant-scoped;
6. busca, categorias e ProductGrid/ProductCard alimentados pelo catálogo real;
7. preço promocional e disponibilidade de estoque no catálogo;
8. fallback seguro quando a data source não estiver registrada/disponível.

Próximas camadas executáveis:

1. Product Detail conectado ao item real;
2. carrinho persistente do App Product;
3. Action de checkout com geração automática de checkout;
4. pedido + reserva/baixa de estoque;
5. financeiro/pagamento/estorno;
6. adaptadores ERP e fiscal;
7. eventos do app para CRM/Customer Intelligence/automação no VendorAI.
