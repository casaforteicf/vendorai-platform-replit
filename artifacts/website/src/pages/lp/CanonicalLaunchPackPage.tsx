import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Loader2,
  Radar,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { getCanonicalLaunchPack } from "./launchPackData";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function trackEvent(name: string, slug: string, extra: Record<string, unknown> = {}) {
  try {
    const w = window as unknown as { gtag?: (...args: unknown[]) => void };
    w.gtag?.("event", name, { vertical_slug: slug, ...extra });
  } catch {
    // External telemetry must never block the experience.
  }
}

function trackConfirmedLead(slug: string) {
  trackEvent("conversion", slug, {
    event_category: "lead",
    event_label: `lp_${slug}`,
    value: 1,
    currency: "BRL",
  });
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
}

const PILLARS = [
  ["Atrair", "Campanhas, anúncios, criativos, ofertas e landing pages."],
  ["Captar", "Origem, campanha, criativo, UTM, produto e interesse preservados."],
  ["Converter", "Atendimento, qualificação, agenda, follow-up e recuperação."],
  ["Fechar", "Proposta, negociação, documentação, contrato e pagamento."],
  ["Entregar", "Pedido, produção, execução, instalação ou conclusão conforme a vertical."],
  ["Fidelizar", "Pós-venda, satisfação, suporte, avaliação e prevenção de churn."],
  ["Expandir", "Revenue Scout procura recompra, renovação, upsell, cross-sell e indicação."],
] as const;

export default function CanonicalLaunchPackPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const pack = getCanonicalLaunchPack(slug);
  const [form, setForm] = useState({ nome: "", email: "", telefone: "", empresa: "", mensagem: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoStep, setDemoStep] = useState(0);
  const [calculator, setCalculator] = useState({ volume: "", ticket: "", conversion: "", coverage: "" });
  const [calculatorTouched, setCalculatorTouched] = useState(false);

  useEffect(() => {
    if (!pack) return;
    document.title = `VendorAI para ${pack.vertical} — IA da aquisição à próxima venda`;
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute("content", pack.subheadline);
    trackEvent("vertical_page_view", pack.slug, { macrosegment: pack.macrosegment });
  }, [pack]);

  const calculatorResult = useMemo(() => {
    const volume = Math.max(0, Number(calculator.volume) || 0);
    const ticket = Math.max(0, Number(calculator.ticket) || 0);
    const conversion = Math.min(100, Math.max(0, Number(calculator.conversion) || 0));
    const coverage = Math.min(100, Math.max(0, Number(calculator.coverage) || 0));
    const unresolved = 1 - conversion / 100;
    const uncovered = 1 - coverage / 100;
    return volume * ticket * unresolved * uncovered;
  }, [calculator]);

  if (!pack) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    trackEvent("trial_clicked", pack.slug, { macrosegment: pack.macrosegment });
    try {
      const response = await fetch(`${API_BASE}/site/contato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          vertical: pack.vertical,
          origem: `lp_${pack.slug}`,
          mensagem: `${form.mensagem}${form.mensagem ? "\n\n" : ""}[Vertical de marketing: ${pack.slug} | Macrosegmento: ${pack.macrosegment}]`,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Não foi possível enviar agora.");
      setSuccess(true);
      trackConfirmedLead(pack.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar agora.");
    } finally {
      setLoading(false);
    }
  };

  const scrollToForm = () => {
    trackEvent("trial_clicked", pack.slug, { source: "cta" });
    document.getElementById("demo-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const nextDemo = () => {
    if (demoStep === 0) trackEvent("demo_started", pack.slug);
    const next = Math.min(pack.journey.length - 1, demoStep + 1);
    setDemoStep(next);
    if (next === pack.journey.length - 1) trackEvent("demo_completed", pack.slug);
  };

  const resetDemo = () => setDemoStep(0);

  const handleCalculator = (field: keyof typeof calculator, value: string) => {
    setCalculator((current) => ({ ...current, [field]: value }));
    if (!calculatorTouched) {
      setCalculatorTouched(true);
      trackEvent("calculator_started", pack.slug);
    }
  };

  const markCalculatorComplete = () => {
    trackEvent("calculator_completed", pack.slug, { estimated_uncovered_value: Math.round(calculatorResult) });
  };

  return (
    <div className="min-h-screen bg-[#08070F] text-white">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#08070F]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <a href="/" className="font-bold tracking-tight">VendorAI</a>
          <div className="flex items-center gap-4">
            <a href={`/segmentos/${pack.macrosegment}`} className="hidden text-xs text-slate-400 hover:text-white sm:block">{pack.macrosegmentLabel}</a>
            <button onClick={scrollToForm} className="text-sm font-medium text-cyan-300 hover:text-white">Testar 5 dias</button>
          </div>
        </div>
      </header>

      <main>
        {/* 01 — HERO */}
        <section className="relative overflow-hidden px-4 py-24 text-center">
          <div className="absolute inset-0 bg-gradient-to-b from-violet-950/70 via-[#100d2a] to-[#08070F]" />
          <div className="relative mx-auto max-w-5xl">
            <div className="mb-6 inline-flex rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-violet-200">
              {pack.emoji} &nbsp; VendorAI para {pack.vertical}
            </div>
            <h1 className="text-4xl font-extrabold leading-tight sm:text-6xl">{pack.headline}</h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-slate-300">{pack.subheadline}</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <button onClick={scrollToForm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-8 py-4 font-bold shadow-lg shadow-violet-500/20 transition hover:scale-[1.02]">
                Testar o VendorAI por 5 dias <ArrowRight className="h-5 w-5" />
              </button>
              <button onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })} className="rounded-xl border border-white/10 bg-white/[0.03] px-8 py-4 font-semibold text-slate-200 hover:bg-white/[0.06]">
                Simular a jornada
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-500">Do anúncio à próxima venda. IA trabalhando durante toda a jornada do cliente.</p>
            {pack.compliance !== "standard" && (
              <div className="mx-auto mt-6 flex max-w-2xl items-center justify-center gap-2 text-xs text-amber-200">
                <ShieldCheck className="h-4 w-4" /> Comunicação e automações sujeitas aos controles de compliance aplicáveis a esta vertical.
              </div>
            )}
          </div>
        </section>

        {/* 02 — DOR */}
        <section className="px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-violet-400">Onde a receita vaza</p>
            <h2 className="mx-auto mt-3 max-w-3xl text-center text-3xl font-bold">O problema não é apenas gerar demanda. É acompanhar o que acontece depois.</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {pack.pains.map((pain) => (
                <article key={pain.title} className="rounded-2xl border border-rose-400/10 bg-rose-400/[0.025] p-6">
                  <h3 className="font-semibold">{pain.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{pain.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 03 — MAPA DE VAZAMENTO / JORNADA */}
        <section className="border-y border-white/5 bg-white/[0.02] px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">Jornada real de {pack.vertical}</p>
              <h2 className="mt-3 text-3xl font-bold">Cada etapa precisa de contexto + próxima ação.</h2>
            </div>
            <div className="mt-10 flex flex-wrap justify-center gap-2">
              {pack.journey.map((stage, index) => (
                <div key={`${stage}-${index}`} className="flex items-center gap-2">
                  <span className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium">{stage}</span>
                  {index < pack.journey.length - 1 && <ChevronRight className="h-4 w-4 text-violet-400" />}
                </div>
              ))}
            </div>
            <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-slate-400">Se uma etapa fica sem dono, contexto ou próxima ação, o VendorAI deve identificá-la antes que a oportunidade desapareça.</p>
          </div>
        </section>

        {/* 04 — TIMELINE */}
        <section className="px-4 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-end justify-between gap-6 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">Linha do Tempo Comercial</p>
                <h2 className="mt-3 text-3xl font-bold">A IA sabe onde a oportunidade está e o que precisa acontecer depois.</h2>
              </div>
              <Clock3 className="h-10 w-10 text-violet-400" />
            </div>
            <div className="mt-10 space-y-3">
              {pack.timeline.slice(0, 8).map((item, index) => (
                <div key={`${item.stage}-${index}`} className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:grid-cols-[120px_1fr]">
                  <div className="text-sm font-semibold text-cyan-300">Etapa {String(index + 1).padStart(2, "0")}</div>
                  <div><p className="font-semibold">{item.stage}</p><p className="mt-1 text-sm text-slate-400">{item.detail}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 05 — 7 PILARES */}
        <section className="bg-gradient-to-b from-white/[0.02] to-transparent px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-cyan-400">Do anúncio à próxima venda</p>
            <h2 className="mt-3 text-center text-3xl font-bold">Os 7 pilares aplicados à mesma jornada.</h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {PILLARS.map(([title, detail], index) => (
                <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-xs font-bold text-violet-400">0{index + 1}</div>
                  <h3 className="mt-2 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 06 — AGENTES */}
        <section className="px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center"><Bot className="mx-auto h-8 w-8 text-violet-400" /><h2 className="mt-4 text-3xl font-bold">Agentes prioritários para {pack.vertical}</h2><p className="mt-3 text-slate-400">A página não mostra um catálogo genérico de agentes. Mostra os que participam desta jornada.</p></div>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {pack.agents.map((agent) => (
                <article key={agent.name} className="rounded-2xl border border-violet-400/10 bg-violet-400/[0.025] p-6"><h3 className="font-semibold text-violet-200">{agent.name}</h3><p className="mt-2 text-sm leading-relaxed text-slate-400">{agent.detail}</p></article>
              ))}
            </div>
          </div>
        </section>

        {/* 07 — ANTES / DEPOIS */}
        <section className="border-y border-white/5 bg-white/[0.02] px-4 py-20">
          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
            <article className="rounded-3xl border border-rose-500/15 bg-rose-500/[0.025] p-7">
              <p className="text-xs font-semibold uppercase tracking-widest text-rose-300">Sem inteligência operacional</p>
              <h2 className="mt-3 text-2xl font-bold">A oportunidade depende de memória individual.</h2>
              <ul className="mt-6 space-y-3 text-sm text-slate-400">
                <li>• Origem do lead perde conexão com a venda.</li><li>• Próxima ação depende de vendedor lembrar.</li><li>• Follow-up para quando o cliente para de responder.</li><li>• Pós-venda não volta para aquisição e receita.</li><li>• A carteira não procura sistematicamente a próxima oportunidade.</li>
              </ul>
            </article>
            <article className="rounded-3xl border border-cyan-500/15 bg-cyan-500/[0.025] p-7">
              <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Com VendorAI</p>
              <h2 className="mt-3 text-2xl font-bold">Cada etapa deixa dados para a próxima.</h2>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                <li>• Anúncio, LP, lead, oportunidade, venda e receita conectados.</li><li>• Next Best Action por estágio.</li><li>• Lead Cooling e recuperação identificáveis.</li><li>• Pós-venda mantém contexto.</li><li>• Revenue Scout procura receita adicional na carteira.</li>
              </ul>
            </article>
          </div>
        </section>

        {/* 08 — CALCULADORA */}
        <section className="px-4 py-20">
          <div className="mx-auto max-w-5xl rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-950/40 to-cyan-950/20 p-7 sm:p-10">
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <CircleDollarSign className="h-9 w-9 text-cyan-400" />
                <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-violet-300">Diagnóstico</p>
                <h2 className="mt-2 text-3xl font-bold">{pack.calculator.title}</h2>
                <p className="mt-4 text-sm leading-relaxed text-slate-400">A estimativa abaixo não promete recuperação desse valor. Ela apenas evidencia o volume financeiro associado a oportunidades sem fechamento e sem acompanhamento estruturado.</p>
                <div className="mt-6 rounded-2xl border border-cyan-400/15 bg-black/20 p-5">
                  <p className="text-xs uppercase tracking-wider text-slate-500">{pack.calculator.resultLabel}</p>
                  <p className="mt-2 text-4xl font-extrabold text-cyan-300">{money(calculatorResult)}</p>
                  <button onClick={markCalculatorComplete} className="mt-4 text-xs font-semibold text-violet-300 hover:text-white">Registrar diagnóstico nesta sessão →</button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">{pack.calculator.volumeLabel}<input inputMode="numeric" value={calculator.volume} onChange={(e) => handleCalculator("volume", e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" placeholder="Ex.: 100" /></label>
                <label className="text-sm text-slate-300">{pack.calculator.ticketLabel}<input inputMode="decimal" value={calculator.ticket} onChange={(e) => handleCalculator("ticket", e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" placeholder="Ex.: 5000" /></label>
                <label className="text-sm text-slate-300">{pack.calculator.conversionLabel}<input inputMode="decimal" value={calculator.conversion} onChange={(e) => handleCalculator("conversion", e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" placeholder="Ex.: 20" /></label>
                <label className="text-sm text-slate-300">{pack.calculator.coverageLabel}<input inputMode="decimal" value={calculator.coverage} onChange={(e) => handleCalculator("coverage", e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" placeholder="Ex.: 50" /></label>
              </div>
            </div>
          </div>
        </section>

        {/* 09 — REVENUE RECOVERED */}
        <section className="px-4 py-16">
          <div className="mx-auto max-w-5xl rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.025] p-8 text-center">
            <TrendingUp className="mx-auto h-9 w-9 text-emerald-400" />
            <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-emerald-300">Revenue Recovered by AI</p>
            <h2 className="mt-3 text-3xl font-bold">Não medir só quantos leads a IA respondeu. Medir quanto dinheiro voltou para o pipeline.</h2>
            <p className="mx-auto mt-4 max-w-3xl text-sm leading-relaxed text-slate-400">Quando houver dados reais, o VendorAI deve mostrar leads recuperados, vendas atribuídas à recuperação e receita efetivamente recuperada. Sem inventar números e sem confundir potencial com receita confirmada.</p>
          </div>
        </section>

        {/* 10 — REVENUE SCOUT */}
        <section className="px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div><Radar className="h-9 w-9 text-violet-400" /><p className="mt-5 text-xs font-semibold uppercase tracking-widest text-violet-300">Revenue Scout</p><h2 className="mt-2 text-3xl font-bold">{pack.revenueScout.title}</h2><p className="mt-4 text-sm leading-relaxed text-slate-400">{pack.revenueScout.example}</p></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {pack.revenueScout.signals.map((signal) => <div key={signal} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="text-sm font-semibold">{signal}</p><p className="mt-2 text-xs leading-relaxed text-slate-500">Sinal analisável para sugerir quem abordar, quando, por quê e com qual próxima ação.</p></div>)}
              </div>
            </div>
          </div>
        </section>

        {/* 11 — DEMO INTERATIVA */}
        <section id="demo" className="border-y border-white/5 bg-white/[0.02] px-4 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="text-center"><Workflow className="mx-auto h-9 w-9 text-cyan-400" /><p className="mt-5 text-xs font-semibold uppercase tracking-widest text-cyan-300">Demonstração da jornada</p><h2 className="mt-2 text-3xl font-bold">Simule um cliente avançando pelo fluxo de {pack.vertical}.</h2></div>
            <div className="mt-10 rounded-3xl border border-white/10 bg-black/20 p-6 sm:p-8">
              <div className="flex flex-wrap gap-2">{pack.journey.map((stage, index) => <button key={`${stage}-${index}`} onClick={() => { setDemoStep(index); if (index === 0) trackEvent("demo_started", pack.slug); }} className={`rounded-full border px-3 py-1.5 text-xs transition ${index <= demoStep ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-500"}`}>{index + 1}. {stage}</button>)}</div>
              <div className="mt-8 rounded-2xl border border-violet-400/15 bg-violet-400/[0.035] p-6"><p className="text-xs uppercase tracking-widest text-violet-300">Etapa atual</p><h3 className="mt-2 text-2xl font-bold">{pack.journey[demoStep]}</h3><p className="mt-3 text-sm leading-relaxed text-slate-400">{pack.timeline[demoStep]?.detail}</p></div>
              <div className="mt-5 flex gap-3"><button onClick={nextDemo} disabled={demoStep >= pack.journey.length - 1} className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">Próxima etapa</button><button onClick={resetDemo} className="flex items-center gap-2 rounded-xl border border-white/10 px-5 py-3 text-sm text-slate-300"><RefreshCcw className="h-4 w-4" /> Reiniciar</button></div>
            </div>
          </div>
        </section>

        {/* 12 — PROVA / KPIs */}
        <section className="px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center"><BarChart3 className="mx-auto h-9 w-9 text-violet-400" /><p className="mt-5 text-xs font-semibold uppercase tracking-widest text-violet-300">Prova baseada em dados reais</p><h2 className="mt-2 text-3xl font-bold">O que esta vertical deve provar no Launch Command Center.</h2><p className="mt-3 text-sm text-slate-400">Enquanto não houver prova pública suficiente, a plataforma deve usar demonstração real, tracking real e resultados reais — nunca números inventados.</p></div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{pack.kpis.slice(0, 4).map((kpi) => <div key={kpi} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><Target className="h-5 w-5 text-cyan-400" /><p className="mt-3 text-sm font-semibold">{kpi}</p></div>)}</div>
          </div>
        </section>

        {/* 13 — TRIAL */}
        <section className="bg-gradient-to-b from-violet-950/25 to-transparent px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center"><Sparkles className="mx-auto h-9 w-9 text-violet-400" /><p className="mt-5 text-xs font-semibold uppercase tracking-widest text-violet-300">Trial verticalizado</p><h2 className="mt-2 text-3xl font-bold">5 dias para experimentar valor — não apenas navegar por telas.</h2></div>
            <div className="mt-10 grid gap-4 md:grid-cols-5">{pack.trial.map((day) => <article key={day.day} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><div className="text-sm font-bold text-cyan-300">Dia {day.day}</div><h3 className="mt-2 font-semibold">{day.title}</h3><p className="mt-2 text-xs leading-relaxed text-slate-400">{day.detail}</p></article>)}</div>
          </div>
        </section>

        {/* FAQ */}
        <section className="px-4 py-20">
          <div className="mx-auto max-w-4xl"><h2 className="text-center text-3xl font-bold">Perguntas sobre VendorAI para {pack.vertical}</h2><div className="mt-10 space-y-3">{pack.faq.map((item) => <details key={item.question} className="group rounded-2xl border border-white/10 bg-white/[0.025] p-5"><summary className="cursor-pointer list-none font-semibold">{item.question}</summary><p className="mt-3 text-sm leading-relaxed text-slate-400">{item.answer}</p></details>)}</div></div>
        </section>

        {/* 14 — CTA FINAL */}
        <section id="demo-form" className="px-4 pb-28 pt-8">
          <div className="mx-auto max-w-xl rounded-3xl border border-violet-500/20 bg-gradient-to-b from-violet-950/40 to-white/[0.03] p-7 sm:p-9">
            {success ? (
              <div className="py-10 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" /><h2 className="mt-5 text-2xl font-bold">Contato recebido</h2><p className="mt-3 text-sm text-slate-400">Seu interesse em VendorAI para {pack.vertical} foi registrado com a origem desta LP. A jornada comercial pode continuar pelo mesmo CRM.</p></div>
            ) : (
              <form onSubmit={submit}>
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">Demonstração + trial de 5 dias</p>
                <h2 className="mt-2 text-2xl font-bold">Você já pagou pelo lead. Não pague para perdê-lo.</h2>
                <p className="mt-2 text-sm text-slate-400">Veja o fluxo aplicado a {pack.vertical}. A origem da LP permanece vinculada para atribuição anúncio → lead → venda → receita.</p>
                <div className="mt-7 grid gap-4">
                  <input required placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" />
                  <input required type="email" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" />
                  <input required placeholder="WhatsApp / telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" />
                  <input placeholder="Empresa" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" />
                  <textarea rows={3} placeholder="O que você quer automatizar primeiro?" value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" />
                </div>
                {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
                <button disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-4 font-bold disabled:opacity-60">{loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Enviando</> : <>Quero ver o VendorAI em ação <ArrowRight className="h-5 w-5" /></>}</button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
