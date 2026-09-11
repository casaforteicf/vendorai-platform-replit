import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Boxes, CheckCircle2 } from "lucide-react";
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

  return (
    <div className="bg-[#070b14] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_28%)]">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-4 py-2 text-sm font-semibold text-orange-300"><Boxes className="h-4 w-4" /> Produtos VendorAI</div>
            <h1 className="text-4xl font-bold tracking-[-0.04em] md:text-6xl">Uma plataforma. Vários produtos conectados à mesma inteligência.</h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">Conheça cada produto do VendorAI e veja como vendas, atendimento, marketing, gestão, automação e inteligência trabalham no mesmo ecossistema.</p>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const sku = productSkuBySlug[product.slug];
            const official = sku ? catalog.find((item) => item.sku === sku) ?? null : null;
            const price = formatCatalogPrice(official);
            const recurrence = recurrenceLabel(official);
            return (
              <Link key={product.slug} href={`/produtos/${product.slug}`} className="group rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:-translate-y-1 hover:border-orange-400/30 hover:bg-white/[0.055]">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">{product.eyebrow}</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">{official?.nome ?? product.name}</h2>
                <p className="mt-3 min-h-[72px] text-sm leading-6 text-slate-400">{official?.descricao ?? product.summary}</p>
                {price && <div className="mt-4 rounded-xl border border-orange-400/15 bg-orange-500/[0.06] px-4 py-3"><span className="text-xl font-bold text-white">{price}</span><span className="ml-1 text-sm text-slate-400">{recurrence}</span><div className="mt-1 text-[11px] text-slate-500">Preço do catálogo oficial</div></div>}
                <div className="mt-5 space-y-2">{product.benefits.slice(0, 3).map((benefit) => <div key={benefit} className="flex items-start gap-2 text-sm text-slate-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /><span>{benefit}</span></div>)}</div>
                <div className="mt-6 inline-flex items-center text-sm font-semibold text-white">Conhecer produto<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" /></div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="border-t border-white/10 bg-white/[0.025]"><div className="container mx-auto px-4 py-16 text-center"><h2 className="text-3xl font-bold tracking-[-0.03em] md:text-4xl">Quer ver quais produtos fazem mais sentido para sua empresa?</h2><p className="mx-auto mt-4 max-w-2xl text-slate-400">O VendorAI pode ser configurado conforme o segmento, operação, equipe e nível de automação desejado.</p><Link href="/demo" className="mt-8 inline-flex h-12 items-center rounded-xl bg-orange-500 px-6 font-semibold text-white transition hover:bg-orange-400">Testar 5 dias grátis<ArrowRight className="ml-2 h-4 w-4" /></Link></div></section>
    </div>
  );
}
