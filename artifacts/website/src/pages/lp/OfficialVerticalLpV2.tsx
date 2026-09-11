import { Link } from "wouter";
import {
  OFFICIAL_TRIAL_5_DAYS,
  type MarketingVerticalProfile,
} from "@workspace/vendor-brain/marketing-verticals";
import {
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  LineChart,
  Radar,
  Route,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { useEffect } from "react";
import seoGrowthPages from "@/data/seoGrowthPages";
import { usePublicCountry } from "@/lib/publicCountry";

type GrowthPage = {
  path: string;
  kind: "solution" | "comparison";
  cluster: string;
  primaryKeyword: string;
  pt: { headline: string };
  es: { headline: string };
};

const COPY = {
  pt: {
    viewSegment: "Ver segmento",
    audience: "Público",
    painMap: "Problemas que travam receita",
    painTitle: "A operação perde oportunidades quando contexto, timing e próxima ação ficam espalhados.",
    promise: "Objetivo operacional",
    journey: "Jornada comercial",
    journeyTitle: "Da primeira intenção ao próximo ciclo de receita",
    stage: "Etapa",
    pipeline: "Pipeline da vertical",
    pipelineTitle: "O funil acompanha como a venda realmente acontece",
    agents: "Agentes prioritários",
    agentsTitle: "IA aplicada às etapas certas da operação",
    agentDescription: "Trabalha com contexto da jornada, histórico, etapa e regras definidas pela empresa.",
    scoutTitle: "Revenue Scout procura receita escondida na base",
    scoutDescription: (name: string) => `Sinais próprios de ${name.toLowerCase()} ajudam a identificar recompra, recuperação, expansão e próxima melhor ação.`,
    nextAction: "Próxima melhor ação",
    commercialScenarios: "Cenários comerciais",
    commercialScenariosTitle: "Situações que a equipe pode transformar em ação",
    relatedSolutions: "Soluções relacionadas",
    relatedSolutionsTitle: "Continue a jornada por problema comercial",
    relatedAction: "Ver solução",
    metrics: "Indicadores",
    metricsTitle: "O que medir para saber se a operação está melhorando",
    searchIntent: "Como este mercado costuma buscar a solução",
    trialKicker: "Teste na própria operação",
    trialTitle: "5 dias para enxergar valor com dados e jornada reais",
    trialDescription: "Cada dia deve entregar um avanço operacional — não apenas uma visita guiada ao software.",
    faq: "Perguntas frequentes",
    faqTitle: (name: string) => `VendorAI para ${name}: dúvidas comuns`,
    finalTitle: (name: string) => `Transforme a jornada de ${name.toLowerCase()} em uma operação comercial acompanhada por IA.`,
    finalDescription: "Comece pelo trial de 5 dias ou veja uma demonstração com pipeline, agentes e Revenue Scout aplicados à sua realidade.",
    trial: "Testar 5 dias grátis",
    demo: "Ver demonstração",
    solutionsHub: "Ver todas as soluções",
  },
  es: {
    viewSegment: "Ver segmento",
    audience: "Público",
    painMap: "Problemas que frenan ingresos",
    painTitle: "La operación pierde oportunidades cuando contexto, timing y próxima acción quedan dispersos.",
    promise: "Objetivo operativo",
    journey: "Jornada comercial",
    journeyTitle: "Desde la primera intención hasta el próximo ciclo de ingresos",
    stage: "Etapa",
    pipeline: "Pipeline de la vertical",
    pipelineTitle: "El embudo acompaña cómo ocurre realmente la venta",
    agents: "Agentes prioritarios",
    agentsTitle: "IA aplicada en las etapas correctas de la operación",
    agentDescription: "Trabaja con contexto de la jornada, historial, etapa y reglas definidas por la empresa.",
    scoutTitle: "Revenue Scout busca ingresos ocultos en la base",
    scoutDescription: (name: string) => `Señales propias de ${name.toLowerCase()} ayudan a identificar recompra, recuperación, expansión y próxima mejor acción.`,
    nextAction: "Próxima mejor acción",
    commercialScenarios: "Escenarios comerciales",
    commercialScenariosTitle: "Situaciones que el equipo puede convertir en acción",
    relatedSolutions: "Soluciones relacionadas",
    relatedSolutionsTitle: "Continúa la jornada según el problema comercial",
    relatedAction: "Ver solución",
    metrics: "Indicadores",
    metricsTitle: "Qué medir para saber si la operación está mejorando",
    searchIntent: "Cómo este mercado suele buscar la solución",
    trialKicker: "Prueba en tu propia operación",
    trialTitle: "5 días para ver valor con datos y jornada reales",
    trialDescription: "Cada día debe generar un avance operativo, no solamente una visita guiada al software.",
    faq: "Preguntas frecuentes",
    faqTitle: (name: string) => `VendorAI para ${name}: preguntas comunes`,
    finalTitle: (name: string) => `Convierte la jornada de ${name.toLowerCase()} en una operación comercial acompañada por IA.`,
    finalDescription: "Empieza con la prueba de 5 días o mira una demostración con pipeline, agentes y Revenue Scout aplicados a tu realidad.",
    trial: "Probar 5 días gratis",
    demo: "Ver demostración",
    solutionsHub: "Ver todas las soluciones",
  },
} as const;

const TRIAL_ES = [
  { day: 1, label: "Ver a la IA trabajar", description: "Recibir o simular un lead usando la jornada de la vertical." },
  { day: 2, label: "Automatizar", description: "Atención, calificación, seguimiento y agenda según el mercado." },
  { day: 3, label: "Organizar la venta", description: "Pipeline vertical, enfriamiento del lead y próxima mejor acción." },
  { day: 4, label: "Encontrar ingresos", description: "Oportunidades de recuperación y Revenue Scout." },
  { day: 5, label: "Mostrar resultados", description: "Resumen de leads, acciones, oportunidades e ingresos potenciales." },
] as const;

const B2B_MACROSEGMENTS = new Set(["distributors", "industries", "services"]);

function trackMarketingEvent(event: string, profile: MarketingVerticalProfile) {
  try {
    const win = window as unknown as { gtag?: (...args: unknown[]) => void };
    win.gtag?.("event", event, {
      vertical_id: profile.id,
      vertical_slug: profile.slug,
      macrosegment: profile.macrosegment,
      audience: profile.audience,
    });
  } catch {
    // Analytics never blocks the page.
  }
}

function getRelatedSolutions(profile: MarketingVerticalProfile) {
  const preferred = B2B_MACROSEGMENTS.has(profile.macrosegment)
    ? [
        "/solucoes/prospeccao-b2b-ia",
        "/solucoes/qualificar-leads-com-ia",
        "/solucoes/propostas-sem-resposta",
        "/solucoes/priorizar-oportunidades",
        "/solucoes/automatizar-follow-up",
        "/solucoes/next-best-action-vendas",
      ]
    : [
        "/solucoes/crm-whatsapp",
        "/solucoes/velocidade-resposta-leads",
        "/solucoes/automatizar-follow-up",
        "/solucoes/reativar-clientes",
        "/solucoes/aumentar-recompra",
        "/solucoes/next-best-action-vendas",
      ];

  const pages = seoGrowthPages as GrowthPage[];
  return preferred
    .map((path) => pages.find((page) => page.path === path))
    .filter((page): page is GrowthPage => Boolean(page))
    .slice(0, 4);
}

function CtaLink({ profile, secondary = false, compact = false }: { profile: MarketingVerticalProfile; secondary?: boolean; compact?: boolean }) {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? COPY.es : COPY.pt;
  const href = secondary
    ? `/demo?vertical=${encodeURIComponent(profile.slug)}`
    : `/demo?vertical=${encodeURIComponent(profile.slug)}&intent=trial-5-dias`;

  return (
    <a
      href={href}
      onClick={() => trackMarketingEvent(secondary ? "demo_started" : "trial_clicked", profile)}
      className={`${compact ? "px-4 py-2.5 text-xs" : "px-6 py-3.5 text-sm"} inline-flex items-center justify-center gap-2 rounded-xl font-bold transition ${
        secondary
          ? "border border-slate-300 bg-white text-slate-800 hover:border-orange-300 hover:text-orange-700"
          : "bg-orange-500 text-white shadow-[0_12px_32px_rgba(249,115,22,.22)] hover:bg-orange-600"
      }`}
    >
      {secondary ? copy.demo : copy.trial}
      <ArrowRight className="h-4 w-4" />
    </a>
  );
}

export default function OfficialVerticalLpV2({ profile }: { profile: MarketingVerticalProfile }) {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? COPY.es : COPY.pt;
  const trialItems = isSpanish ? TRIAL_ES : OFFICIAL_TRIAL_5_DAYS;
  const relatedSolutions = getRelatedSolutions(profile);

  useEffect(() => {
    trackMarketingEvent("vertical_page_view", profile);
  }, [profile]);

  const faqAnswers = isSpanish
    ? [
        `Sí. La página usa jornada, pipeline, agentes, señales e indicadores específicos de ${profile.name}.`,
        "No. VendorAI puede conectarse con los canales y procesos existentes para centralizar contexto y automatización.",
        `Sí. Los agentes prioritarios para esta operación son ${profile.priorityAgents.join(", ")}. El nivel de autonomía se configura por regla y permiso.`,
        "Sí. Cuando origen, oportunidad y venta permanecen en la misma jornada es posible medir qué canal y acción contribuyeron al resultado.",
        "La prueba se organiza en cinco días: primer valor, automatización, control comercial, inteligencia de ingresos y consolidación.",
      ]
    : [
        `Sim. A página usa jornada, pipeline, agentes, sinais e indicadores específicos de ${profile.name}.`,
        "Não. O VendorAI pode se conectar aos canais e processos existentes para centralizar contexto e automação.",
        `Sim. Os agentes prioritários para esta operação são ${profile.priorityAgents.join(", ")}. O nível de autonomia é configurado por regra e permissão.`,
        "Sim. Quando origem, oportunidade e venda permanecem na mesma jornada é possível medir qual canal e ação contribuíram para o resultado.",
        "O teste é organizado em cinco dias: primeiro valor, automação, controle comercial, inteligência de receita e consolidação.",
      ];

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-950 antialiased">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-sm font-black text-white shadow-sm">V</div>
            <div>
              <div className="text-base font-extrabold tracking-tight">VendorAI</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Business OS</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href={`/segmentos/${profile.macrosegment}`} className="hidden text-xs font-semibold text-slate-500 transition hover:text-orange-600 sm:block">{copy.viewSegment}</Link>
            <CtaLink profile={profile} compact />
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-slate-200 bg-white px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(249,115,22,.12),transparent_38%),radial-gradient(circle_at_90%_30%,rgba(59,130,246,.08),transparent_32%)]" />
          <div className="relative mx-auto max-w-5xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-orange-700">
              <Sparkles className="h-3.5 w-3.5" />{profile.lp.heroEyebrow}
            </div>
            <h1 className="mx-auto max-w-4xl text-4xl font-black leading-[1.04] tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">{profile.lp.headline}</h1>
            <p className="mx-auto mt-7 max-w-3xl text-base leading-8 text-slate-600 sm:text-xl">{profile.lp.subheadline}</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"><CtaLink profile={profile} /><CtaLink profile={profile} secondary /></div>
            <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{copy.audience}: {profile.audience}</span>
              {profile.decisionMakers.map((role) => <span key={role} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">{role}</span>)}
            </div>
          </div>
        </section>

        <section className="px-4 py-18 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-orange-600">{copy.painMap}</div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">{copy.painTitle}</h2>
              <p className="mt-4 leading-7 text-slate-600">{profile.corePain}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {profile.lp.painMap.map((pain, index) => (
                <div key={pain} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-xs font-black text-orange-700">{String(index + 1).padStart(2, "0")}</div>
                  <p className="font-bold leading-snug text-slate-900">{pain}</p>
                </div>
              ))}
            </div>
            <div className="mt-7 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
              <div className="flex gap-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div><div className="text-sm font-bold text-emerald-800">{copy.promise}</div><p className="mt-1 leading-7 text-emerald-950/75">{profile.promise}</p></div></div>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 text-center"><div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">{copy.journey}</div><h2 className="text-3xl font-black tracking-tight sm:text-4xl">{copy.journeyTitle}</h2></div>
            <div className="overflow-x-auto pb-4"><div className="flex min-w-max items-center gap-2">
              {profile.journey.map((step, index) => (
                <div key={`${step}-${index}`} className="flex items-center gap-2">
                  <button type="button" onClick={() => trackMarketingEvent(index === profile.journey.length - 1 ? "timeline_completed" : "timeline_started", profile)} className="min-w-36 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-4 text-left transition hover:border-blue-300 hover:bg-blue-50">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">{copy.stage} {index + 1}</div><div className="text-sm font-bold text-slate-900">{step}</div>
                  </button>
                  {index < profile.journey.length - 1 && <ChevronRight className="h-4 w-4 text-slate-300" />}
                </div>
              ))}
            </div></div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[.85fr_1.15fr]">
            <div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-600"><Route className="h-4 w-4" />{copy.pipeline}</div><h2 className="text-3xl font-black tracking-tight">{copy.pipelineTitle}</h2></div>
            <div className="grid gap-3 sm:grid-cols-2">{profile.pipeline.map((stage, index) => <div key={`${stage}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-700">{index + 1}</span><span className="text-sm font-bold text-slate-800">{stage}</span></div>)}</div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-600"><Bot className="h-4 w-4" />{copy.agents}</div><h2 className="text-3xl font-black tracking-tight sm:text-4xl">{copy.agentsTitle}</h2></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{profile.priorityAgents.map((agent) => <div key={agent} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700"><BrainCircuit className="h-5 w-5" /></div><h3 className="font-black">{agent}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{copy.agentDescription}</p></div>)}</div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-7 sm:p-8">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700"><Radar className="h-4 w-4" />Revenue Scout</div>
              <h2 className="text-3xl font-black tracking-tight">{copy.scoutTitle}</h2>
              <p className="mt-4 leading-7 text-slate-600">{copy.scoutDescription(profile.name)}</p>
              <div className="mt-6 space-y-3">{profile.revenueScout.signals.map((signal) => <div key={signal} className="flex items-center gap-3 text-sm font-semibold text-slate-700"><Target className="h-4 w-4 shrink-0 text-emerald-600" />{signal}</div>)}</div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
              <div className="mb-5 flex items-center justify-between"><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Next Best Action</div><div className="mt-1 text-xl font-black">{copy.nextAction}</div></div><CircleDollarSign className="h-7 w-7 text-emerald-600" /></div>
              <div className="space-y-3">{profile.revenueScout.nextBestActions.map((action, index) => <div key={action} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{copy.stage} {index + 1}</div><div className="mt-1 text-sm font-bold text-slate-800">{action}</div></div>)}</div>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-3xl"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-600"><BarChart3 className="h-4 w-4" />{copy.commercialScenarios}</div><h2 className="text-3xl font-black tracking-tight sm:text-4xl">{copy.commercialScenariosTitle}</h2></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{profile.creativeAngles.map((angle) => <div key={angle} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><p className="font-bold leading-snug text-slate-800">{angle}</p></div>)}</div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-600"><Search className="h-4 w-4" />{copy.relatedSolutions}</div><h2 className="text-3xl font-black tracking-tight sm:text-4xl">{copy.relatedSolutionsTitle}</h2></div><Link href="/solucoes" className="inline-flex items-center gap-2 text-sm font-bold text-orange-600 hover:text-orange-700">{copy.solutionsHub}<ArrowRight className="h-4 w-4" /></Link></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{relatedSolutions.map((solution) => { const local = isSpanish ? solution.es : solution.pt; return <Link key={solution.path} href={solution.path} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-orange-300 hover:shadow-md"><div className="text-xs font-bold uppercase tracking-[0.12em] text-orange-600">{solution.cluster}</div><h3 className="mt-3 font-black leading-snug text-slate-900 group-hover:text-orange-700">{local.headline}</h3><span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-orange-600">{copy.relatedAction}<ArrowRight className="h-4 w-4" /></span></Link>; })}</div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50 px-4 py-20 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2">
            <div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-600"><LineChart className="h-4 w-4" />{copy.metrics}</div><h2 className="text-3xl font-black tracking-tight">{copy.metricsTitle}</h2><div className="mt-6 flex flex-wrap gap-2">{profile.kpis.map((kpi) => <span key={kpi} className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700">{kpi}</span>)}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{copy.searchIntent}</div><div className="mt-4 space-y-3">{profile.googleIntentSeeds.map((seed) => <div key={seed} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">“{seed}”</div>)}</div></div>
          </div>
        </section>

        <section className="bg-white px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl"><div className="mb-10 text-center"><div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-orange-600">{copy.trialKicker}</div><h2 className="text-3xl font-black tracking-tight sm:text-4xl">{copy.trialTitle}</h2><p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-600">{copy.trialDescription}</p></div><div className="grid gap-4 md:grid-cols-5">{trialItems.map((item) => <div key={item.day} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-5 flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-sm font-black text-orange-700">D{item.day}</div><h3 className="font-black leading-tight">{item.label}</h3><p className="mt-2 text-xs leading-5 text-slate-600">{item.description}</p></div>)}</div><div className="mt-9 text-center"><CtaLink profile={profile} /></div></div>
        </section>

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-4xl"><div className="mb-9 text-center"><div className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-orange-600">{copy.faq}</div><h2 className="text-3xl font-black tracking-tight">{copy.faqTitle(profile.name)}</h2></div><div className="space-y-3">{profile.lp.faq.map((question, index) => <details key={question} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm open:border-orange-200"><summary className="cursor-pointer list-none pr-8 font-bold text-slate-900">{question}</summary><p className="mt-3 text-sm leading-7 text-slate-600">{faqAnswers[index] ?? profile.promise}</p></details>)}</div></div>
        </section>

        <section className="px-4 pb-24 pt-4 sm:px-6">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-orange-200 bg-[#fff7ed] p-8 text-center sm:p-14"><div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100"><Sparkles className="h-6 w-6 text-orange-600" /></div><h2 className="text-3xl font-black tracking-tight sm:text-5xl">{copy.finalTitle(profile.name)}</h2><p className="mx-auto mt-5 max-w-2xl leading-7 text-slate-600">{copy.finalDescription}</p><div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"><CtaLink profile={profile} /><CtaLink profile={profile} secondary /></div></div>
        </section>
      </main>
    </div>
  );
}
