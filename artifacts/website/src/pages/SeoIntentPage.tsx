import { Link, useLocation } from "wouter";
import { ArrowRight, BarChart3, CheckCircle2, Search, Sparkles } from "lucide-react";
import growthMatrix from "@/data/seoGrowthMatrix.json";
import { usePublicCountry } from "@/lib/publicCountry";

type LocaleCopy = {
  seoTitle: string;
  seoDescription: string;
  eyebrow: string;
  headline: string;
  subheadline: string;
  problems: string[];
  how: string[];
  opportunities: string[];
  benefits: string[];
  metrics: string[];
  faq: { q: string; a: string }[];
  cta: string;
};

type GrowthPage = {
  path: string;
  kind: "solution" | "comparison";
  cluster: string;
  priority: number;
  intent: string;
  funnel: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  products: { label: string; href: string }[];
  pt: LocaleCopy;
  es: LocaleCopy;
};

const LABELS = {
  pt: {
    backSolutions: "Ver soluções por problema",
    backComparisons: "Ver todas as comparações",
    problem: "O problema que esta busca normalmente revela",
    how: "Como o VendorAI trata tecnicamente",
    comparison: "Diferenças que importam na operação",
    opportunities: "Oportunidades que podem ficar invisíveis",
    benefits: "O que muda para a empresa",
    metrics: "Indicadores para acompanhar",
    related: "Soluções relacionadas",
    relatedGuides: "Continue explorando",
    faq: "Perguntas frequentes",
    trial: "Testar 5 dias grátis",
    sales: "Falar com vendas",
    keywords: "Também relacionado a",
  },
  es: {
    backSolutions: "Ver soluciones por problema",
    backComparisons: "Ver todas las comparaciones",
    problem: "El problema que esta búsqueda suele revelar",
    how: "Cómo lo aborda técnicamente VendorAI",
    comparison: "Diferencias que importan en la operación",
    opportunities: "Oportunidades que pueden quedar invisibles",
    benefits: "Qué cambia para la empresa",
    metrics: "Indicadores para acompañar",
    related: "Soluciones relacionadas",
    relatedGuides: "Sigue explorando",
    faq: "Preguntas frecuentes",
    trial: "Probar 5 días gratis",
    sales: "Hablar con ventas",
    keywords: "También relacionado con",
  },
} as const;

function cleanPath(location: string) {
  return location.split("?")[0].replace(/\/$/, "") || "/";
}

export default function SeoIntentPage() {
  const [location] = useLocation();
  const { isSpanish } = usePublicCountry();
  const pages = growthMatrix.pages as GrowthPage[];
  const page = pages.find((entry) => entry.path === cleanPath(location));
  const labels = isSpanish ? LABELS.es : LABELS.pt;

  if (!page) {
    return (
      <section className="bg-white py-24">
        <div className="container mx-auto max-w-3xl px-4 text-center">
          <h1 className="text-3xl font-bold text-slate-950">Página não encontrada</h1>
          <Link href="/solucoes" className="mt-6 inline-flex items-center gap-2 font-semibold text-orange-600">
            {labels.backSolutions}<ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    );
  }

  const copy = isSpanish ? page.es : page.pt;
  const howTitle = page.kind === "comparison" ? labels.comparison : labels.how;
  const hubHref = page.kind === "comparison" ? "/comparar" : "/solucoes";
  const hubLabel = page.kind === "comparison" ? labels.backComparisons : labels.backSolutions;
  const relatedPages = pages
    .filter((entry) => entry.path !== page.path && entry.kind === page.kind)
    .sort((a, b) => Number(b.cluster === page.cluster) - Number(a.cluster === page.cluster) || b.priority - a.priority)
    .slice(0, 3);

  return (
    <div className="bg-white text-slate-900">
      <section className="border-b border-slate-200 bg-gradient-to-b from-orange-50/70 via-white to-white py-16 md:py-24">
        <div className="container mx-auto max-w-6xl px-4">
          <Link href={hubHref} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-orange-600">
            ← {hubLabel}
          </Link>
          <div className="grid gap-10 lg:grid-cols-[1.25fr_.75fr] lg:items-center">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
                <Sparkles className="h-3.5 w-3.5" /> {copy.eyebrow}
              </div>
              <h1 className="max-w-4xl text-4xl font-black leading-[1.05] tracking-tight text-slate-950 md:text-6xl">{copy.headline}</h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-600 md:text-xl">{copy.subheadline}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/demo" className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 font-bold text-white shadow-[0_12px_32px_rgba(249,115,22,.22)] transition hover:bg-orange-600">
                  {labels.trial}<ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/contato" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 font-bold text-slate-800 transition hover:border-orange-300 hover:text-orange-700">
                  {labels.sales}
                </Link>
              </div>
            </div>
            <aside className="rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_24px_70px_rgba(15,23,42,.08)]">
              <div className="flex items-center gap-3 text-sm font-bold text-slate-950"><Search className="h-5 w-5 text-orange-500" />{page.primaryKeyword}</div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">{labels.keywords}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {page.secondaryKeywords.map((keyword) => <span key={keyword} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{keyword}</span>)}
              </div>
              <div className="mt-7 border-t border-slate-100 pt-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{labels.related}</p>
                <div className="mt-3 space-y-2">
                  {page.products.map((product) => (
                    <Link key={product.href} href={product.href} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-orange-300 hover:bg-orange-50/60 hover:text-orange-700">
                      {product.label}<ArrowRight className="h-4 w-4" />
                    </Link>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container mx-auto grid max-w-6xl gap-6 px-4 lg:grid-cols-2">
          <ContentCard title={labels.problem} items={copy.problems} icon={<Search className="h-5 w-5" />} />
          <ContentCard title={howTitle} items={copy.how} icon={<Sparkles className="h-5 w-5" />} />
          <ContentCard title={labels.opportunities} items={copy.opportunities} icon={<BarChart3 className="h-5 w-5" />} />
          <ContentCard title={labels.benefits} items={copy.benefits} icon={<CheckCircle2 className="h-5 w-5" />} />
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 py-16">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700"><BarChart3 className="h-5 w-5" /></div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">{labels.metrics}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {copy.metrics.map((metric) => <div key={metric} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm">{metric}</div>)}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="mb-7 flex items-end justify-between gap-4">
            <h2 className="text-3xl font-black tracking-tight text-slate-950">{labels.relatedGuides}</h2>
            <Link href={hubHref} className="hidden items-center gap-2 text-sm font-bold text-orange-600 hover:text-orange-700 sm:inline-flex">{hubLabel}<ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {relatedPages.map((related) => {
              const relatedCopy = isSpanish ? related.es : related.pt;
              return (
                <Link key={related.path} href={related.path} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-orange-200 hover:shadow-md">
                  <p className="text-xs font-bold uppercase tracking-[0.13em] text-orange-700">{related.cluster}</p>
                  <h3 className="mt-3 text-lg font-black leading-snug text-slate-950 group-hover:text-orange-700">{relatedCopy.headline}</h3>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-orange-600">{related.primaryKeyword}<ArrowRight className="h-4 w-4" /></span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 py-16 md:py-20">
        <div className="container mx-auto max-w-4xl px-4">
          <h2 className="text-3xl font-black tracking-tight text-slate-950">{labels.faq}</h2>
          <div className="mt-8 space-y-4">
            {copy.faq.map((item) => (
              <div key={item.q} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="font-bold text-slate-950">{item.q}</h3>
                <p className="mt-2 leading-7 text-slate-600">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#fff7ed] py-16">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <p className="text-2xl font-black leading-tight text-slate-950 md:text-3xl">{copy.cta}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/demo" className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 font-bold text-white transition hover:bg-orange-600">{labels.trial}<ArrowRight className="h-4 w-4" /></Link>
            <Link href="/precos" className="inline-flex items-center rounded-xl border border-orange-200 bg-white px-6 py-3.5 font-bold text-slate-800 transition hover:border-orange-400">VendorAI Growth</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContentCard({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_16px_50px_rgba(15,23,42,.05)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700">{icon}</div>
        <h2 className="text-xl font-black tracking-tight text-slate-950">{title}</h2>
      </div>
      <ul className="mt-6 space-y-4">
        {items.map((item) => (
          <li key={item} className="flex gap-3 leading-7 text-slate-600">
            <CheckCircle2 className="mt-1.5 h-4 w-4 shrink-0 text-emerald-500" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
