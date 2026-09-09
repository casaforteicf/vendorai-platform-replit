export type FinanceIntegrationCategory =
  | "ERP"
  | "Bancos e Open Finance"
  | "Pagamentos e adquirência"
  | "Fiscal"
  | "Contabilidade"
  | "E-commerce e marketplaces"
  | "Logística e estoque"
  | "Contratos e assinatura"
  | "Comunicação"
  | "Marketing"
  | "Infraestrutura"
  | "IA"
  | "Automação e API"
  | "Arquivos e intercâmbio";

export interface FinanceIntegrationDefinition {
  id: string;
  name: string;
  category: FinanceIntegrationCategory;
  capabilities: string[];
  auth: "oauth2" | "api_key" | "certificate" | "webhook" | "file" | "internal" | "multiple";
  direction: "in" | "out" | "bidirectional";
}

export const FINANCE_INTEGRATION_CATALOG: FinanceIntegrationDefinition[] = [
  { id: "omie", name: "Omie", category: "ERP", capabilities: ["clientes", "pedidos", "financeiro", "estoque", "fiscal"], auth: "api_key", direction: "bidirectional" },
  { id: "bling", name: "Bling", category: "ERP", capabilities: ["pedidos", "produtos", "estoque", "financeiro"], auth: "oauth2", direction: "bidirectional" },
  { id: "olist-tiny", name: "Olist/Tiny", category: "ERP", capabilities: ["pedidos", "produtos", "estoque", "financeiro"], auth: "oauth2", direction: "bidirectional" },
  { id: "totvs", name: "TOTVS", category: "ERP", capabilities: ["financeiro", "fiscal", "estoque", "compras"], auth: "multiple", direction: "bidirectional" },
  { id: "sankhya", name: "Sankhya", category: "ERP", capabilities: ["financeiro", "compras", "estoque", "fiscal"], auth: "multiple", direction: "bidirectional" },
  { id: "senior", name: "Senior", category: "ERP", capabilities: ["financeiro", "fiscal", "estoque"], auth: "multiple", direction: "bidirectional" },
  { id: "conta-azul", name: "Conta Azul", category: "ERP", capabilities: ["financeiro", "clientes", "vendas"], auth: "oauth2", direction: "bidirectional" },
  { id: "sap", name: "SAP", category: "ERP", capabilities: ["financeiro", "compras", "estoque", "fiscal"], auth: "multiple", direction: "bidirectional" },
  { id: "netsuite", name: "Oracle NetSuite", category: "ERP", capabilities: ["financeiro", "pedidos", "estoque"], auth: "oauth2", direction: "bidirectional" },
  { id: "dynamics", name: "Microsoft Dynamics", category: "ERP", capabilities: ["financeiro", "clientes", "pedidos"], auth: "oauth2", direction: "bidirectional" },
  { id: "open-finance", name: "Open Finance", category: "Bancos e Open Finance", capabilities: ["contas", "extratos", "saldos", "conciliação"], auth: "oauth2", direction: "in" },
  { id: "pix", name: "Pix", category: "Bancos e Open Finance", capabilities: ["cobrança", "recebimento", "baixa"], auth: "multiple", direction: "bidirectional" },
  { id: "cnab", name: "CNAB", category: "Bancos e Open Finance", capabilities: ["remessa", "retorno", "conciliação"], auth: "file", direction: "bidirectional" },
  { id: "ofx", name: "OFX", category: "Bancos e Open Finance", capabilities: ["extrato", "conciliação"], auth: "file", direction: "in" },
  { id: "asaas", name: "Asaas", category: "Pagamentos e adquirência", capabilities: ["pix", "boleto", "cartão", "recorrência", "webhook"], auth: "api_key", direction: "bidirectional" },
  { id: "mercado-pago", name: "Mercado Pago", category: "Pagamentos e adquirência", capabilities: ["pix", "cartão", "webhook"], auth: "oauth2", direction: "bidirectional" },
  { id: "pagarme", name: "Pagar.me", category: "Pagamentos e adquirência", capabilities: ["cartão", "pix", "split", "recorrência"], auth: "api_key", direction: "bidirectional" },
  { id: "stripe", name: "Stripe", category: "Pagamentos e adquirência", capabilities: ["cartão", "assinatura", "webhook"], auth: "api_key", direction: "bidirectional" },
  { id: "pagbank", name: "PagBank", category: "Pagamentos e adquirência", capabilities: ["pix", "boleto", "cartão"], auth: "oauth2", direction: "bidirectional" },
  { id: "stone", name: "Stone", category: "Pagamentos e adquirência", capabilities: ["cartão", "pix", "adquirência"], auth: "multiple", direction: "bidirectional" },
  { id: "cielo", name: "Cielo", category: "Pagamentos e adquirência", capabilities: ["cartão", "adquirência"], auth: "api_key", direction: "bidirectional" },
  { id: "rede", name: "Rede", category: "Pagamentos e adquirência", capabilities: ["cartão", "adquirência"], auth: "api_key", direction: "bidirectional" },
  { id: "nuvem-fiscal", name: "Nuvem Fiscal", category: "Fiscal", capabilities: ["nfe", "nfse", "nfce", "cte", "mdfe"], auth: "oauth2", direction: "bidirectional" },
  { id: "accounting-api", name: "Integração Contábil", category: "Contabilidade", capabilities: ["plano de contas", "centro de custo", "dre", "exportação"], auth: "multiple", direction: "bidirectional" },
  { id: "shopify", name: "Shopify", category: "E-commerce e marketplaces", capabilities: ["pedidos", "clientes", "produtos"], auth: "oauth2", direction: "bidirectional" },
  { id: "woocommerce", name: "WooCommerce", category: "E-commerce e marketplaces", capabilities: ["pedidos", "clientes", "produtos"], auth: "api_key", direction: "bidirectional" },
  { id: "mercado-livre", name: "Mercado Livre", category: "E-commerce e marketplaces", capabilities: ["pedidos", "produtos", "envios"], auth: "oauth2", direction: "bidirectional" },
  { id: "shopee", name: "Shopee", category: "E-commerce e marketplaces", capabilities: ["pedidos", "produtos", "envios"], auth: "oauth2", direction: "bidirectional" },
  { id: "amazon", name: "Amazon", category: "E-commerce e marketplaces", capabilities: ["pedidos", "produtos", "estoque"], auth: "oauth2", direction: "bidirectional" },
  { id: "praca-ai", name: "Praça.AI", category: "E-commerce e marketplaces", capabilities: ["pedidos", "split", "logística", "afiliados"], auth: "internal", direction: "bidirectional" },
  { id: "logistics", name: "Transportadoras e Frete", category: "Logística e estoque", capabilities: ["cotação", "expedição", "rastreio", "entrega"], auth: "multiple", direction: "bidirectional" },
  { id: "inventory", name: "Estoque VendorAI", category: "Logística e estoque", capabilities: ["saldo", "lote", "movimentação", "inventário"], auth: "internal", direction: "bidirectional" },
  { id: "clicksign", name: "Clicksign", category: "Contratos e assinatura", capabilities: ["assinatura", "documentos", "webhook"], auth: "api_key", direction: "bidirectional" },
  { id: "docusign", name: "DocuSign", category: "Contratos e assinatura", capabilities: ["assinatura", "documentos", "webhook"], auth: "oauth2", direction: "bidirectional" },
  { id: "zapsign", name: "ZapSign", category: "Contratos e assinatura", capabilities: ["assinatura", "documentos", "webhook"], auth: "api_key", direction: "bidirectional" },
  { id: "whatsapp", name: "WhatsApp", category: "Comunicação", capabilities: ["cobrança", "avisos", "negociação"], auth: "oauth2", direction: "bidirectional" },
  { id: "email", name: "E-mail/SMTP", category: "Comunicação", capabilities: ["cobrança", "documentos", "avisos"], auth: "multiple", direction: "out" },
  { id: "sms", name: "SMS", category: "Comunicação", capabilities: ["avisos", "cobrança"], auth: "api_key", direction: "out" },
  { id: "meta", name: "Meta", category: "Marketing", capabilities: ["despesas", "campanhas", "performance"], auth: "oauth2", direction: "in" },
  { id: "google-ads", name: "Google Ads", category: "Marketing", capabilities: ["despesas", "campanhas", "performance"], auth: "oauth2", direction: "in" },
  { id: "cloudflare", name: "Cloudflare", category: "Infraestrutura", capabilities: ["uso", "custos relativos", "saúde"], auth: "api_key", direction: "in" },
  { id: "railway", name: "Railway", category: "Infraestrutura", capabilities: ["uso", "custos relativos", "deploy"], auth: "api_key", direction: "in" },
  { id: "supabase", name: "Supabase", category: "Infraestrutura", capabilities: ["banco", "storage", "uso relativo"], auth: "api_key", direction: "in" },
  { id: "openai", name: "OpenAI", category: "IA", capabilities: ["uso", "tokens", "agentes", "custos relativos"], auth: "api_key", direction: "in" },
  { id: "n8n", name: "n8n", category: "Automação e API", capabilities: ["workflows", "webhooks", "integrações customizadas"], auth: "api_key", direction: "bidirectional" },
  { id: "public-api", name: "API pública VendorAI", category: "Automação e API", capabilities: ["entrada", "saída", "webhooks"], auth: "api_key", direction: "bidirectional" },
  { id: "csv", name: "CSV", category: "Arquivos e intercâmbio", capabilities: ["importação", "exportação"], auth: "file", direction: "bidirectional" },
  { id: "xlsx", name: "XLSX", category: "Arquivos e intercâmbio", capabilities: ["importação", "exportação"], auth: "file", direction: "bidirectional" },
];

export const FINANCE_INTEGRATION_CATEGORIES = Array.from(new Set(FINANCE_INTEGRATION_CATALOG.map((item) => item.category)));
