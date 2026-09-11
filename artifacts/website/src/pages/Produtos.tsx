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
    <div className="vendor-page bg-slate-50 text-slate-950">
      <section className="vendor-hero">
        <div className="container mx-auto px-4 py-20 md:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700"><Boxes className="h-4 w-4" /> Produtos VendorAI</div>
            <h1 className="text-4xl font-bold tracking-[-0.04em] text-slate-950 md:text-6xl">Uma plataforma. Vários produtos conectados à mesma inteligência.</h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-600 md:text-xl">Conheça cada produto do VendorAI e veja como vendas, atendimento, marketing, gestão, automação e inteligência trabalham no mesmo ecossistema.</p>
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
              <Link key={product.slug} href={`/produtos/${product.slug}`} className="vendor-card group rounded-[24px] p-6 transition duration-200 hover:-translate-y-1">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">{product.eyebrow}</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-slate-950">{official?.nome ?? product.name}</h2>
                <p className="mt-3 min-h-[72px] text-sm leading-6 text-slate-600">{official?.descricao ?? product.summary}</p>
                {price && <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3"><span className="text-xl font-bold text-slate-950">{price}</span><span className="ml-1 text-sm text-slate-500">{recurrence}</span><div className="mt-1 text-[11px] text-slate-500">Preço do catálogo oficial</div></div>}
                <div className="mt-5 space-y-2">{product.benefits.slice(0, 3).map((benefit) => <div key={benefit} className="flex items-start gap-2 text-sm text-slate-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>{benefit}</span></div>)}</div>
                <div className="mt-6 inline-flex items-center text-sm font-semibold text-orange-700">Conhecer produto<ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" /></div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="vendor-section-alt bg-white"><div className="container mx-auto px-4 py-16 text-center"><h2 className="text-3xl font-bold tracking-[-0.03em] text-slate-950 md:text-4xl">Quer ver quais produtos fazem mais sentido para sua empresa?</h2><p className="mx-auto mt-4 max-w-2xl text-slate-600">O VendorAI pode ser configurado conforme o segmento, operação, equipe e nível de automação desejado.</p><Link href="/demo" className="mt-8 inline-flex h-12 items-center rounded-xl bg-orange-500 px-6 font-semibold text-white shadow-[0_12px_34px_rgba(249,115,22,0.18)] transition hover:bg-orange-600">Testar 5 dias grátis<ArrowRight className="ml-2 h-4 w-4" /></Link></div></section>
    </div>
  );
}
