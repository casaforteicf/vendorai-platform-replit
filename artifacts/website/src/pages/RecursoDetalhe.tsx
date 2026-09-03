import { Link, useParams } from "wouter";
import { ArrowRight, ArrowLeft, CheckCircle2, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FEATURES } from "@/data/features";
import { BrowserMockup, ReportMockup, ArticleMockup, BudgetMockup } from "@/components/FeatureMockups";
import NotFound from "@/pages/not-found";

function FeatureVisual({ slug }: { slug: string }) {
  switch (slug) {
    case "gerador-de-sites":
      return <BrowserMockup url="minhaempresa.appvendorai.com" heading="Sua empresa, no ar em minutos" sub="Gerado pela IA a partir de uma descrição do seu negócio" accent="#3B82F6" />;
    case "lps-por-vertical":
      return <BrowserMockup url="appvendorai.com/lp/distribuidora-autopecas" heading="Feito pra distribuidoras de autopeças" sub="Jornada, dores e agentes prioritários desse mercado específico" accent="#22C55E" />;
    case "analise-de-site":
      return <ReportMockup score={62} items={[{ label: "Meta description presente", ok: true }, { label: "Hierarquia de headings correta", ok: false }, { label: "Título otimizado pra busca", ok: true }, { label: "Chamada pra ação clara", ok: false }, { label: "Tempo de carregamento", ok: true }]} />;
    case "content-autopilot":
      return <ArticleMockup title="Como escolher o CRM certo pra distribuidora em 2026" tags={["crm distribuidora", "gestão de carteira", "b2b vendas"]} />;
    case "plano-de-midia":
      return <BudgetMockup channels={[{ name: "Google Ads", pct: 45, priority: "alta" }, { name: "Meta Ads", pct: 30, priority: "alta" }, { name: "Conteúdo orgânico", pct: 15, priority: "media" }, { name: "Indicação", pct: 10, priority: "baixa" }]} />;
    default:
      return null;
  }
}

export default function RecursoDetalhe() {
  const { slug } = useParams<{ slug: string }>();
  const feature = FEATURES.find((f) => f.slug === slug);
  if (!feature) return <NotFound />;

  const Icon = feature.icon;
  const others = FEATURES.filter((f) => f.slug !== feature.slug);

  return (
    <div className="min-h-screen bg-white">
      <section className="relative overflow-hidden border-b border-white/10 bg-[#070b14] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(37,99,235,0.25),transparent_34%),radial-gradient(circle_at_78%_20%,rgba(99,102,241,0.18),transparent_30%),linear-gradient(180deg,#0a1020_0%,#070b14_76%)]" />
        <div className="container relative mx-auto grid gap-12 px-4 py-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center md:py-24">
          <div>
            <Link href="/funcionalidades" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
              <ArrowLeft className="h-3.5 w-3.5" /> Todas as funcionalidades
            </Link>
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-400/10 text-blue-300">
              <Icon className="h-7 w-7" />
            </div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">{feature.eyebrow}</p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-5xl">{feature.title}</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">{feature.subtitle}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-14 rounded-xl bg-blue-500 px-7 text-base font-semibold text-white hover:bg-blue-400">
                <Link href="/demo">{feature.ctaLabel} <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-10 rounded-[48px] bg-blue-500/10 blur-3xl" />
            <div className="relative"><FeatureVisual slug={feature.slug} /></div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Como funciona</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-slate-950 md:text-4xl">Do zero ao resultado, sem complicação</h2>
          </div>
          <div className="mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-3">
            {feature.howItWorks.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">{i + 1}</div>
                <h3 className="mt-5 text-lg font-semibold text-slate-950">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 py-20 md:py-24">
        <div className="container mx-auto grid gap-8 px-4 lg:grid-cols-2">
          <div className="rounded-[28px] border border-slate-200 bg-white p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Search className="h-5 w-5" /></div>
            <p className="mt-5 text-sm font-bold uppercase tracking-[0.16em] text-blue-600">SEO e otimização</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{feature.seo.title}</h3>
            <p className="mt-4 leading-7 text-slate-600">{feature.seo.desc}</p>
          </div>
          <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><Sparkles className="h-5 w-5" /></div>
            <p className="mt-5 text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Aprendizado contínuo</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{feature.learning.title}</h3>
            <p className="mt-4 leading-7 text-slate-700">{feature.learning.desc}</p>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <p className="text-center text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Outras funcionalidades de IA</p>
          <div className="mx-auto mt-8 grid max-w-5xl gap-4 md:grid-cols-3">
            {others.map((f) => (
              <Link key={f.slug} href={`/funcionalidades/${f.slug}`} className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:border-blue-300">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><f.icon className="h-4 w-4" /></div>
                <h3 className="mt-4 font-semibold text-slate-950">{f.title}</h3>
                <p className="mt-2 flex items-center gap-1 text-sm font-medium text-blue-600">Ver funcionalidade <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 md:pb-28">
        <div className="container mx-auto overflow-hidden rounded-[34px] bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 px-6 py-14 text-center text-white shadow-[0_35px_100px_rgba(37,99,235,0.28)] md:px-12 md:py-16">
          <CheckCircle2 className="mx-auto h-10 w-10 text-blue-100" />
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.035em] md:text-4xl">Teste com sua própria empresa, sem cobrança</h2>
          <Button asChild size="lg" className="mt-8 h-14 rounded-xl bg-white px-8 text-blue-700 hover:bg-blue-50">
            <Link href="/demo">Começar meus 5 dias grátis <ArrowRight className="ml-2 h-5 w-5" /></Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
