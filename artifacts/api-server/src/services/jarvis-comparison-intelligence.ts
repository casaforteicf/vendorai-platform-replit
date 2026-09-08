import { and, desc, eq, gte } from "drizzle-orm";
import {
  businessProfilesTable,
  db,
  fornecedoresTable,
  jarvisCasesTable,
  produtosCatalogoTable,
  solicitacoesCompraTable,
} from "@workspace/db";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string | null | undefined, max = 180) {
  if (!value) return "";
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function toNumber(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type JarvisComparisonSnapshot = {
  competitors: Array<{
    name: string;
    recentSignalCount: number;
    caseIds: string[];
  }>;
  suppliers: Array<{
    id: string;
    name: string;
    contactCoverage: number;
    purchaseSamples: number;
    latestQuote: number | null;
    latestPaid: number | null;
    latestDeliveryDays: number | null;
    latestPaymentTerms: string | null;
    recentSignalCount: number;
  }>;
  products: Array<{
    id: string;
    name: string;
    sku: string | null;
    brand: string | null;
    price: number | null;
    promotionalPrice: number | null;
    cost: number | null;
    marginPercent: number | null;
    deliveryDays: number | null;
    supplier: string | null;
    stockControlled: boolean;
    stockQuantity: number | null;
    recentSignalCount: number;
  }>;
};

export async function loadJarvisComparisonIntelligence(tenantId: string): Promise<JarvisComparisonSnapshot> {
  const recentSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [profileRows, suppliers, purchaseRequests, products, recentCases] = await Promise.all([
    db.select({ competitors: businessProfilesTable.concorrentes })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId))
      .limit(1),
    db.select({
      id: fornecedoresTable.id,
      name: fornecedoresTable.nome,
      contact: fornecedoresTable.contato,
      phone: fornecedoresTable.telefone,
      email: fornecedoresTable.email,
    })
      .from(fornecedoresTable)
      .where(eq(fornecedoresTable.tenantId, tenantId)),
    db.select({
      supplierId: solicitacoesCompraTable.fornecedorId,
      supplierName: solicitacoesCompraTable.fornecedorNome,
      latestPaid: solicitacoesCompraTable.ultimoValorPago,
      latestQuote: solicitacoesCompraTable.cotacaoAtual,
      deliveryDays: solicitacoesCompraTable.prazoEntregaDias,
      paymentTerms: solicitacoesCompraTable.condicaoPagamento,
      updatedAt: solicitacoesCompraTable.updatedAt,
    })
      .from(solicitacoesCompraTable)
      .where(eq(solicitacoesCompraTable.tenantId, tenantId))
      .orderBy(desc(solicitacoesCompraTable.updatedAt))
      .limit(300),
    db.select({
      id: produtosCatalogoTable.id,
      name: produtosCatalogoTable.nome,
      sku: produtosCatalogoTable.sku,
      brand: produtosCatalogoTable.marca,
      price: produtosCatalogoTable.precoBase,
      promotionalPrice: produtosCatalogoTable.precoPromocional,
      cost: produtosCatalogoTable.custoFornecedor,
      marginPercent: produtosCatalogoTable.margemPercentual,
      deliveryDays: produtosCatalogoTable.prazoEntregaDias,
      supplier: produtosCatalogoTable.fornecedor,
      stockControlled: produtosCatalogoTable.controlaEstoque,
      stockQuantity: produtosCatalogoTable.estoqueQuantidade,
    })
      .from(produtosCatalogoTable)
      .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.ativo, true)))
      .orderBy(desc(produtosCatalogoTable.updatedAt))
      .limit(100),
    db.select({
      id: jarvisCasesTable.id,
      title: jarvisCasesTable.title,
      detail: jarvisCasesTable.detail,
      source: jarvisCasesTable.source,
      evidence: jarvisCasesTable.evidence,
    })
      .from(jarvisCasesTable)
      .where(and(eq(jarvisCasesTable.tenantId, tenantId), gte(jarvisCasesTable.updatedAt, recentSince)))
      .orderBy(desc(jarvisCasesTable.updatedAt))
      .limit(250),
  ]);

  const caseSearch = recentCases.map((item) => ({
    ...item,
    search: normalize(`${item.title} ${item.detail} ${item.source} ${item.evidence ? JSON.stringify(item.evidence) : ""}`),
  }));

  const countSignals = (label: string) => {
    const needle = normalize(label);
    if (needle.length < 3) return { count: 0, ids: [] as string[] };
    const matches = caseSearch.filter((item) => item.search.includes(needle)).slice(0, 12);
    return { count: matches.length, ids: matches.map((item) => item.id) };
  };

  const competitors = [...new Set(profileRows[0]?.competitors ?? [])]
    .filter(Boolean)
    .slice(0, 30)
    .map((name) => {
      const signals = countSignals(name);
      return { name: compact(name), recentSignalCount: signals.count, caseIds: signals.ids };
    });

  const requestsBySupplier = new Map<string, typeof purchaseRequests>();
  for (const request of purchaseRequests) {
    const key = request.supplierId ?? normalize(request.supplierName);
    const rows = requestsBySupplier.get(key) ?? [];
    rows.push(request);
    requestsBySupplier.set(key, rows);
  }

  const supplierSnapshots = suppliers.slice(0, 50).map((supplier) => {
    const requests = requestsBySupplier.get(supplier.id) ?? requestsBySupplier.get(normalize(supplier.name)) ?? [];
    const latest = requests[0] ?? null;
    const signal = countSignals(supplier.name);
    const contactCoverage = [supplier.contact, supplier.phone, supplier.email].filter(Boolean).length;
    return {
      id: supplier.id,
      name: compact(supplier.name),
      contactCoverage,
      purchaseSamples: requests.length,
      latestQuote: toNumber(latest?.latestQuote),
      latestPaid: toNumber(latest?.latestPaid),
      latestDeliveryDays: latest?.deliveryDays ?? null,
      latestPaymentTerms: latest?.paymentTerms ?? null,
      recentSignalCount: signal.count,
    };
  });

  const productSnapshots = products.map((product) => {
    const signal = countSignals(product.name);
    return {
      id: product.id,
      name: compact(product.name),
      sku: product.sku,
      brand: product.brand,
      price: toNumber(product.price),
      promotionalPrice: toNumber(product.promotionalPrice),
      cost: toNumber(product.cost),
      marginPercent: toNumber(product.marginPercent),
      deliveryDays: product.deliveryDays,
      supplier: product.supplier,
      stockControlled: product.stockControlled,
      stockQuantity: product.stockQuantity,
      recentSignalCount: signal.count,
    };
  });

  return { competitors, suppliers: supplierSnapshots, products: productSnapshots };
}
