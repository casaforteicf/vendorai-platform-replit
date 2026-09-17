import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Public catalog allow-list. Pricing/content still comes from produtos_catalogo;
// the Edge Function only controls which commercial offers are public.
const ALLOWED_SKUS = new Set([
  "vendor-crm-free",
  "vendor-crm-monthly",
  "vendor-growth-monthly",
  "vendor-growth-5d",
  "vendor-prospector-monthly",
  "vendor-omnichannel-monthly",
  "vendor-agenda-monthly",
  "vendor-ai-team-10-monthly",
  "vendor-revenue-scout-monthly",
  "vendor-content-planner-monthly",
  "vendor-content-studio-monthly",
  "vendor-creative-studio-monthly",
  "vendor-sites-autopilot-monthly",
  "vendor-ads-monthly",
  "vendor-jarvis-monthly",
  "vendor-propostas-orcamentos-monthly",
  "vendor-financeiro-erp-monthly",
  "vendor-marketplace-praca-monthly",
  "vendor-app-builder-monthly",
  "vendor-automations-monthly",
  "vendor-bi-analytics-monthly",
  "vendor-knowledge-ai-monthly",
  "vendor-reputation-monthly",
  "vendor-custom-app-cash",
  "vendor-implementation-cash",
]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

async function resolveCatalogTenantId(supabase: ReturnType<typeof createClient>) {
  const configuredId = Deno.env.get("VENDORAI_CATALOG_TENANT_ID")?.trim();
  if (configuredId) return configuredId;

  // Stable fallback: discover the VendorAI catalog through its canonical Growth SKU.
  // This avoids coupling migrations/deployments to a generated tenant UUID.
  const { data, error } = await supabase
    .from("produtos_catalogo")
    .select("tenant_id")
    .eq("sku", "vendor-growth-monthly")
    .eq("ativo", true)
    .limit(2);

  if (error || !data || data.length !== 1 || !data[0]?.tenant_id) return null;
  return String(data[0].tenant_id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const tenantId = await resolveCatalogTenantId(supabase);
  if (!tenantId) {
    return new Response(JSON.stringify({ error: "catalog_tenant_unresolved" }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const { data, error } = await supabase
    .from("produtos_catalogo")
    .select("sku,nome,descricao,descricao_longa,preco_base,preco_implantacao,preco_mensalidade,preco_promocional,promocao_ativa_ate,recorrencia,prazo_contrato,imagem_url,imagens,video_url,product_type")
    .eq("tenant_id", tenantId)
    .eq("ativo", true);

  if (error) {
    return new Response(JSON.stringify({ error: "catalog_unavailable" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const products = (data ?? [])
    .filter((item) => item.sku && ALLOWED_SKUS.has(item.sku))
    .sort((a, b) => String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR"));

  return new Response(JSON.stringify({ products }), {
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
});
