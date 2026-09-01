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
  useEffect(() => {
    document.title = `VendorAI para ${profile.name} — IA comercial por vertical`;
    trackMarketingEvent("vertical_page_view", profile);
  }, [profile]);

  const faqAnswers = [
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
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-black shadow-lg shadow-violet-500/20">
              V
            </div>
            <div>
              <div className="text-base font-extrabold tracking-tight">VendorAI</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Business OS</div>
            </div>
          </a>
          <div className="flex items-center gap-3">
            <a
              href={`/segmentos/${profile.macrosegment}`}
              className="hidden text-xs font-medium text-slate-400 transition-colors hover:text-white sm:block"
            >
              Ver segmento
            </a>
            <CtaLink profile={profile} className="px-4 py-2.5 text-xs" />
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-4 pb-24 pt-20 sm:px-6 sm:pt-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.23),transparent_46%),radial-gradient(circle_at_85%_35%,rgba(6,182,212,0.12),transparent_35%)]" />
          <div className="relative mx-auto max-w-5xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-200">
              <Sparkles className="h-3.5 w-3.5" />
              {profile.lp.heroEyebrow}
            </div>
            <h1 className="mx-auto max-w-4xl text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              {profile.lp.headline}
            </h1>
            <p className="mx-auto mt-7 max-w-3xl text-base leading-relaxed text-slate-300 sm:text-xl">
              {profile.lp.subheadline}
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <CtaLink profile={profile} />
              <CtaLink profile={profile} secondary />
            </div>

            <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                Público: {profile.audience}
              </span>
              {profile.decisionMakers.map((role) => (
                <span key={role} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                  {role}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/5 bg-white/[0.02] px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 max-w-3xl">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-rose-300">Mapa da dor</div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">O problema não é falta de lead. É perder contexto e timing comercial.</h2>
              <p className="mt-4 text-slate-400">{profile.corePain}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {profile.lp.painMap.map((pain, index) => (
                <div key={pain} className="rounded-2xl border border-white/8 bg-[#0d0d15] p-5">
                  <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-rose-400/10 text-xs font-black text-rose-300">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <p className="font-semibold leading-snug text-slate-100">{pain}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-6">
              <div className="flex gap-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                <div>
                  <div className="text-sm font-bold text-emerald-200">Promessa operacional</div>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">{profile.promise}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 text-center">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Jornada vertical</div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">A IA acompanha a venda do início ao próximo ciclo</h2>
            </div>
            <div className="overflow-x-auto pb-4">
              <div className="flex min-w-max items-center gap-2">
                {profile.journey.map((step, index) => (
                  <div key={`${step}-${index}`} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => trackMarketingEvent(index === profile.journey.length - 1 ? "timeline_completed" : "timeline_started", profile)}
                      className="min-w-36 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] px-4 py-4 text-left transition-colors hover:border-cyan-300/30"
                    >
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-cyan-400">Etapa {index + 1}</div>
                      <div className="text-sm font-semibold text-white">{step}</div>
                    </button>
                    {index < profile.journey.length - 1 && <ChevronRight className="h-4 w-4 text-slate-700" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/5 bg-[#0a0a11] px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-violet-300">
                <Route className="h-4 w-4" /> Pipeline
              </div>
              <h2 className="text-3xl font-bold tracking-tight">O funil fala a língua da operação</h2>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">
                Nada de pipeline genérico. As etapas abaixo refletem como uma oportunidade realmente avança em {profile.name.toLowerCase()}.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {profile.pipeline.map((stage, index) => (
                <div key={`${stage}-${index}`} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-400/10 text-xs font-black text-violet-300">{index + 1}</span>
                  <span className="text-sm font-semibold text-slate-200">{stage}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-violet-300">
                <Bot className="h-4 w-4" /> Agentes prioritários
              </div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Uma equipe de IA montada para esta vertical</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {profile.priorityAgents.map((agent) => (
                <div key={agent} className="rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.05] to-transparent p-6">
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
                    <BrainCircuit className="h-5 w-5" />
                  </div>
                  <h3 className="font-bold">Agente {agent}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">Atua usando o contexto da jornada, do pipeline e da oportunidade desta vertical.</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-y border-emerald-400/10 bg-emerald-950/10 px-4 py-24 sm:px-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(16,185,129,0.10),transparent_40%)]" />
          <div className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">
                <Radar className="h-4 w-4" /> Revenue Scout
              </div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">A IA procura receita que já existe na base</h2>
              <p className="mt-4 leading-relaxed text-slate-400">
                O Revenue Scout observa sinais específicos de {profile.name.toLowerCase()} e sugere a próxima melhor ação quando encontra uma oportunidade.
              </p>
              <div className="mt-7 space-y-3">
                {profile.revenueScout.signals.map((signal) => (
                  <div key={signal} className="flex items-center gap-3 text-sm text-slate-300">
                    <Target className="h-4 w-4 shrink-0 text-emerald-300" />
                    {signal}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-emerald-400/15 bg-[#0b1210] p-7 sm:p-8">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-emerald-400">Next Best Action</div>
                  <div className="mt-1 font-bold">O que fazer quando o sinal aparece</div>
                </div>
                <CircleDollarSign className="h-7 w-7 text-emerald-300" />
              </div>
              <div className="space-y-3">
                {profile.revenueScout.nextBestActions.map((action, index) => (
                  <div key={action} className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ação {index + 1}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-100">{action}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12 text-center">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Trial verticalizado</div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">5 dias para enxergar valor dentro da própria operação</h2>
              <p className="mx-auto mt-4 max-w-2xl text-slate-400">O trial não é uma visita guiada genérica. Cada dia tem um resultado operacional esperado.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-5">
              {OFFICIAL_TRIAL_5_DAYS.map((item) => (
                <div key={item.day} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                  <div className="mb-5 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10 text-sm font-black text-amber-300">D{item.day}</div>
                  <h3 className="font-bold leading-tight">{item.label}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">{item.description}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <CtaLink profile={profile} />
            </div>
          </div>
        </section>

        <section className="border-y border-white/5 bg-white/[0.02] px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
                  <LineChart className="h-4 w-4" /> KPIs da vertical
                </div>
                <h2 className="text-3xl font-bold tracking-tight">O sistema aprende com resultado de negócio</h2>
                <div className="mt-6 flex flex-wrap gap-2">
                  {profile.kpis.map((kpi) => (
                    <span key={kpi} className="rounded-full border border-cyan-400/15 bg-cyan-400/[0.05] px-3 py-1.5 text-xs font-semibold text-cyan-100">{kpi}</span>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-[#0d0d15] p-6">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Intenção de busca</div>
                <div className="mt-4 space-y-3">
                  {profile.googleIntentSeeds.map((seed) => (
                    <div key={seed} className="rounded-lg border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">“{seed}”</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <div className="mb-10 text-center">
              <div className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-violet-300">FAQ</div>
              <h2 className="text-3xl font-bold tracking-tight">Perguntas sobre VendorAI para {profile.name}</h2>
            </div>
            <div className="space-y-3">
              {profile.lp.faq.map((question, index) => (
                <details key={question} className="group rounded-2xl border border-white/8 bg-white/[0.025] p-5 open:bg-white/[0.045]">
                  <summary className="cursor-pointer list-none pr-8 font-semibold text-slate-100">{question}</summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{faqAnswers[index] ?? profile.promise}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-28 pt-8 sm:px-6">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-violet-400/15 bg-gradient-to-br from-violet-950/70 via-[#121126] to-cyan-950/40 p-8 text-center sm:p-14">
            <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Sparkles className="h-6 w-6 text-cyan-300" />
            </div>
            <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Coloque a jornada de {profile.name.toLowerCase()} para rodar com IA.</h2>
            <p className="mx-auto mt-5 max-w-2xl text-slate-300">Comece pelo trial verticalizado ou veja a demonstração com o pipeline, os agentes e o Revenue Scout desta operação.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <CtaLink profile={profile} />
              <CtaLink profile={profile} secondary />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
