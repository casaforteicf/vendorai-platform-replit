import { Link, useLocation } from "wouter";
import { ArrowRight, GitCompareArrows, Search, Sparkles } from "lucide-react";
import growthMatrix from "@/data/seoGrowthMatrix.json";
import { usePublicCountry } from "@/lib/publicCountry";

type GrowthPage = {
  path: string;
  kind: "solution" | "comparison";
  cluster: string;
  primaryKeyword: string;
  products: { label: string; href: string }[];
  pt: { headline: string; subheadline: string };
  es: { headline: string; subheadline: string };
};

const COPY = {
  pt: {
    solution: {
      eyebrow: "Soluções por problema",
      title: "Encontre a solução pelo problema que sua operação quer resolver.",
      description: "Guias comerciais e técnicos sobre CRM, WhatsApp, follow-up, recuperação, recompra, prospecção e inteligência de receita — conectados aos produtos VendorAI.",
      card: "Ver solução",
    },
    comparison: {
      eyebrow: "Comparações para decidir",
      title: "Compare modelos de operação antes de escolher a tecnologia.",
      description: "Veja o que muda entre processos tradicionais e operações apoiadas por IA em CRM, follow-up e prospecção, com critérios práticos para avaliar impacto.",
      card: "Ver comparação",
    },
    products: "Produtos relacionados",
    cta: "Quer avaliar isso na sua operação?",
    trial: "Testar 5 dias grátis",
  },
  es: {
    solution: {
      eyebrow: "Soluciones por problema",
      title: "Encuentra la solución según el problema que tu operación necesita resolver.",
      description: "Guías comerciales y técnicas sobre CRM, WhatsApp, seguimiento, recuperación, recompra, prospección e inteligencia de ingresos conectadas con los productos VendorAI.",
      card: "Ver solución",
    },
    comparison: {
      eyebrow: "Comparaciones para decidir",
      title: "Compara modelos de operación antes de elegir la tecnología.",
      description: "Conoce qué cambia entre procesos tradicionales y operaciones apoyadas por IA en CRM, seguimiento y prospección, con criterios prácticos para evaluar impacto.",
      card: "Ver comparación",
    },
    products: "Productos relacionados",
    cta: "¿Quieres evaluarlo en tu operación?",
    trial: "Probar 5 días gratis",
  },
} as const;

export default function SeoIntentHub() {
  const [location] = useLocation();
  const { isSpanish } = usePublicCountry();
  const locale = isSpanish ? "es" : "pt";
  const kind: GrowthPage["kind"] = location.split("?")[0].startsWith("/comparar") ? "comparison" : "solution";
  const copy = COPY[locale][kind];
  const pages = (growthMatrix.pages as GrowthPage[]).filter((page) => page.kind === kind);
  const Icon = kind === "comparison" ? GitCompareArrows : Sparkles;

  return (
    <div className="bg-white text-slate-900">
      <section className="border-b border-slate-200 bg-gradient-to-b from-orange-50/70 via-white to-white py-16 md:py-24">
        <div className="container mx-auto max-w-6xl px-4 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
            <Icon className="h-3.5 w-3.5" /> {copy.eyebrow}
          </div>
          <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-black leading-[1.05] tracking-tight text-slate-950 md:text-6xl">{copy.title}</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-600 md:text-xl">{copy.description}</p>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container mx-auto grid max-w-6xl gap-5 px-4 md:grid-cols-2">
          {pages.map((page) => {
            const pageCopy = page[locale];
            return (
              <article key={page.path} className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_16px_50px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_22px_60px_rgba(15,23,42,.08)]">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-orange-700">
                  <Search className="h-4 w-4" /> {page.primaryKeyword}
                </div>
                <h2 className="mt-4 text-2xl font-black leading-tight tracking-tight text-slate-950">{pageCopy.headline}</h2>
                <p className="mt-4 flex-1 leading-7 text-slate-600">{pageCopy.subheadline}</p>
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{COPY[locale].products}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-600">{page.products.slice(0, 3).map((product) => product.label).join(" · ")}</p>
                </div>
                <Link href={page.path} className="mt-6 inline-flex items-center gap-2 font-bold text-orange-600 transition hover:text-orange-700">
                  {copy.card}<ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-t border-orange-100 bg-[#fff7ed] py-14">
        <div className="container mx-auto max-w-4xl px-4 text-center">
          <p className="text-2xl font-black text-slate-950 md:text-3xl">{COPY[locale].cta}</p>
          <Link href="/demo" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 font-bold text-white transition hover:bg-orange-600">
            {COPY[locale].trial}<ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
