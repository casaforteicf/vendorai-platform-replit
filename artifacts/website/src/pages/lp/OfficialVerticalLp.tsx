import { useEffect } from "react";
import {
  OFFICIAL_TRIAL_5_DAYS,
  type MarketingVerticalProfile,
} from "@workspace/vendor-brain/marketing-verticals";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  LineChart,
  Radar,
  Route,
  Sparkles,
  Target,
} from "lucide-react";
import { usePublicCountry } from "@/lib/publicCountry";

const UI_PT = {
  titleSuffix: "IA comercial por vertical",
  viewSegment: "Ver segmento",
  audience: "Público",
  painMap: "Mapa da dor",
  painTitle: "O problema não é falta de lead. É perder contexto e timing comercial.",
  promise: "Promessa operacional",
  journey: "Jornada vertical",
  journeyTitle: "A IA acompanha a venda do início ao próximo ciclo",
  step: "Etapa",
  funnelTitle: "O funil fala a língua da operação",
  funnelDescription: (name: string) => `Nada de pipeline genérico. As etapas abaixo refletem como uma oportunidade realmente avança em ${name.toLowerCase()}.`,
  priorityAgents: "Agentes prioritários",
  agentTeamTitle: "Uma equipe de IA montada para esta vertical",
  agent: "Agente",
  agentDescription: "Atua usando o contexto da jornada, do pipeline e da oportunidade desta vertical.",
  scoutTitle: "A IA procura receita que já existe na base",
  scoutDescription: (name: string) => `O Revenue Scout observa sinais específicos de ${name.toLowerCase()} e sugere a próxima melhor ação quando encontra uma oportunidade.`,
  nbaTitle: "O que fazer quando o sinal aparece",
  action: "Ação",
  trialKicker: "Trial verticalizado",
  trialTitle: "5 dias para enxergar valor dentro da própria operação",
  trialDescription: "O trial não é uma visita guiada genérica. Cada dia tem um resultado operacional esperado.",
  kpis: "KPIs da vertical",
  kpiTitle: "O sistema aprende com resultado de negócio",
  searchIntent: "Intenção de busca",
  faqTitle: (name: string) => `Perguntas sobre VendorAI para ${name}`,
  finalTitle: (name: string) => `Coloque a jornada de ${name.toLowerCase()} para rodar com IA.`,
  finalDescription: "Comece pelo trial verticalizado ou veja a demonstração com o pipeline, os agentes e o Revenue Scout desta operação.",
} as const;

const UI_ES = {
  titleSuffix: "IA comercial por vertical",
  viewSegment: "Ver segmento",
  audience: "Público",
  painMap: "Mapa del problema",
  painTitle: "El problema no es la falta de leads. Es perder contexto y timing comercial.",
  promise: "Promesa operativa",
  journey: "Jornada vertical",
  journeyTitle: "La IA acompaña la venta desde el inicio hasta el próximo ciclo",
  step: "Etapa",
  funnelTitle: "El embudo habla el idioma de la operación",
  funnelDescription: (name: string) => `Nada de pipelines genéricos. Las etapas reflejan cómo avanza realmente una oportunidad en ${name.toLowerCase()}.`,
  priorityAgents: "Agentes prioritarios",
  agentTeamTitle: "Un equipo de IA preparado para esta vertical",
  agent: "Agente",
  agentDescription: "Actúa usando el contexto de la jornada, el pipeline y la oportunidad de esta vertical.",
  scoutTitle: "La IA busca ingresos que ya existen en la base",
  scoutDescription: (name: string) => `Revenue Scout observa señales específicas de ${name.toLowerCase()} y sugiere la próxima mejor acción cuando detecta una oportunidad.`,
  nbaTitle: "Qué hacer cuando aparece la señal",
  action: "Acción",
  trialKicker: "Prueba verticalizada",
  trialTitle: "5 días para ver valor dentro de tu propia operación",
  trialDescription: "La prueba no es una visita guiada genérica. Cada día tiene un resultado operativo esperado.",
  kpis: "KPIs de la vertical",
  kpiTitle: "El sistema aprende con resultados del negocio",
  searchIntent: "Intención de búsqueda",
  faqTitle: (name: string) => `Preguntas sobre VendorAI para ${name}`,
  finalTitle: (name: string) => `Pon la jornada de ${name.toLowerCase()} a funcionar con IA.`,
  finalDescription: "Empieza con la prueba verticalizada o mira la demostración con el pipeline, los agentes y Revenue Scout de esta operación.",
} as const;

const TRIAL_ES = [
  { day: 1, label: "Ver a la IA trabajar", description: "Recibir o simular un lead usando la jornada de la vertical." },
  { day: 2, label: "Automatizar", description: "Atención, calificación, seguimiento y agenda según el mercado." },
  { day: 3, label: "Organizar la venta", description: "Pipeline vertical, lead cooling y Next Best Action." },
  { day: 4, label: "Encontrar ingresos", description: "Revenue Recovered by AI y oportunidades de Revenue Scout." },
  { day: 5, label: "Mostrar resultados", description: "Resumen de leads, acciones, oportunidades e ingresos potenciales." },
] as const;

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
    // Analytics must never block the landing page.
  }
}

function CtaLink({
  profile,
  secondary = false,
  className = "",
}: {
  profile: MarketingVerticalProfile;
  secondary?: boolean;
  className?: string;
}) {
  const label = secondary ? profile.lp.secondaryCta : profile.lp.primaryCta;
  const event = secondary ? "demo_started" : "trial_clicked";
  const href = secondary
    ? `/demo?vertical=${encodeURIComponent(profile.slug)}`
    : `/demo?vertical=${encodeURIComponent(profile.slug)}&intent=trial-5-dias`;

  return (
    <a
      href={href}
      onClick={() => trackMarketingEvent(event, profile)}
      className={`${
        secondary
          ? "border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
          : "bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-lg shadow-violet-500/20 hover:from-violet-500 hover:to-cyan-400"
      } inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold transition-all ${className}`}
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </a>
  );
}

export function findOfficialVertical(slug: string) {
  return import("@workspace/vendor-brain/marketing-verticals").then(({ MARKETING_VERTICALS }) =>
    MARKETING_VERTICALS.find((item) => item.slug === slug || item.id === slug),
  );
}

export default function OfficialVerticalLp({ profile }: { profile: MarketingVerticalProfile }) {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? UI_ES : UI_PT;
  const trialItems = isSpanish ? TRIAL_ES : OFFICIAL_TRIAL_5_DAYS;

  useEffect(() => {
    document.title = `VendorAI para ${profile.name} — ${copy.titleSuffix}`;
    trackMarketingEvent("vertical_page_view", profile);
  }, [copy.titleSuffix, profile]);

  const faqAnswers = isSpanish
    ? [
        `Sí. Esta página usa el perfil operativo de ${profile.name}, con jornada, pipeline, agentes y señales comerciales propios de esta vertical.`,
        "No. VendorAI fue diseñado para trabajar con los canales y procesos del negocio, centralizando contexto y automatizaciones en una sola operación.",
        `Sí. Los agentes prioritarios de esta vertical son ${profile.priorityAgents.join(", ")}. La autonomía puede configurarse según la operación y los permisos del tenant.`,
        "Sí. La arquitectura oficial registra eventos desde el origen del lead hasta oportunidad, propuesta y venta, permitiendo optimizar por ingresos y no solamente por clics.",
        "La prueba se organiza en cinco días: primer valor, automatización, control comercial, inteligencia de ingresos y consolidación del resultado.",
      ]
    : [
        `Sim. Esta página usa o perfil operacional de ${profile.name}, com jornada, pipeline, agentes e sinais comerciais próprios desta vertical.`,
        "Não. O VendorAI foi desenhado para trabalhar com os canais e processos do negócio, centralizando contexto e automações em uma única operação.",
        `Sim. Os agentes prioritários desta vertical são ${profile.priorityAgents.join(", ")}. A autonomia pode ser configurada conforme a operação e as permissões do tenant.`,
        "Sim. A arquitetura oficial registra eventos desde a origem do lead até oportunidade, proposta e venda, permitindo otimização por receita e não apenas por clique.",
        "O trial é organizado em cinco dias: primeiro valor, automação, controle comercial, inteligência de receita e consolidação do resultado.",
      ];

  return (
    <div className="min-h-screen bg-[#07070c] text-white antialiased">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#07070c]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-black shadow-lg shadow-violet-500/20">V</div>
            <div>
              <div className="text-base font-extrabold tracking-tight">VendorAI</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Business OS</div>
            </div>
          </a>
          <div className="flex items-center gap-3">
            <a href={`/segmentos/${profile.macrosegment}`} className="hidden text-xs font-medium text-slate-400 transition-colors hover:text-white sm:block">{copy.viewSegment}</a>
            <CtaLink profile={profile} className="px-4 py-2.5 text-xs" />
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-4 pb-24 pt-20 sm:px-6 sm:pt-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.23),transparent_46%),radial-gradient(circle_at_85%_35%,rgba(6,182,212,0.12),transparent_35%)]" />
          <div className="relative mx-auto max-w-5xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-200"><Sparkles className="h-3.5 w-3.5" />{profile.lp.heroEyebrow}</div>
            <h1 className="mx-auto max-w-4xl text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">{profile.lp.headline}</h1>
            <p className="mx-auto mt-7 max-w-3xl text-base leading-relaxed text-slate-300 sm:text-xl">{profile.lp.subheadline}</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"><CtaLink profile={profile} /><CtaLink profile={profile} secondary /></div>
            <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">{copy.audience}: {profile.audience}</span>
              {profile.decisionMakers.map((role) => <span key={role} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">{role}</span>)}
            </div>
          </div>
        </section>

        <section className="border-y border-white/5 bg-white/[0.02] px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 max-w-3xl"><div className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-rose-300">{copy.painMap}</div><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{copy.painTitle}</h2><p className="mt-4 text-slate-400">{profile.corePain}</p></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {profile.lp.painMap.map((pain, index) => <div key={pain} className="rounded-2xl border border-white/8 bg-[#0d0d15] p-5"><div className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-rose-400/10 text-xs font-black text-rose-300">{String(index + 1).padStart(2, "0")}</div><p className="font-semibold leading-snug text-slate-100">{pain}</p></div>)}
            </div>
            <div className="mt-8 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-6"><div className="flex gap-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" /><div><div className="text-sm font-bold text-emerald-200">{copy.promise}</div><p className="mt-1 text-sm leading-relaxed text-slate-300">{profile.promise}</p></div></div></div>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 text-center"><div className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">{copy.journey}</div><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{copy.journeyTitle}</h2></div>
            <div className="overflow-x-auto pb-4"><div className="flex min-w-max items-center gap-2">
              {profile.journey.map((step, index) => <div key={`${step}-${index}`} className="flex items-center gap-2"><button type="button" onClick={() => trackMarketingEvent(index === profile.journey.length - 1 ? "timeline_completed" : "timeline_started", profile)} className="min-w-36 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] px-4 py-4 text-left transition-colors hover:border-cyan-300/30"><div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400">{copy.step} {index + 1}</div><div className="text-sm font-semibold text-white">{step}</div></button>{index < profile.journey.length - 1 && <ChevronRight className="h-4 w-4 text-slate-700" />}</div>)}
            </div></div>
          </div>
        </section>

        <section className="border-y border-white/5 bg-[#0a0a11] px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-violet-300"><Route className="h-4 w-4" /> Pipeline</div><h2 className="text-3xl font-bold tracking-tight">{copy.funnelTitle}</h2><p className="mt-4 text-sm leading-relaxed text-slate-400">{copy.funnelDescription(profile.name)}</p></div>
            <div className="grid gap-3 sm:grid-cols-2">{profile.pipeline.map((stage, index) => <div key={`${stage}-${index}`} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-400/10 text-xs font-black text-violet-300">{index + 1}</span><span className="text-sm font-semibold text-slate-200">{stage}</span></div>)}</div>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 max-w-3xl"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-violet-300"><Bot className="h-4 w-4" /> {copy.priorityAgents}</div><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{copy.agentTeamTitle}</h2></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{profile.priorityAgents.map((agent) => <div key={agent} className="rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.05] to-transparent p-6"><div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300"><BrainCircuit className="h-5 w-5" /></div><h3 className="font-bold">{copy.agent} {agent}</h3><p className="mt-2 text-sm leading-relaxed text-slate-400">{copy.agentDescription}</p></div>)}</div>
          </div>
        </section>

        <section className="relative overflow-hidden border-y border-emerald-400/10 bg-emerald-950/10 px-4 py-24 sm:px-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(16,185,129,0.10),transparent_40%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-2">
            <div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-emerald-300"><Radar className="h-4 w-4" /> Revenue Scout</div><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{copy.scoutTitle}</h2><p className="mt-4 leading-relaxed text-slate-400">{copy.scoutDescription(profile.name)}</p><div className="mt-7 space-y-3">{profile.revenueScout.signals.map((signal) => <div key={signal} className="flex items-center gap-3 text-sm text-slate-300"><Target className="h-4 w-4 shrink-0 text-emerald-300" />{signal}</div>)}</div></div>
            <div className="rounded-3xl border border-emerald-400/15 bg-[#0b1210] p-7 sm:p-8"><div className="mb-5 flex items-center justify-between"><div><div className="text-xs font-bold uppercase tracking-widest text-emerald-400">Next Best Action</div><div className="mt-1 font-bold">{copy.nbaTitle}</div></div><CircleDollarSign className="h-7 w-7 text-emerald-300" /></div><div className="space-y-3">{profile.revenueScout.nextBestActions.map((action, index) => <div key={action} className="rounded-xl border border-white/8 bg-white/[0.03] p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{copy.action} {index + 1}</div><div className="mt-1 text-sm font-semibold text-slate-100">{action}</div></div>)}</div></div>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 text-center"><div className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-amber-300">{copy.trialKicker}</div><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{copy.trialTitle}</h2><p className="mx-auto mt-4 max-w-2xl text-slate-400">{copy.trialDescription}</p></div>
            <div className="grid gap-4 md:grid-cols-5">{trialItems.map((item) => <div key={item.day} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5"><div className="mb-5 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10 text-sm font-black text-amber-300">D{item.day}</div><h3 className="font-bold leading-tight">{item.label}</h3><p className="mt-2 text-xs leading-relaxed text-slate-400">{item.description}</p></div>)}</div>
            <div className="mt-10 text-center"><CtaLink profile={profile} /></div>
          </div>
        </section>

        <section className="border-y border-white/5 bg-white/[0.02] px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl"><div className="grid gap-10 lg:grid-cols-2"><div><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300"><LineChart className="h-4 w-4" /> {copy.kpis}</div><h2 className="text-3xl font-bold tracking-tight">{copy.kpiTitle}</h2><div className="mt-6 flex flex-wrap gap-2">{profile.kpis.map((kpi) => <span key={kpi} className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.05] px-3 py-1.5 text-xs font-semibold text-cyan-100">{kpi}</span>)}</div></div><div className="rounded-2xl border border-white/8 bg-[#0d0d15] p-6"><div className="text-xs font-bold uppercase tracking-widest text-slate-500">{copy.searchIntent}</div><div className="mt-4 space-y-3">{profile.googleIntentSeeds.map((seed) => <div key={seed} className="rounded-lg border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">“{seed}”</div>)}</div></div></div></div>
        </section>

        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-4xl"><div className="mb-10 text-center"><div className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-violet-300">FAQ</div><h2 className="text-3xl font-bold tracking-tight">{copy.faqTitle(profile.name)}</h2></div><div className="space-y-3">{profile.lp.faq.map((question, index) => <details key={question} className="group rounded-2xl border border-white/8 bg-white/[0.025] p-5 open:bg-white/[0.045]"><summary className="cursor-pointer list-none pr-8 font-semibold text-slate-100">{question}</summary><p className="mt-3 text-sm leading-relaxed text-slate-400">{faqAnswers[index] ?? profile.promise}</p></details>)}</div></div>
        </section>

        <section className="px-4 pb-28 pt-8 sm:px-6">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-violet-400/15 bg-gradient-to-br from-violet-950/70 via-[#121126] to-cyan-950/40 p-8 text-center sm:p-14"><div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><Sparkles className="h-6 w-6 text-cyan-300" /></div><h2 className="text-3xl font-black tracking-tight sm:text-5xl">{copy.finalTitle(profile.name)}</h2><p className="mx-auto mt-5 max-w-2xl text-slate-300">{copy.finalDescription}</p><div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"><CtaLink profile={profile} /><CtaLink profile={profile} secondary /></div></div>
        </section>
      </main>
    </div>
  );
}
