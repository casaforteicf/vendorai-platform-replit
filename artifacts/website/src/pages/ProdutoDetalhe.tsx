import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleDot, ImageIcon, PlugZap, Sparkles } from "lucide-react";
import { getProduct } from "@/data/allProducts";
import {
  catalogImages,
  fetchPublicVendorProductBySlug,
  formatCatalogPrice,
  productSkuBySlug,
  recurrenceLabel,
  type PublicCatalogProduct,
} from "@/lib/publicProductCatalog";

function ProductMedia({ product, name }: { product: PublicCatalogProduct | null; name: string }) {
  const images = useMemo(() => catalogImages(product), [product]);
  if (!images.length) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-center">
        <div className="max-w-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-300"><ImageIcon className="h-6 w-6" /></span>
          <h3 className="mt-5 text-lg font-semibold">Imagens reais do {name}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">A galeria desta página já usa o cadastro oficial. Os prints aparecem automaticamente assim que forem adicionados ao produto no catálogo.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <a href={images[0]} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-3xl border border-white/10 bg-[#0b1220] shadow-2xl shadow-black/30">
        <img src={images[0]} alt={`Tela real do ${name}`} className="w-full" loading="eager" />
      </a>
      {images.length > 1 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{images.slice(1, 7).map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-2xl border border-white/10"><img src={url} alt={`${name} - tela real ${index + 2}`} className="aspect-video h-full w-full object-cover" loading="lazy" /></a>)}</div>}
    </div>
  );
}

export default function ProdutoDetalhe() {
  const [, params] = useRoute("/produtos/:slug");
  const slug = params?.slug ?? "";
  const product = getProduct(slug);
  const linked = Boolean(productSkuBySlug[slug]);
  const [catalog, setCatalog] = useState<PublicCatalogProduct | null>(null);
  const [loading, setLoading] = useState(linked);

  useEffect(() => {
    let cancelled = false;
    if (!linked) { setCatalog(null); setLoading(false); return; }
    setLoading(true);
    fetchPublicVendorProductBySlug(slug)
      .then((value) => { if (!cancelled) setCatalog(value); })
      .catch(() => { if (!cancelled) setCatalog(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug, linked]);

  useEffect(() => {
    if (!product) return;
    const oldTitle = document.title;
    document.title = `${catalog?.nome ?? product.name} | VendorAI`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "description"); document.head.appendChild(meta); }
    const oldDescription = meta.getAttribute("content") ?? "";
    meta.setAttribute("content", catalog?.descricao ?? product.summary);
    return () => { document.title = oldTitle; meta?.setAttribute("content", oldDescription); };
  }, [product, catalog]);

  if (!product) return <div className="bg-[#070b14] px-4 py-24 text-center text-white"><h1 className="text-3xl font-bold">Produto não encontrado</h1><Link href="/produtos" className="mt-6 inline-flex items-center text-orange-300"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Produtos</Link></div>;

  const name = catalog?.nome ?? product.name;
  const summary = catalog?.descricao ?? product.summary;
  const description = catalog?.descricao_longa ?? product.description;
  const price = formatCatalogPrice(catalog);
  const recurrence = recurrenceLabel(catalog);
  const images = catalogImages(catalog);

  return (
    <div className="bg-[#070b14] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_18%_10%,rgba(249,115,22,0.18),transparent_30%),radial-gradient(circle_at_82%_20%,rgba(37,99,235,0.14),transparent_28%)]">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <Link href="/produtos" className="mb-8 inline-flex items-center text-sm font-medium text-slate-400 hover:text-white"><ArrowLeft className="mr-2 h-4 w-4" /> Todos os produtos</Link>
          <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_.98fr]">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-300">{product.eyebrow}</div>
              <h1 className="mt-4 text-4xl font-bold tracking-[-0.045em] md:text-6xl">{name}</h1>
              <p className="mt-6 max-w-3xl text-xl leading-8 text-slate-300">{summary}</p>
              <p className="mt-5 max-w-3xl leading-7 text-slate-400">{description}</p>
              {linked && <div className="mt-7 max-w-lg rounded-2xl border border-orange-400/20 bg-orange-500/[0.07] p-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Investimento</p>{loading ? <div className="mt-2 h-10 w-44 animate-pulse rounded-lg bg-white/10" /> : price ? <div className="mt-2 flex items-end gap-2"><span className="text-4xl font-bold">{price}</span><span className="pb-1 text-slate-400">{recurrence}</span></div> : <p className="mt-2 text-sm text-slate-300">Consulte o valor no catálogo comercial.</p>}<p className="mt-2 text-xs text-slate-500">Preço sincronizado com o catálogo oficial do VendorAI.</p></div>}
              <div className="mt-8 flex flex-wrap gap-3"><Link href="/demo" className="inline-flex h-12 items-center rounded-xl bg-orange-500 px-6 font-semibold hover:bg-orange-400">Testar 5 dias grátis <ArrowRight className="ml-2 h-4 w-4" /></Link><Link href="/contato" className="inline-flex h-12 items-center rounded-xl border border-white/10 bg-white/[0.04] px-6 font-semibold text-slate-200">Falar com vendas</Link></div>
            </div>
            {linked ? <ProductMedia product={catalog} name={name} /> : <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8"><Sparkles className="h-8 w-8 text-orange-300" /><h3 className="mt-5 text-2xl font-bold">{name}</h3><p className="mt-3 leading-7 text-slate-400">{summary}</p></div>}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 md:py-20"><div className="grid gap-12 lg:grid-cols-2"><div><h2 className="text-3xl font-bold">Recursos principais</h2><div className="mt-7 grid gap-3 sm:grid-cols-2">{product.features.map((feature) => <div key={feature} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"><CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" /><span className="text-sm text-slate-300">{feature}</span></div>)}</div></div><div><h2 className="text-3xl font-bold">Resultados esperados</h2><div className="mt-7 space-y-3">{product.benefits.map((benefit) => <div key={benefit} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/10 p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /><span>{benefit}</span></div>)}</div></div></div></section>

      {linked && images.length > 0 && <section className="border-y border-white/10 bg-white/[0.018]"><div className="container mx-auto px-4 py-16 md:py-20"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-300">Telas reais</p><h2 className="mt-3 text-3xl font-bold">Veja o {name} em uso</h2><div className="mt-8 grid gap-4 md:grid-cols-2">{images.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-2xl border border-white/10"><img src={url} alt={`${name} - tela real ${index + 1}`} className="w-full" loading="lazy" /></a>)}</div></div></section>}

      <section className="container mx-auto px-4 py-16 md:py-20"><div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-300">Aplicações práticas</p><h2 className="mt-3 text-3xl font-bold">Onde usar no dia a dia</h2></div><div className="grid gap-3 sm:grid-cols-2">{product.useCases.map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-slate-300">{item}</div>)}</div></div></section>

      <section className="border-y border-white/10 bg-white/[0.025]"><div className="container mx-auto px-4 py-16"><div className="flex items-center gap-3"><PlugZap className="h-6 w-6 text-orange-300" /><h2 className="text-3xl font-bold">Integrações</h2></div><div className="mt-8 flex flex-wrap gap-3">{product.integrations.map((integration) => <span key={integration} className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-sm">{integration}</span>)}</div></div></section>

      <section className="container mx-auto px-4 py-16 md:py-24"><div className="rounded-[2rem] border border-orange-400/20 bg-white/[0.03] px-6 py-12 text-center md:py-16"><Sparkles className="mx-auto h-7 w-7 text-orange-300" /><h2 className="mx-auto mt-4 max-w-3xl text-3xl font-bold md:text-4xl">Veja o {name} funcionando dentro do VendorAI</h2>{price && <p className="mt-4 text-xl"><strong>{price}{recurrence}</strong></p>}<div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/demo" className="inline-flex h-12 items-center rounded-xl bg-orange-500 px-6 font-semibold">Começar teste grátis <ArrowRight className="ml-2 h-4 w-4" /></Link><Link href="/contato" className="inline-flex h-12 items-center rounded-xl border border-white/10 bg-white/[0.04] px-6 font-semibold">Solicitar demonstração</Link></div></div></section>
    </div>
  );
}
