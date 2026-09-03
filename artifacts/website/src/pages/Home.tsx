import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileSearch,
  Gauge,
  Globe,
  LayoutTemplate,
  Megaphone,
  Newspaper,
  Radar,
  RefreshCcw,
  Route,
  Sparkles,
  Target,
  TrendingUp,
  UserRoundCheck,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MARKETING_VERTICALS,
  OFFICIAL_TRIAL_5_DAYS,
  type MarketingMacrosegmentKey,
  type MarketingVerticalProfile,
} from "@workspace/vendor-brain/marketing-verticals";

const MACROSEGMENTS: Record<
  MarketingMacrosegmentKey,
  { label: string; short: string; description: string }
> = {
  retail: {
    label: "Lojas e Varejo",
    short: "Varejo",
    description: "Venda, recompra e relacionamento com consumidor final.",
  },
  clinics: {
    label: "Clínicas e Saúde",
    short: "Clínicas",
    description: "Atendimento, agenda, retorno e continuidade administrativa.",
  },
  dealerships: {
    label: "Concessionárias e Automotivo",
    short: "Automotivo",
    description: "Lead, avaliação, proposta, test-drive, venda e próxima troca.",
  },
  distributors: {
    label: "Distribuidoras e Atacado",
    short: "Distribuição",
    description: "Carteira, frequência, mix, recompra e share of wallet.",
  },
  services: {
    label: "Serviços Profissionais",
    short: "Serviços",
    description: "Diagnóstico, proposta, follow-up, contrato e expansão.",
  },
  industries: {
    label: "Indústrias e B2B",
    short: "Indústrias",
    description: "Especificação, cotação técnica, negociação e próxima oportunidade.",
  },
};

const GROWTH_CYCLE = [
  ["Atrair", "Campanhas, anúncios, conteúdo e LPs"],
  ["Captar", "Origem, campanha, criativo, produto e intenção"],
  ["Converter", "Atendimento, qualificação, agenda e follow-up"],
  ["Vender", "Pipeline, proposta, negociação e fechamento"],
  ["Entregar", "Pedido, projeto, produção, execução ou serviço"],
  ["Fidelizar", "Pós-venda, satisfação, suporte e retorno"],
  ["Expandir", "Revenue Scout, recompra, upsell e cross-sell"],
  ["Aprender", "Marketing e vendas alimentam a memória da IA"],
] as const;

const AGENT_FLOW = [
  ["SDR IA", "Responde e entende a intenção"],
  ["Qualificação IA", "Identifica contexto e prioridade"],
  ["Follow-up IA", "Detecta esfriamento e mantém a próxima ação"],
  ["Closer IA", "Apoia proposta, negociação e decisão"],
  ["Pós-venda IA", "Continua a jornada depois do fechamento"],
  ["Revenue Scout", "Procura a próxima oportunidade na carteira"],
] as const;

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function pickDefaultProfile(): MarketingVerticalProfile {
  return (
    MARKETING_VERTICALS.find((profile) =>
      profile.name.toLowerCase().includes("marcenaria"),
    ) ?? MARKETING_VERTICALS[0]
  );
}

export default function Home() {
  const defaultProfile = pickDefaultProfile();
  const [macrosegment, setMacrosegment] = useState<MarketingMacrosegmentKey>(
    defaultProfile.macrosegment,
  );
  const [selectedSlug, setSelectedSlug] = useState(defaultProfile.slug);
  const [leadsPerMonth, setLeadsPerMonth] = useState(300);
  const [cpl, setCpl] = useState(35);
  const [ticket, setTicket] = useState(4000);
  const [closeRate, setCloseRate] = useState(5);
  const [structuredFollowup, setStructuredFollowup] = useState(40);
  const [liveMetrics, setLiveMetrics] = useState<{ leadsAcompanhados: number; oportunidadesAtivas: number; leadsUltimos30dias: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/vendorai-live-metrics")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setLiveMetrics(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const profilesInMacro = useMemo(
    () => MARKETING_VERTICALS.filter((profile) => profile.macrosegment === macrosegment),
    [macrosegment],
  );

  const selectedProfile =
    MARKETING_VERTICALS.find((profile) => profile.slug === selectedSlug) ?? defaultProfile;

  const withoutStructuredFollowup = Math.max(
    0,
    Math.round(leadsPerMonth * (1 - structuredFollowup / 100)),
  );
  const acquisitionInvestment = leadsPerMonth * cpl;
  const acquisitionInvestmentWithoutFollowup = withoutStructuredFollowup * cpl;
  const currentSalesEstimate = Math.max(0, leadsPerMonth * (closeRate / 100));
  const currentRevenueEstimate = currentSalesEstimate * ticket;

  function chooseMacrosegment(key: MarketingMacrosegmentKey) {
    setMacrosegment(key);
    const first = MARKETING_VERTICALS.find((profile) => profile.macrosegment === key);
    if (first) setSelectedSlug(first.slug);
  }

  return (
    <div className="bg-white text-slate-950">
      <section className="relative overflow-hidden border-b border-white/10 bg-[#070b14] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(37,99,235,0.25),transparent_34%),radial-gradient(circle_at_78%_20%,rgba(99,102,241,0.18),transparent_30%),linear-gradient(180deg,#0a1020_0%,#070b14_76%)]" />
        <div className="container relative mx-auto grid min-h-[760px] items-center gap-14 px-4 py-20 lg:grid-cols-[1.03fr_.97fr] lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-4 py-2 text-sm font-medium text-blue-200">
              <Sparkles className="h-4 w-4" />
              Operação comercial funcionando com Inteligência Artificial
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl xl:text-[80px]">
              Você já pagou pelo lead.
              <span className="block bg-gradient-to-r from-blue-300 via-blue-400 to-indigo-300 bg-clip-text text-transparent">
                Não pague para perdê-lo.
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 md:text-xl">
              Do anúncio à próxima venda, o VendorAI conecta marketing, atendimento, CRM,
              follow-up, fechamento, pós-venda e Revenue Scout em uma única operação orientada à receita.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-14 rounded-xl bg-blue-500 px-7 text-base font-semibold text-white shadow-[0_16px_55px_rgba(37,99,235,0.28)] hover:bg-blue-400"
              >
                <Link href="/demo">
                  Testar 5 dias grátis <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-14 rounded-xl border-white/15 bg-white/[0.04] px-7 text-base text-white hover:bg-white/[0.09] hover:text-white"
              >
                <Link href="/funcionalidades">Ver como funciona</Link>
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400">
              {["Sem cobrança durante o teste", "Jornada configurada por mercado", "Dados reais substituem suposições"].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" /> {item}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.08 }}
            className="relative"
          >
            <div className="absolute -inset-10 rounded-[48px] bg-blue-500/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1423]/95 shadow-[0_40px_120px_rgba(0,0,0,0.48)]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold">Timeline comercial</p>
                  <p className="text-xs text-slate-500">Demonstração da jornada do VendorAI</p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Em operação
                </div>
              </div>
              <div className="space-y-1 p-5">
                {[
                  ["14:02", "Lead entrou pelo Meta", "Novo lead"],
                  ["14:02:03", "IA respondeu", "Atendimento"],
                  ["14:04", "Necessidade identificada", "Contexto"],
                  ["14:06", "Lead qualificado", "Qualificado"],
                  ["14:08", "Oportunidade criada", "Pipeline"],
                  ["14:45", "Cliente parou de responder", "Lead cooling"],
                  ["Dia seguinte", "IA executou follow-up", "Recuperação"],
                  ["09:27", "Cliente respondeu", "Retomado"],
                  ["09:32", "Próxima ação agendada", "NBA"],
                ].map(([time, text, status], index) => (
                  <motion.div
                    key={`${time}-${text}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 + index * 0.06 }}
                    className="grid grid-cols-[82px_1fr_auto] items-center gap-3 rounded-xl border border-transparent px-3 py-3 hover:border-white/[0.07] hover:bg-white/[0.03]"
                  >
                    <span className="text-xs font-semibold text-blue-300">{time}</span>
                    <span className="text-sm text-slate-200">{text}</span>
                    <span className="hidden rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-slate-400 sm:block">{status}</span>
                  </motion.div>
                ))}
              </div>
              <div className="border-t border-white/10 bg-emerald-400/[0.06] px-5 py-4">
                <div className="flex items-center gap-3">
                  <RefreshCcw className="h-5 w-5 text-emerald-300" />
                  <div>
                    <p className="text-sm font-medium text-emerald-100">Oportunidade continua viva</p>
                    <p className="text-xs text-slate-500">Sem depender da memória do vendedor.</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-slate-50 py-20 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Escolha como sua empresa vende</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">
              O site muda porque a operação muda.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              O VendorAI usa os mesmos 50 perfis verticais do produto para explicar uma jornada diferente para cada mercado.
            </p>
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {(Object.keys(MACROSEGMENTS) as MarketingMacrosegmentKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => chooseMacrosegment(key)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  macrosegment === key
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
                }`}
              >
                {MACROSEGMENTS[key].short}
              </button>
            ))}
          </div>

          <div className="mx-auto mt-8 grid max-w-6xl gap-5 lg:grid-cols-[.78fr_1.22fr]">
            <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{MACROSEGMENTS[macrosegment].label}</p>
              <p className="mt-2 text-sm text-slate-500">{MACROSEGMENTS[macrosegment].description}</p>
              <div className="mt-5 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {profilesInMacro.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelectedSlug(profile.slug)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      selectedProfile.slug === profile.slug
                        ? "border-blue-200 bg-blue-50"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">{profile.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{profile.corePain}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] md:p-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">VendorAI para {selectedProfile.name}</p>
                  <h3 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950">{selectedProfile.lp.headline}</h3>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{selectedProfile.lp.subheadline}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{selectedProfile.audience}</span>
              </div>

              <div className="mt-7">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Route className="h-4 w-4 text-blue-600" /> Jornada real desse mercado
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedProfile.journey.map((step, index) => (
                    <div key={`${step}-${index}`} className="flex items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">{step}</span>
                      {index < selectedProfile.journey.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-7 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4 text-blue-600" /> Agentes prioritários</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedProfile.priorityAgents.map((agent) => (
                      <span key={agent} className="rounded-full bg-white px-3 py-1 text-xs text-slate-600 shadow-sm">{agent}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950"><Radar className="h-4 w-4 text-emerald-600" /> Revenue Scout procura</div>
                  <div className="mt-3 space-y-2">
                    {selectedProfile.revenueScout.signals.slice(0, 4).map((signal) => (
                      <div key={signal} className="flex items-start gap-2 text-xs leading-5 text-emerald-900/75">
                        <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> {signal}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button asChild className="rounded-xl">
                  <Link href={`/lp/${selectedProfile.slug}`}>Abrir experiência completa <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/demo">Simular um cliente</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Não é uma lista de funcionalidades</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Veja a operação inteira trabalhando.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              A tecnologia aparece dentro da jornada: cada etapa gera contexto para a próxima, até a venda, o pós-venda e a próxima oportunidade.
            </p>
          </div>
          <div className="mx-auto mt-14 grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-4">
            {GROWTH_CYCLE.map(([title, description], index) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">{String(index + 1).padStart(2, "0")}</div>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 py-20 text-white md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">Marketing rodando com IA de verdade</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Enquanto a operação vende, a IA constrói presença digital sozinha.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-400">Não é um checklist de funcionalidades. São ferramentas que fazem o trabalho de uma agência inteira, rodando dentro do mesmo sistema que já sabe tudo sobre o seu negócio.</p>
          </div>
          <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-2">
            {[
              {
                icon: Globe,
                title: "Gerador de Sites com IA",
                desc: "Descreva sua empresa e a IA monta o site completo — textos, estrutura, SEO e identidade visual — pronto pra publicar em minutos, não em semanas de agência.",
                cta: "Ver o gerador de sites",
              },
              {
                icon: FileSearch,
                title: "Análise do seu site atual",
                desc: "Cole a URL do site que você já tem. A IA audita estrutura, conteúdo e SEO, e aponta exatamente o que está custando visita e conversão.",
                cta: "Ver como funciona a análise",
              },
              {
                icon: Newspaper,
                title: "Content Autopilot",
                desc: "A IA pesquisa palavras-chave do seu mercado, escreve artigos de blog otimizados pra SEO e publica sozinha, todo dia — sem você abrir uma tela de redação.",
                cta: "Ver o Content Autopilot",
              },
              {
                icon: LayoutTemplate,
                title: "50 landing pages por mercado",
                desc: "Cada um dos 50 perfis verticais do VendorAI tem sua própria LP, com estrutura de venda SPIN Selling pronta — não é um template genérico reaproveitado.",
                cta: "Ver as LPs por segmento",
              },
            ].map((item) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                className="rounded-[26px] border border-white/10 bg-white/[0.04] p-7"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-400/10 text-blue-300"><item.icon className="h-5 w-5" /></div>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.02em]">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{item.desc}</p>
                <Link href="/funcionalidades#sites" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-300 hover:text-blue-200">
                  {item.cta} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#090f1b] py-20 text-white md:py-28">
        <div className="container mx-auto px-4">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">AI Marketing Manager</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Seu marketing sabe qual anúncio realmente vendeu?</h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
                O VendorAI acompanha a cadeia da campanha até a oportunidade, proposta, venda e receita. A prioridade deixa de ser o clique mais barato e passa a ser o resultado comercial.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {["Observador", "Assistido", "Autônomo"].map((mode, index) => (
                  <div key={mode} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-xs text-slate-500">Nível {index + 1}</p>
                    <p className="mt-1 font-semibold">{mode}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-sm font-semibold">Comparação de campanhas</p>
                  <p className="text-xs text-slate-500">Exemplo ilustrativo de decisão</p>
                </div>
                <Gauge className="h-5 w-5 text-blue-300" />
              </div>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-5">
                  <div className="flex items-center justify-between"><span className="font-semibold">Campanha A</span><span className="text-xs text-slate-500">CPL menor</span></div>
                  <p className="mt-2 text-sm text-slate-400">Gera volume de leads, mas baixa progressão comercial.</p>
                </div>
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] p-5">
                  <div className="flex items-center justify-between"><span className="font-semibold text-emerald-100">Campanha B</span><span className="text-xs text-emerald-300">Mais receita</span></div>
                  <p className="mt-2 text-sm text-slate-300">CPL maior, porém melhor qualificação, mais vendas e maior valor comercial.</p>
                </div>
                <div className="rounded-2xl border border-blue-400/20 bg-blue-400/[0.08] p-5">
                  <div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" /><div><p className="text-sm font-semibold text-blue-100">Recomendação da IA</p><p className="mt-1 text-sm leading-6 text-slate-300">Priorizar a Campanha B e ampliar o teste dentro dos limites definidos, porque a métrica principal é receita — não apenas CPL.</p></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-[30px] border border-slate-200 bg-slate-50 p-7 md:p-9">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100"><CircleDollarSign className="h-6 w-6 text-blue-700" /></div>
              <p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-blue-600">VendorAI vende o VendorAI</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">A operação comercial deste próprio site roda no VendorAI.</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">Nenhum número fictício: os totais abaixo vêm direto da nossa própria instância, ao vivo, acompanhando todo lead que chega por este site.</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Leads acompanhados pela IA</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{liveMetrics ? liveMetrics.leadsAcompanhados : "—"}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Oportunidades ativas no pipeline</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{liveMetrics ? liveMetrics.oportunidadesAtivas : "—"}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Novos leads (últimos 30 dias)</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{liveMetrics ? liveMetrics.leadsUltimos30dias : "—"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-emerald-200 bg-emerald-50 p-7 md:p-9">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100"><Radar className="h-6 w-6 text-emerald-700" /></div>
              <p className="mt-6 text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Revenue Scout</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">A venda não termina quando o cliente compra.</h2>
              <div className="mt-6 space-y-3">
                {[
                  ["Distribuidora", "Cliente compra A, mas não compra B."],
                  ["Seguros", "Possui Auto, mas ainda não possui outra proteção compatível."],
                  ["Marcenaria", "Cozinha concluída; outro ambiente pode surgir como próxima oportunidade."],
                  ["Concessionária", "Histórico de compra pode indicar futura troca, revisão ou expansão."],
                ].map(([market, example]) => (
                  <div key={market} className="rounded-2xl border border-emerald-200 bg-white/70 p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{market}</p><p className="mt-1 text-sm text-slate-700">{example}</p></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Calculadora de Leads Perdidos</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Quanto da demanda que você já pagou recebe acompanhamento estruturado?</h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">A calculadora não promete recuperação. Ela mostra o tamanho da demanda adquirida e quanto dela pode estar passando pelo processo sem follow-up estruturado.</p>
          </div>

          <div className="mx-auto mt-12 grid max-w-6xl gap-6 lg:grid-cols-[1fr_.9fr]">
            <div className="rounded-[26px] border border-slate-200 bg-white p-6 md:p-8">
              <div className="grid gap-5 sm:grid-cols-2">
                {[
                  ["Leads por mês", leadsPerMonth, setLeadsPerMonth, "300"],
                  ["Custo médio por lead (R$)", cpl, setCpl, "35"],
                  ["Ticket médio (R$)", ticket, setTicket, "4000"],
                  ["Taxa atual de fechamento (%)", closeRate, setCloseRate, "5"],
                  ["Leads com follow-up estruturado (%)", structuredFollowup, setStructuredFollowup, "40"],
                ].map(([label, value, setter, placeholder]) => (
                  <label key={String(label)} className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">{String(label)}</span>
                    <Input
                      type="number"
                      min="0"
                      value={Number(value)}
                      placeholder={String(placeholder)}
                      onChange={(event) => (setter as (value: number) => void)(Math.max(0, Number(event.target.value) || 0))}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] bg-[#0b1220] p-6 text-white md:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">Diagnóstico</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">Investimento de aquisição/mês</p><p className="mt-2 text-2xl font-semibold">{money(acquisitionInvestment)}</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">Leads sem follow-up estruturado</p><p className="mt-2 text-2xl font-semibold">{withoutStructuredFollowup}</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">Aquisição associada a esses leads</p><p className="mt-2 text-2xl font-semibold">{money(acquisitionInvestmentWithoutFollowup)}</p></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-slate-500">Receita média atual do funil*</p><p className="mt-2 text-2xl font-semibold">{money(currentRevenueEstimate)}</p></div>
              </div>
              <p className="mt-4 text-[11px] leading-5 text-slate-500">*Estimativa matemática com base nos valores informados, não previsão de resultado ou receita recuperável.</p>
              <Button asChild className="mt-6 w-full rounded-xl bg-blue-500 hover:bg-blue-400"><Link href="/demo">Ver como o VendorAI acompanha essa demanda</Link></Button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="grid items-start gap-12 lg:grid-cols-[.82fr_1.18fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Agentes dentro da jornada</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">A IA não aparece como um menu. Ela aparece quando precisa agir.</h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">Cada agente recebe contexto da etapa anterior e deixa a próxima ação pronta, evitando que atendimento, vendas e pós-venda funcionem como ilhas.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {AGENT_FLOW.map(([agent, role], index) => (
                <div key={agent} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Bot className="h-4 w-4" /></div><div><p className="text-xs text-slate-400">Etapa {index + 1}</p><p className="font-semibold">{agent}</p></div></div>
                  <p className="mt-3 text-sm leading-6 text-slate-500">{role}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-950 py-20 text-white md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-300">6 macrosegmentos · 50 mercados</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Não é “serve para vários segmentos”. É inteligência vertical pronta para começar.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-400">Cada mercado recebe linguagem, jornada, pipeline, agentes, LP, Google intents e Revenue Scout próprios — todos conectados à mesma inteligência central.</p>
          </div>
          <div className="mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(MACROSEGMENTS) as MarketingMacrosegmentKey[]).map((key) => {
              const profiles = MARKETING_VERTICALS.filter((profile) => profile.macrosegment === key);
              return (
                <Link key={key} href={`/segmentos/${key}`} className="group rounded-[24px] border border-white/10 bg-white/[0.04] p-6 transition hover:-translate-y-1 hover:border-blue-400/30 hover:bg-white/[0.06]">
                  <div className="flex items-center justify-between"><div><p className="text-lg font-semibold">{MACROSEGMENTS[key].label}</p><p className="mt-1 text-sm text-slate-500">{profiles.length} mercados</p></div><ArrowRight className="h-5 w-5 text-slate-600 transition group-hover:translate-x-1 group-hover:text-blue-300" /></div>
                  <div className="mt-5 flex flex-wrap gap-2">{profiles.slice(0, 5).map((profile) => <span key={profile.id} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400">{profile.name}</span>)}{profiles.length > 5 && <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-500">+{profiles.length - 5}</span>}</div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">5 dias para chegar ao primeiro valor</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] md:text-5xl">O trial não é um sistema vazio.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">A experiência começa contextualizada para o mercado escolhido e mostra a IA trabalhando antes de pedir uma decisão de compra.</p>
          </div>
          <div className="mx-auto mt-12 grid max-w-6xl gap-4 md:grid-cols-5">
            {OFFICIAL_TRIAL_5_DAYS.map((item) => (
              <div key={item.day} className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">{item.day}</div>
                <p className="mt-5 font-semibold">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center"><Button asChild size="lg" className="h-14 rounded-xl px-8"><Link href="/demo">Começar meus 5 dias grátis <ArrowRight className="ml-2 h-5 w-5" /></Link></Button></div>
        </div>
      </section>

      <section className="px-4 pb-20 md:pb-28">
        <div className="container mx-auto overflow-hidden rounded-[34px] bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 px-6 py-14 text-white shadow-[0_35px_100px_rgba(37,99,235,0.28)] md:px-12 md:py-16">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-100">VendorAI deve vender o VendorAI</p><h2 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Seu próximo lead já pode entrar em uma operação que sabe o que fazer depois.</h2><p className="mt-5 max-w-3xl text-lg leading-8 text-blue-100">Campanha, LP, atendimento, qualificação, follow-up, venda, pós-venda, Revenue Scout e aprendizado contínuo na mesma jornada.</p></div>
            <div className="flex flex-col gap-3"><Button asChild size="lg" className="h-14 rounded-xl bg-white px-7 text-blue-700 hover:bg-blue-50"><Link href="/demo">Simular um cliente <ArrowRight className="ml-2 h-5 w-5" /></Link></Button><Link href="/precos" className="text-center text-sm text-blue-100 hover:text-white">Ver planos e condições</Link></div>
          </div>
        </div>
      </section>
    </div>
  );
}
