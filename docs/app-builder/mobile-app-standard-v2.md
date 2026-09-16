# VendorAI App Builder — Mobile App Standard V2

## Objetivo

Padronizar todos os apps mobile criados pelo App Builder em uma experiência consistente, moderna, white-label e preparada desde a arquitetura para comércio, ERP, estoque, financeiro e VendorAI.

O padrão visual parte de uma linguagem de apps de varejo modernos: navegação inferior persistente, ação central destacada quando fizer sentido, Home com informação útil e acesso rápido, catálogos em grade, busca, categorias, histórico, perfil, notificações, menu e estados vazios bem definidos. O padrão é universal e não depende do segmento.

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
- ação central pode ser maior e destacada;
- item ativo sempre evidente;
- respeita safe-area;
- conteúdo tem padding inferior suficiente para nunca ficar escondido.

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

## Próxima evolução do Runtime

A camada atual já possui templates/versionamento, registries, Data Sources e Actions. A evolução V2 deve adicionar gradualmente os componentes oficiais acima ao Runtime Renderer e ao Editor Visual, mantendo compatibilidade com os blocos atuais. A prioridade funcional é:

1. Shell mobile + safe-area + bottom navigation.
2. Busca + categorias + ProductGrid/ProductCard.
3. Produto + carrinho + checkout + pedidos.
4. Perfil + notificações + menu.
5. Lojas/mapa + promoções/conteúdo.
6. Conectores efetivos de catálogo/estoque/compras/financeiro/ERP/VendorAI por registry.
