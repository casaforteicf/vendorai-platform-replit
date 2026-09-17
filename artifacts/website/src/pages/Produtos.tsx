import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Boxes, CheckCircle2, Sparkles, UserRound } from "lucide-react";
import { products } from "@/data/allProducts";
import {
  fetchPublicVendorProducts,
  formatCatalogPrice,
  productSkuBySlug,
  recurrenceLabel,
  type PublicCatalogProduct,
} from "@/lib/publicProductCatalog";

export default function Produtos() {
  const [catalog, setCatalog] = useState<PublicCatalogProduct[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchPublicVendorProducts().then((items) => { if (!cancelled) setCatalog(items); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const catalogBySku = (sku: string) => catalog.find((item) => item.sku === sku) ?? null;
  const crmFree = catalogBySku("vendor-crm-free");
  const growth = catalogBySku("vendor-growth-monthly");

  return (
    <div className="vendor-page bg-slate-50 text-slate-950">
      <section className="vendor-hero">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700"><Boxes className="h-4 w-4" /> Produtos VendorAI</div>
            <h1 className="text-4xl font-bold tracking-[-0.04em] text-slate-950 md:text-6xl">Comece com o CRM. Expanda conforme sua operação cresce.</h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-600 md:text-xl">O CRM Free é completo para 1 usuário. Depois você pode ativar produtos individualmente ou usar o Growth com usuários ilimitados e todos os módulos aplicáveis ao seu segmento.</p>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-4">
        <div className="grid gap-5 lg:grid-cols-2">
          <Link href="/precos" className="rounded-[26px] border border-emerald-200 bg-emerald-50 p-7 transition hover:-translate-y-1">
            <div className="flex items-center gap-3 text-emerald-700"><UserRound className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[0.16em]">Porta de entrada</span></div>
            <h2 className="mt-4 text-3xl font-semibold">{crmFree?.nome ?? "Vendor CRM Free"}</h2>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{formatCatalogPrice(crmFree) ?? "Grátis"}</p>
            <p className="mt-3 leading-7 text-slate-650">CRM completo para 1 usuário, com franquia mensal de assistência por IA e sem esconder as funções essenciais do CRM.</p>
            <span className="mt-5 inline-flex items-center text-sm font-semibold text-emerald-800">Começar grátis<ArrowRight className="ml-2 h-4 w-4" /></span>
          </Link>

          <Link href="/precos" className="rounded-[26px] border border-blue-300 bg-blue-50 p-7 transition hover:-translate-y-1">
            <div className="flex items-center gap-3 text-blue-700"><Sparkles className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[0.16em]">Ecossistema completo</span></div>
            <h2 className="mt-4 text-3xl font-semibold">{growth?.nome ?? "VendorAI Growth"}</h2>
            <p className="mt-2 text-2xl font-bold text-blue-700">{formatCatalogPrice(growth) ?? "R$ 1.490,00"}<span className="ml-1 text-sm font-medium text-slate-500">/mês</span></p>
            <p className="mt-3 leading-7 text-slate-650">Usuários ilimitados, todos os produtos padrão aplicáveis ao segmento e franquias mensais claras para gerações e automações de custo variável.</p>
            <span className="mt-5 inline-flex items-center text-sm font-semibold text-blue-800">Conhecer Growth<ArrowRight className="ml-2 h-4 w-4" /></span>
          </Link>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="mb-8 max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-orange-600">Módulos individuais</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Ative somente o que precisar</h2>
          <p className="mt-3 leading-7 text-slate-600">Cada produto comercial libera os módulos e recursos correspondentes no sistema. Quando a soma dos módulos se aproximar do Growth, o VendorAI pode sugerir a migração automaticamente.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const sku = productSkuBySlug[product.slug];
            const official = sku ? catalogBySku(sku) : null;
            const price = formatCatalogPrice(official);
            const recurrence = recurrenceLabel(official);
            return (
              <Link key={product.slug} href={`/produtos/${product.slug}`} className="vendor-card group rounded-[24px] p-6 transition duration-200 hover:-translate-y-1">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">{product.eyebrow}</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-slate-950">{official?.nome ?? product.name}</h2>
                <p className="mt-3 min-h-[72px] text-sm leading-6 text-slate-600">{official?.descricao ?? product.summary}</p>
                {price && <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3"><span className="text-xl font-bold text-slate-950">{price}</span><span className="ml-1 text-sm text-slate-500">{recurrence}</span><div className="mt-1 text-[11px] text-slate-500">Preço do catálogo oficial · incluído no Growth quando aplicável</div></div>}
                <div className="mt-5 space-y-2">{product.benefits.slice(0, 3).map((benefit) => <div key={benefit} className="flex items-start gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{benefit}</span></div>)}</div>
                <div className="mt-6 inline-flex items-center text-sm font-semibold text-orange-700">Conhecer produto<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" /></div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="vendor-section-alt bg-white"><div className="container mx-auto px-4 py-16 text-center"><h2 className="text-3xl font-bold tracking-[-0.03em] text-slate-950 md:text-4xl">Não precisa decidir tudo antes de começar.</h2><p className="mx-auto mt-4 max-w-2xl text-slate-600">Entre pelo CRM Free, trabalhe com seus leads e ative novos produtos dentro do próprio sistema conforme a necessidade aparecer.</p><Link href="/demo" className="mt-8 inline-flex h-12 items-center rounded-xl bg-orange-500 px-6 font-semibold text-white shadow-[0_12px_34px_rgba(249,115,22,0.18)] transition hover:bg-orange-600">Começar grátis<ArrowRight className="ml-2 h-4 w-4" /></Link></div></section>
    </div>
  );
}
