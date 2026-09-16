export const MOBILE_APP_STANDARD_VERSION = "2.1" as const;

export const MOBILE_APP_STANDARD = {
  id: "vendorai-mobile-v2",
  name: "VendorAI Mobile App Standard",
  version: MOBILE_APP_STANDARD_VERSION,
  principles: [
    "mobile_first",
    "safe_area_always",
    "identity_without_breaking_ux",
    "one_primary_action_per_screen",
    "official_components_only",
    "data_driven",
    "integration_ready",
    "tenant_scoped",
    "accessible",
    "observable",
  ],
  shell: {
    header: {
      enabled: true,
      profileSlot: "left",
      brandSlot: "center",
      notificationSlot: "right",
      respectSafeArea: true,
    },
    bottomNavigation: {
      enabled: true,
      maxItems: 5,
      highlightedCenterAction: true,
      labels: true,
      respectSafeArea: true,
    },
  },
  canonicalPageIds: {
    home: "home",
    catalog: "catalog",
    search: "search",
    categories: "categories",
    productDetail: "product-detail",
    cart: "cart",
    checkout: "checkout",
    orders: "orders",
    orderDetail: "order-detail",
    promotions: "promotions",
    stores: "stores",
    profile: "profile",
    notifications: "notifications",
    menu: "menu",
  },
  pagePatterns: [
    "home",
    "catalog",
    "search",
    "categories",
    "product_detail",
    "cart",
    "checkout",
    "orders",
    "order_detail",
    "promotions",
    "content_feed",
    "stores",
    "profile",
    "notifications",
    "menu",
    "empty_state",
    "loading_state",
    "error_state",
  ],
  components: [
    "app_header",
    "hero_banner_carousel",
    "search_bar",
    "category_scroller",
    "quick_actions",
    "product_grid",
    "product_card",
    "product_detail",
    "cart",
    "checkout",
    "purchase_history",
    "store_card",
    "metric_card",
    "notification_list",
    "profile_fields",
    "content_carousel",
    "empty_state",
    "bottom_navigation",
  ],
  integrations: {
    catalog: ["products", "categories", "images", "attributes", "prices", "promotions"],
    inventory: ["stock", "availability", "reservation", "locations"],
    commerce: ["cart", "checkout", "orders", "order_status", "returns"],
    finance: ["payments", "receivables", "refunds", "cashback", "vouchers"],
    erp: ["customers", "products", "prices", "inventory", "orders", "fiscal", "financial"],
    fiscal: ["invoice", "receipt", "tax_document_status"],
    vendorAi: ["crm", "customer_intelligence", "automations", "agents", "marketing", "support", "analytics"],
    identity: ["app_user", "profile", "consent", "lgpd", "account_deletion"],
    engagement: ["push", "in_app", "email", "whatsapp", "preferences"],
    location: ["stores", "distance", "maps", "service_area"],
    analytics: ["events", "conversion", "search", "product_view", "add_to_cart", "purchase"],
  },
  runtimeDataSources: {
    catalogProducts: "catalog.products",
    commerceOrders: "commerce.orders",
  },
  runtimeActions: {
    checkoutStart: "commerce.checkout.start",
  },
  integrationRules: {
    sourceOfTruthRequired: true,
    idempotencyRequiredForWrites: true,
    tenantScopeRequired: true,
    secretsOutsideTemplateDefinition: true,
    webhooksPreferredForExternalChanges: true,
    syncLogsRequired: true,
    healthStatusRequired: true,
    gapsMustBeExplicit: true,
  },
} as const;

export const MOBILE_APP_ARCHITECT_REQUIREMENT = `REGRA OBRIGATÓRIA — PADRÃO MOBILE VENDORAI V2.1
Todo App Product mobile deve usar o padrão oficial VendorAI Mobile V2, mantendo a identidade visual do cliente sem quebrar a experiência.

1. SHELL
- Respeitar safe-area de Android/iOS em header e bottom navigation.
- Header padrão: perfil à esquerda, marca ao centro, notificações à direita, salvo quando o caso de uso exigir outra composição.
- Bottom navigation com até 5 posições. A posição central pode ser uma ação principal destacada.
- Nunca permitir conteúdo escondido sob status bar, notch, barra do sistema ou navegação inferior.

2. PADRÕES DE TELA
Use componentes oficiais e componha, conforme o segmento: Home, Busca, Categorias, Catálogo, Produto/Serviço, Carrinho/Checkout, Pedidos/Compras, Promoções/Conteúdo, Unidades/Mapa, Perfil, Notificações, Menu, Empty/Loading/Error state.
Não invente uma UI diferente para cada tenant. O tenant muda marca, cores, conteúdo, ordem e funções permitidas; a linguagem de interação permanece consistente.
Para apps commerce use IDs canônicos quando a tela existir: home, catalog, search, categories, product-detail, cart, checkout, orders, order-detail, promotions, stores, profile, notifications, menu. A tela de catálogo deve usar id="catalog", carrinho id="cart" e histórico id="orders" para ativar os componentes runtime oficiais.

3. CATÁLOGO E PEDIDOS REAIS
Quando o app precisar de catálogo, use a data source oficial catalog.products. Ela lê produtos ativos do catálogo real do tenant com categoria, imagem, preço, promoção e disponibilidade. Não replique produtos em cards estáticos quando a fonte oficial estiver disponível.
Quando houver histórico de compras, use commerce.orders, sempre limitado ao App User autenticado e à App Instance atual.

4. INTEGRAÇÕES OBRIGATORIAMENTE PREVISTAS
Inclua definition.integrationArchitecture com os domínios necessários ao app, mesmo quando algum conector ainda for gap:
- catalog: produtos, categorias, imagens, atributos, preços, promoções;
- inventory: estoque, disponibilidade, reserva e localização;
- commerce: carrinho, checkout, pedidos, status, devoluções;
- finance: pagamentos, contas/recebíveis, estornos, cashback/vouchers quando aplicável;
- erp: clientes, produtos, preços, estoque, pedidos, fiscal e financeiro;
- fiscal: NF/documento fiscal e status;
- vendorAi: CRM, Customer Intelligence, automações, agentes, marketing, suporte e analytics;
- identity: App User, perfil, consentimentos, LGPD e exclusão de conta;
- engagement: push, in-app, e-mail e WhatsApp;
- location: lojas/unidades, distância, mapa e área de atendimento;
- analytics: eventos de navegação, busca, produto, conversão e compra.

Para cada domínio registre: sourceOfTruth, direction (inbound|outbound|bidirectional), provider/registryKey quando existir, entities, events, actions, permissions, syncMode, healthCheck e fallback. Nunca finja conector disponível.

5. AUTORIDADE DOS DADOS
Cada entidade precisa de source-of-truth explícito. Evite duplicidade entre App Product, ERP e VendorAI. Escritas externas devem ser idempotentes; mudanças externas devem preferir webhook/eventos; sincronizações precisam de log e estado de saúde.

6. COMPRAS E CHECKOUT
Para apps commerce, a ação oficial de checkout é commerce.checkout.start. Ela é medium risk, exige confirmação explícita do usuário, valida preço/estoque no backend, usa idempotência, reserva estoque controlado e cria cobrança real no provedor configurado.
Quando o app tiver compra habilitada, inclua em definition.settings.runtimeAccess.actions: { enabled: true, keys: ["commerce.checkout.start"] } preservando outras actions necessárias.
A regra funcional é: usuário confirma a compra -> checkout é gerado automaticamente. Não crie opção por produto para desligar essa geração.
Pagamento, estorno, devolução, fiscal e ERP só podem ser marcados como executáveis quando houver integração oficial correspondente; o que não existir continua como gap.

7. APP PRODUCT / APP ADMIN / VENDORAI
O App Product executa a experiência do usuário final. O App Admin administra o que pertence ao próprio app. O VendorAI SaaS recebe eventos/dados e devolve inteligência, CRM, automações e gestão, sem duplicar ERP ou financeiro.
Eventos de commerce devem ser publicados no outbox do App Runtime para posterior consumo por adapters de ERP, financeiro, CRM/Customer Intelligence e automações.

8. SAÍDA DA IA
Além de productModel e valueAgent, inclua em definition:
- designSystem: { standard: "vendorai-mobile-v2", themeTokens, density, radius, typography, iconStyle };
- mobileShell: { header, bottomNavigation, safeArea: true };
- integrationArchitecture: { domains, authorities, events, sync, gaps };
- analyticsPlan: eventos essenciais por jornada;
- offlinePolicy: o que pode cachear, TTL e comportamento sem conexão.

Se uma capacidade não existir nos registries fornecidos, registre como gap. Não gere SQL, URL arbitrária, segredo ou executor dentro da definição do template.`;
