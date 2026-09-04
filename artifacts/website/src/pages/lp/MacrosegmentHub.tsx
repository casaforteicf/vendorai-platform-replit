import { useEffect } from "react";
import { useParams } from "wouter";
import {
  MARKETING_VERTICALS,
  type MarketingMacrosegmentKey,
} from "@workspace/vendor-brain/marketing-verticals";
import { ArrowRight, Bot, Radar, Route, Sparkles } from "lucide-react";
import { usePublicCountry } from "@/lib/publicCountry";

type SegmentCopy = { name: string; eyebrow: string; description: string };

const SEGMENTS_PT: Record<MarketingMacrosegmentKey, SegmentCopy> = {
  retail: {
    name: "Lojas e Varejo",
    eyebrow: "Venda, recompra e relacionamento",
    description: "Jornadas comerciais para operações que precisam transformar atendimento, histórico de compra e comportamento em novas vendas.",
  },
  clinics: {
    name: "Clínicas e Saúde",
    eyebrow: "Agenda, retorno e relacionamento",
    description: "Jornadas com atenção a contexto, recorrência, agenda e conformidade para negócios de saúde, estética e bem-estar.",
  },
  dealerships: {
    name: "Concessionárias e Automotivo",
    eyebrow: "Lead, negociação e próxima troca",
    description: "Operações orientadas a estoque, intenção, avaliação, proposta, financiamento, pós-venda e ciclo futuro do cliente.",
  },
  distributors: {
    name: "Distribuidores e Atacado",
    eyebrow: "Carteira, mix e share of wallet",
    description: "Inteligência comercial B2B para enxergar categorias ausentes, frequência, clientes em risco e expansão de carteira.",
  },
  services: {
    name: "Serviços Profissionais",
    eyebrow: "Orçamento, follow-up e fechamento",
    description: "Jornadas consultivas para serviços em que a decisão leva tempo e cada orçamento precisa de acompanhamento contextual.",
  },
  industries: {
    name: "Indústrias e B2B",
    eyebrow: "Especificação, oportunidade e recorrência",
    description: "Operações de venda complexa com múltiplos decisores, propostas técnicas, ciclos longos e oportunidades de expansão por cliente.",
  },
};

const SEGMENTS_ES: Record<MarketingMacrosegmentKey, SegmentCopy> = {
  retail: {
    name: "Tiendas y Retail",
    eyebrow: "Venta, recompra y relación",
    description: "Jornadas comerciales para operaciones que necesitan transformar atención, historial de compra y comportamiento en nuevas ventas.",
  },
  clinics: {
    name: "Clínicas y Salud",
    eyebrow: "Agenda, retorno y relación",
    description: "Jornadas con atención al contexto, recurrencia, agenda y cumplimiento para negocios de salud, estética y bienestar.",
  },
  dealerships: {
    name: "Concesionarias y Automotriz",
    eyebrow: "Lead, negociación y próxima renovación",
    description: "Operaciones orientadas a inventario, intención, evaluación, propuesta, financiamiento, posventa y futuro ciclo del cliente.",
  },
  distributors: {
    name: "Distribuidoras y Mayoristas",
    eyebrow: "Cartera, mix y share of wallet",
    description: "Inteligencia comercial B2B para detectar categorías ausentes, frecuencia, clientes en riesgo y expansión de cartera.",
  },
  services: {
    name: "Servicios Profesionales",
    eyebrow: "Cotización, seguimiento y cierre",
    description: "Jornadas consultivas para servicios donde la decisión lleva tiempo y cada cotización necesita seguimiento contextual.",
  },
  industries: {
    name: "Industrias y B2B",
    eyebrow: "Especificación, oportunidad y recurrencia",
    description: "Operaciones de venta compleja con múltiples decisores, propuestas técnicas, ciclos largos y oportunidades de expansión por cliente.",
  },
};

const ALIASES: Record<string, MarketingMacrosegmentKey> = {
  varejo: "retail",
  lojas: "retail",
  clinicas: "clinics",
  saude: "clinics",
  automotivo: "dealerships",
  concessionarias: "dealerships",
  distribuidores: "distributors",
  atacado: "distributors",
  servicos: "services",
  industrias: "industries",
};

const UI_PT = {
  notFound: "Segmento não encontrado",
  back: "Voltar ao VendorAI",
  demo: "Ver demonstração",
  vendorFor: "VendorAI para",
  officialVerticals: "verticais oficiais",
  marketPipeline: "Pipeline por mercado",
  verticalScout: "Revenue Scout verticalizado",
  chooseMarket: "Escolha o mercado",
  differentOperation: "Uma operação diferente para cada subnicho",
  sourceDescription: "Cada página abaixo nasce da mesma fonte de verdade do Vendor Brain e carrega jornada, pipeline, agentes, KPIs e sinais comerciais próprios.",
  ownPipelines: "Pipelines próprios",
  ownPipelinesDesc: "A oportunidade avança conforme a realidade do mercado, não por um funil genérico igual para todos.",
  segmentAgents: "Agentes do segmento",
  finalTitle: "Escolha a sua vertical e veja o VendorAI trabalhando na jornada certa.",
  finalDesc: "As páginas acima são geradas dinamicamente e compartilham a mesma inteligência usada pelo Vendor Brain.",
  openFirst: "Abrir primeira vertical",
} as const;

const UI_ES: typeof UI_PT = {
  notFound: "Segmento no encontrado",
  back: "Volver a VendorAI",
  demo: "Ver demostración",
  vendorFor: "VendorAI para",
  officialVerticals: "verticales oficiales",
  marketPipeline: "Pipeline por mercado",
  verticalScout: "Revenue Scout verticalizado",
  chooseMarket: "Elige el mercado",
  differentOperation: "Una operación diferente para cada subnicho",
  sourceDescription: "Cada página nace de la misma fuente de verdad del Vendor Brain e incorpora jornada, pipeline, agentes, KPIs y señales comerciales propios.",
  ownPipelines: "Pipelines propios",
  ownPipelinesDesc: "La oportunidad avanza según la realidad del mercado, no por un embudo genérico igual para todos.",
  segmentAgents: "Agentes del segmento",
  finalTitle: "Elige tu vertical y mira a VendorAI trabajando en la jornada correcta.",
  finalDesc: "Las páginas anteriores se generan dinámicamente y comparten la misma inteligencia utilizada por Vendor Brain.",
  openFirst: "Abrir primera vertical",
};

function resolveSegment(raw: string): MarketingMacrosegmentKey | undefined {
  if (raw in SEGMENTS_PT) return raw as MarketingMacrosegmentKey;
  return ALIASES[raw];
}

export default function MacrosegmentHub() {
  const { isSpanish } = usePublicCountry();
  const segments = isSpanish ? SEGMENTS_ES : SEGMENTS_PT;
  const copy = isSpanish ? UI_ES : UI_PT;
  const params = useParams<{ slug: string }>();
  const segmentKey = resolveSegment((params.slug ?? "").toLowerCase());
  const segment = segmentKey ? segments[segmentKey] : undefined;
  const verticals = segmentKey
    ? MARKETING_VERTICALS.filter((item) => item.macrosegment === segmentKey)
    : [];

  useEffect(() => {
    if (segment) document.title = `${segment.name} com IA — VendorAI`;
  }, [segment]);

  if (!segment || !segmentKey) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#07070c] px-4 text-center text-white">
        <div className="text-5xl">🔍</div>
        <h1 className="text-3xl font-black">{copy.notFound}</h1>
        <a href="/" className="text-sm font-semibold text-cyan-300 hover:underline">{copy.back}</a>
      </div>
    );
  }

  const agents = Array.from(new Set(verticals.flatMap((item) => item.priorityAgents))).slice(0, 8);
  const signals = Array.from(new Set(verticals.flatMap((item) => item.revenueScout.signals))).slice(0, 8);

  return (
    <div className="min-h-screen bg-[#07070c] text-white antialiased">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#07070c]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-black">V</div>
            <div>
              <div className="text-base font-extrabold tracking-tight">VendorAI</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Business OS</div>
            </div>
          </a>
          <a href="/demo" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-black transition-transform hover:scale-[1.02]">
            {copy.demo} <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-4 pb-20 pt-20 sm:px-6 sm:pt-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(124,58,237,0.22),transparent_48%),radial-gradient(circle_at_90%_40%,rgba(6,182,212,0.10),transparent_35%)]" />
          <div className="relative mx-auto max-w-6xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-200">
              <Sparkles className="h-3.5 w-3.5" /> {segment.eyebrow}
            </div>
            <h1 className="max-w-4xl text-4xl font-black tracking-tight sm:text-6xl">{copy.vendorFor} {segment.name}</h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-slate-300">{segment.description}</p>
            <div className="mt-8 flex flex-wrap gap-3 text-xs text-slate-400">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">{verticals.length} {copy.officialVerticals}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">{copy.marketPipeline}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">{copy.verticalScout}</span>
            </div>
          </div>
        </section>

        <section className="border-y border-white/5 bg-white/[0.02] px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">{copy.chooseMarket}</div>
                <h2 className="text-3xl font-bold tracking-tight">{copy.differentOperation}</h2>
              </div>
              <p className="max-w-lg text-sm leading-relaxed text-slate-400">{copy.sourceDescription}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {verticals.map((vertical) => (
                <a
                  key={vertical.id}
                  href={`/lp/${vertical.slug}`}
                  className="group rounded-2xl border border-white/8 bg-[#0d0d15] p-6 transition-all hover:-translate-y-0.5 hover:border-violet-400/25 hover:bg-[#11111c]"
                >
                  <div className="mb-5 flex items-center justify-between">
                    <span className="rounded-full bg-violet-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-300">{vertical.audience}</span>
                    <ArrowRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-cyan-300" />
                  </div>
                  <h3 className="text-lg font-bold leading-snug">{vertical.name}</h3>
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-400">{vertical.promise}</p>
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {vertical.priorityAgents.slice(0, 3).map((agent) => (
                      <span key={agent} className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] text-slate-400">{agent}</span>
                    ))}
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-3">
            <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-7">
              <Route className="h-6 w-6 text-cyan-300" />
              <h2 className="mt-5 text-xl font-bold">{copy.ownPipelines}</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{copy.ownPipelinesDesc}</p>
            </div>
            <div className="rounded-3xl border border-white/8 bg-white/[0.025] p-7">
              <Bot className="h-6 w-6 text-violet-300" />
              <h2 className="mt-5 text-xl font-bold">{copy.segmentAgents}</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {agents.map((agent) => <span key={agent} className="rounded-full border border-white/8 px-2.5 py-1 text-[10px] text-slate-400">{agent}</span>)}
              </div>
            </div>
            <div className="rounded-3xl border border-emerald-400/10 bg-emerald-400/[0.035] p-7">
              <Radar className="h-6 w-6 text-emerald-300" />
              <h2 className="mt-5 text-xl font-bold">Revenue Scout</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {signals.map((signal) => <span key={signal} className="rounded-full border border-emerald-400/10 px-2.5 py-1 text-[10px] text-emerald-100/70">{signal}</span>)}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-28 sm:px-6">
          <div className="mx-auto max-w-5xl rounded-3xl border border-violet-400/15 bg-gradient-to-br from-violet-950/70 via-[#121126] to-cyan-950/40 p-8 text-center sm:p-14">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">{copy.finalTitle}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-300">{copy.finalDesc}</p>
            <a href={`/lp/${verticals[0]?.slug ?? ""}`} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-black">
              {copy.openFirst} <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
