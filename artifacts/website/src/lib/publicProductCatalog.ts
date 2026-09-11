export type PublicCatalogProduct = {
  sku: string;
  nome: string;
  descricao: string | null;
  descricao_longa: string | null;
  preco_base: number | string | null;
  preco_implantacao: number | string | null;
  preco_mensalidade: number | string | null;
  preco_promocional: number | string | null;
  promocao_ativa_ate: string | null;
  recorrencia: string | null;
  prazo_contrato: number | null;
  imagem_url: string | null;
  imagens: unknown;
  video_url: string | null;
  product_type: string | null;
};

const ENDPOINT = "https://gfocphuiyyufwzcyihbk.supabase.co/functions/v1/vendor-public-products";

export const productSkuBySlug: Record<string, string> = {
  crm: "vendor-crm-monthly",
  jarvis: "vendor-jarvis-monthly",
  prospeccao: "vendor-prospector-monthly",
  "revenue-scout": "vendor-revenue-scout-monthly",
  financeiro: "vendor-financeiro-erp-monthly",
};

let cache: Promise<PublicCatalogProduct[]> | null = null;

export async function fetchPublicVendorProducts(): Promise<PublicCatalogProduct[]> {
  if (!cache) {
    cache = fetch(ENDPOINT, { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`catalog_http_${response.status}`);
        const payload = await response.json();
        return Array.isArray(payload?.products) ? payload.products : [];
      })
      .catch((error) => {
        cache = null;
        throw error;
      });
  }
  return cache;
}

export async function fetchPublicVendorProductBySlug(slug: string): Promise<PublicCatalogProduct | null> {
  const sku = productSkuBySlug[slug];
  if (!sku) return null;
  const products = await fetchPublicVendorProducts();
  return products.find((product) => product.sku === sku) ?? null;
}

export function catalogImages(product: PublicCatalogProduct | null): string[] {
  if (!product) return [];
  const values: string[] = [];
  if (product.imagem_url) values.push(product.imagem_url);
  if (Array.isArray(product.imagens)) {
    for (const item of product.imagens) {
      if (typeof item === "string" && item.trim()) values.push(item.trim());
      if (item && typeof item === "object" && "url" in item && typeof (item as { url?: unknown }).url === "string") {
        values.push((item as { url: string }).url);
      }
    }
  }
  return [...new Set(values)];
}

export function formatCatalogPrice(product: PublicCatalogProduct | null): string | null {
  if (!product) return null;
  const promo = Number(product.preco_promocional ?? 0);
  const monthly = Number(product.preco_mensalidade ?? 0);
  const base = Number(product.preco_base ?? 0);
  const value = promo > 0 ? promo : monthly > 0 ? monthly : base;
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function recurrenceLabel(product: PublicCatalogProduct | null): string {
  if (!product?.recorrencia) return "";
  const recurrence = product.recorrencia.toLowerCase();
  if (recurrence === "mensal") return "/mês";
  if (recurrence === "anual") return "/ano";
  return `/${product.recorrencia}`;
}
