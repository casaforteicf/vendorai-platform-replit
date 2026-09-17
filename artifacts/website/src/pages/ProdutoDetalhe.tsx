import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDot,
  Cpu,
  PlugZap,
  Radar,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { getProduct } from "@/data/allProducts";
import { getProductSalesContent } from "@/data/productSalesContent";
import { getProductVisuals, type ProductVisual } from "@/data/productVisuals";
import {
  catalogImages,
  fetchPublicVendorProductBySlug,
  productSkuBySlug,
  type PublicCatalogProduct,
} from "@/lib/publicProductCatalog";

function resolveMedia(product: PublicCatalogProduct | null, slug: string, name: string): ProductVisual[] {
  const official = catalogImages(product);
  if (official.length) {
    return official.map((src, index) => ({ src, label: index === 0 ? `Tela real do ${name}` : `${name} — tela ${index + 1}` }));
  }
  return getProductVisuals(slug);
}

function ProductMedia({ items, name }: { items: ProductVisual[]; name: string }) {
  const main = items[0];
  return (
    <div className="space-y-3">
      <a href={main.src} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{main.label}</p>
        </div>
        {main.mobile ? (
          <picture>
            <source media="(max-width: 640px)" srcSet={main.mobile} />
            <img src={main.src} alt={`${name} — ${main.label}`} className="aspect-[16/9] w-full object-cover object-top transition duration-300 group-hover:scale-[1.01]" loading="eager" />
          </picture>
        ) : (
          <img src={main.src} alt={`${name} — ${main.label}`} className="aspect-[16/9] w-full object-cover object-top transition duration-300 group-hover:scale-[1.01]" loading="eager" />
        )}
      </a>
      {items.length > 1 && (
        <div className="grid grid-cols-2 gap-3">
          {items.slice(1, 3).map((item) => (
            <a key={`${item.src}-${item.label}`} href={item.src} target="_blank" rel="noreferrer" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <img src={item.src} alt={`${name} — ${item.label}`} className="aspect-video h-full w-full object-cover object-top" loading="lazy" />
            </a>
          ))}
        </div>
      )}
      <p className="text-xs leading-5 text-slate-500">Telas reais do VendorAI. Quando o produto ainda não possui galeria própria cadastrada, mostramos uma tela real do ecossistema diretamente relacionada à sua operação.</p>
    </div>
  );
}

function SalesList({ items, accent }: { items: string[]; accent: "orange" | "blue" | "emerald" }) {
  const classes = {
    orange: "border-orange-200 bg-orange-50 text-orange-600",
    blue: "border-blue-200 bg-blue-50 text-blue-600",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-600",
  } as const;
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item} className={`flex items-start gap-3 rounded-2xl border p-4 ${classes[accent]}`}>
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="text-sm leading-6 text-slate-700">{item}</span>
        </div>
      ))}
    </div>
  );
}

export default function ProdutoDetalhe() {
  const [, params] = useRoute("/produtos/:slug");
  const slug = params?.slug ?? "";
  const product = getProduct(slug);
  const sales = getProductSalesContent(slug);
  const linked = Boolean(productSkuBySlug[slug]);
  const [catalog, setCatalog] = useState<PublicCatalogProduct | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!linked) {
      setCatalog(null);
      return;
    }
    fetchPublicVendorProductBySlug(slug)
      .then((value) => { if (!cancelled) setCatalog(value); })
      .catch(() => { if (!cancelled) setCatalog(null); });
    return () => { cancelled = true; };
  }, [slug, linked]);

  useEffect(() => {
    if (!product) return;
    const oldTitle = document.title;
    document.title = `${catalog?.nome ?? product.name} | VendorAI`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    const oldDescription = meta.getAttribute("content") ?? "";
    meta.setAttribute("content", catalog?.descricao ?? product.summary);
    return () => {
      document.title = oldTitle;
      meta?.setAttribute("content", oldDescription);
    };
  }, [product, catalog]);

  if (!product) {
    return (
      <div className="bg-white px-4 py-24 text-center text-slate-950">
        <h1 className="text-3xl font-bold">Produto não encontrado</h1>
        <Link href="/produtos" className="mt-6 inline-flex items-center text-orange-600"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Produtos</Link>
      </div>
    );
  }

  const name = catalog?.nome ?? product.name;
  const summary = catalog?.descricao ?? product.summary;
  const description = catalog?.descricao_longa ?? product.description;
  const media = useMemo(() => resolveMedia(catalog, slug, name), [catalog, slug, name]);

  return (
    <div className="bg-[#f7f8fa] text-slate-950">
      <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_12%_12%,rgba(249,115,22,0.10),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(59,130,246,0.08),transparent_30%),linear-gradient(to_bottom,#ffffff,#f8fafc)]">
        <div className="container mx-auto px-4 py-14 md:py-20">
          <Link href="/produtos" className="mb-8 inline-flex items-center text-sm font-medium text-slate-500 transition hover:text-slate-950"><ArrowLeft className="mr-2 h-4 w-4" /> Todos os produtos</Link>
          <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_.98fr]">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-600">{product.eyebrow}</div>
              <h1 className="mt-4 text-4xl font-bold tracking-[-0.045em] text-slate-950 md:text-6xl">{name}</h1>
              <p className="mt-6 max-w-3xl text-xl leading-8 text-slate-700">{summary}</p>
              <p className="mt-5 max-w-3xl leading-7 text-slate-600">{description}</p>

              {sales?.positioning && (
                <div className="mt-6 max-w-3xl rounded-2xl border border-blue-200 bg-blue-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Visão técnica vendedora</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{sales.positioning}</p>
                </div>
              )}

              <div className="mt-7 max-w-xl rounded-2xl border border-orange-200 bg-orange-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">Condição comercial</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">As condições desta solução são apresentadas nas landing pages e campanhas correspondentes. O site institucional não publica uma tabela genérica de preços.</p>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/demo" className="inline-flex h-12 items-center rounded-xl bg-orange-600 px-6 font-semibold text-white shadow-sm transition hover:bg-orange-500">Testar 5 dias grátis <ArrowRight className="ml-2 h-4 w-4" /></Link>
                <Link href="/contato" className="inline-flex h-12 items-center rounded-xl border border-slate-300 bg-white px-6 font-semibold text-slate-800 transition hover:bg-slate-50">Falar com vendas</Link>
              </div>
            </div>

            <ProductMedia items={media} name={name} />
          </div>
        </div>
      </section>

      {sales && (
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-[28px] border border-orange-200 bg-white p-6 shadow-sm md:p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-600"><Cpu className="h-5 w-5" /></div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">Arquitetura e operação</p>
              <h2 className="mt-2 text-2xl font-bold">Como funciona tecnicamente</h2>
              <div className="mt-6"><SalesList items={sales.technical} accent="orange" /></div>
            </div>
            <div className="rounded-[28px] border border-blue-200 bg-white p-6 shadow-sm md:p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-600"><Radar className="h-5 w-5" /></div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Inteligência aplicada</p>
              <h2 className="mt-2 text-2xl font-bold">Oportunidades que pode encontrar</h2>
              <div className="mt-6"><SalesList items={sales.opportunities} accent="blue" /></div>
            </div>
            <div className="rounded-[28px] border border-emerald-200 bg-white p-6 shadow-sm md:p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600"><TrendingUp className="h-5 w-5" /></div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">Impacto empresarial</p>
              <h2 className="mt-2 text-2xl font-bold">O que melhora na empresa</h2>
              <div className="mt-6"><SalesList items={sales.improvements} accent="emerald" /></div>
            </div>
          </div>
        </section>
      )}

      <section className="border-y border-slate-200 bg-white">
        <div className="container mx-auto px-4 py-16 md:py-20">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold">Recursos principais</h2>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {product.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" /><span className="text-sm text-slate-700">{feature}</span></div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-3xl font-bold">Resultados esperados</h2>
              <div className="mt-7 space-y-3">
                {product.benefits.map((benefit) => (
                  <div key={benefit} className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><span className="text-slate-700">{benefit}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {sales && (
        <section className="container mx-auto px-4 py-16 md:py-20">
          <div className="grid items-start gap-10 lg:grid-cols-[.7fr_1.3fr]">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-600"><BarChart3 className="h-5 w-5" /></div>
              <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-violet-600">Gestão e ROI</p>
              <h2 className="mt-3 text-3xl font-bold">Indicadores que mostram o valor da solução</h2>
              <p className="mt-4 text-sm leading-6 text-slate-600">A página não promete ganho automático. Estes indicadores ajudam a medir se a solução está reduzindo gargalos, aumentando produtividade ou contribuindo para mais receita.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sales.metrics.map((metric) => (
                <div key={metric} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs uppercase tracking-[0.15em] text-slate-400">Indicador</p><p className="mt-2 font-semibold text-slate-900">{metric}</p></div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="border-y border-slate-200 bg-white">
        <div className="container mx-auto px-4 py-16 md:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-600">Produto por dentro</p>
          <h2 className="mt-3 text-3xl font-bold">Veja telas reais conectadas ao {name}</h2>
          <p className="mt-3 max-w-3xl text-slate-600">A galeria prioriza imagens cadastradas no produto. Quando ainda não existe galeria própria, usa capturas reais de módulos do VendorAI que participam diretamente da mesma jornada.</p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {media.map((item) => (
              <a key={`${item.src}-${item.label}`} href={item.src} target="_blank" rel="noreferrer" className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">{item.label}</div>
                <img src={item.src} alt={`${name} — ${item.label}`} className="aspect-[16/9] w-full object-cover object-top" loading="lazy" />
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-600">Aplicações práticas</p>
            <h2 className="mt-3 text-3xl font-bold">Onde usar no dia a dia</h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">Casos típicos em que esta solução entra diretamente na operação.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {product.useCases.map((item) => <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-700 shadow-sm">{item}</div>)}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="container mx-auto px-4 py-16">
          <div className="flex items-center gap-3"><PlugZap className="h-6 w-6 text-orange-600" /><h2 className="text-3xl font-bold">Integrações</h2></div>
          <div className="mt-8 flex flex-wrap gap-3">
            {product.integrations.map((integration) => <span key={integration} className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">{integration}</span>)}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="rounded-[2rem] border border-orange-200 bg-[linear-gradient(135deg,#fff7ed,#ffffff_55%,#eff6ff)] px-6 py-12 text-center shadow-sm md:py-16">
          <Sparkles className="mx-auto h-7 w-7 text-orange-600" />
          <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-bold md:text-4xl">Veja o {name} funcionando dentro do VendorAI</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-600">A condição comercial é apresentada na LP/campanha correspondente e segue com o cadastro.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/demo" className="inline-flex h-12 items-center rounded-xl bg-orange-600 px-6 font-semibold text-white transition hover:bg-orange-500">Começar teste grátis <ArrowRight className="ml-2 h-4 w-4" /></Link>
            <Link href="/contato" className="inline-flex h-12 items-center rounded-xl border border-slate-300 bg-white px-6 font-semibold text-slate-800 transition hover:bg-slate-50">Solicitar demonstração</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
