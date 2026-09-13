import { Link, useParams } from "wouter";
import { useEffect } from "react";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarCheck,
  Check,
  ChevronDown,
  CircleDollarSign,
  Dumbbell,
  HeartPulse,
  Instagram,
  Megaphone,
  MessageCircle,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";

type Intent = "dor" | "marketing" | "crm";

type PageTheme = {
  badge: string;
  eyebrow: string;
  title: string;
  accent: string;
  subtitle: string;
  proof: string[];
  primarySection: string;
  cards: Array<{ title: string; text: string; icon: typeof Target }>;
  journey: string[];
  metricLabel: string;
  metrics: Array<{ value: string; label: string }>;
};

const THEMES: Record<Intent, PageTheme> = {
  dor: {
    badge: "Dor / Descoberta",
    eyebrow: "PARA ACADEMIAS E STUDIOS",
    title: "Mais alunos. Mais resultado.",
    accent: "Menos perda.",
    subtitle: "Identifique onde sua academia perde matrículas, frequência e renovações — e transforme esses sinais em próximas ações claras.",
    proof: ["Sem cartão de crédito", "Configuração rápida", "Suporte em português"],
    primarySection: "Os maiores desafios das academias e studios",
    cards: [
      { title: "Aula experimental sem matrícula", text: "Pessoas agendam, fazem a aula e não avançam para a matrícula.", icon: CalendarCheck },
      { title: "Alunos que param de frequentar", text: "A queda de frequência aparece antes do cancelamento — mas quase nunca vira ação.", icon: UserCheck },
      { title: "Leads frios e sem acompanhamento", text: "Conversas ficam esquecidas e a equipe perde o timing do próximo contato.", icon: MessageCircle },
      { title: "Renovações esquecidas", text: "Alunos chegam ao fim do plano sem uma jornada de renovação bem definida.", icon: HeartPulse },
      { title: "Campanhas sem leitura comercial", text: "A academia investe em mídia sem saber quais campanhas viram matrícula.", icon: Megaphone },
      { title: "Perda de receita invisível", text: "Oportunidades de reativação, upgrade e retenção ficam escondidas na base.", icon: CircleDollarSign },
    ],
    journey: ["Lead", "Qualificação", "Aula experimental", "Follow-up", "Matrícula", "Renovação"],
    metricLabel: "Resultados que importam",
    metrics: [
      { value: "+67%", label: "mais matrículas" },
      { value: "-38%", label: "menos cancelamentos" },
      { value: "+52%", label: "mais retenção" },
      { value: "3x", label: "mais eficiência no follow-up" },
    ],
  },
  marketing: {
    badge: "Marketing / Crescimento",
    eyebrow: "PARA ACADEMIAS E STUDIOS",
    title: "Atraia mais alunos com",
    accent: "marketing inteligente.",
    subtitle: "Planejamento, conteúdo, Meta, Google, landing pages, WhatsApp e CRM conectados para transformar atenção em aula experimental e matrícula.",
    proof: ["Campanhas conectadas ao CRM", "Leads com origem identificada", "Otimização por resultado"],
    primarySection: "Campanhas que realmente funcionam",
    cards: [
      { title: "Meta Ads", text: "Campanhas para descoberta, desejo, remarketing e prova social.", icon: Instagram },
      { title: "Google Ads", text: "Capture quem já procura academia, pilates, funcional ou personal na sua região.", icon: Search },
      { title: "Landing Pages", text: "Páginas específicas para objetivo, modalidade, localização e campanha.", icon: Target },
      { title: "Criativos com IA", text: "Posts, anúncios, vídeos, roteiros e variações orientadas pelo objetivo da campanha.", icon: Sparkles },
      { title: "WhatsApp conectado", text: "O lead chega com contexto de campanha e continua a conversa sem perder origem.", icon: MessageCircle },
      { title: "Medição até matrícula", text: "Acompanhe lead, agendamento, aula experimental, matrícula e custo por oportunidade.", icon: BarChart3 },
    ],
    journey: ["Atração", "Clique", "Conversa", "Agendamento", "Aula", "Matrícula"],
    metricLabel: "Crescimento acompanhado de ponta a ponta",
    metrics: [
      { value: "+120%", label: "engajamento" },
      { value: "+68%", label: "geração de leads" },
      { value: "+54%", label: "matrículas" },
      { value: "-45%", label: "custo por lead" },
    ],
  },
  crm: {
    badge: "CRM / Alta intenção",
    eyebrow: "PARA ACADEMIAS E STUDIOS",
    title: "Gestão completa da sua academia",
    accent: "em um só lugar.",
    subtitle: "CRM, WhatsApp, agenda, follow-up, IA, reativação, relatórios e inteligência para organizar mais alunos com menos operação manual.",
    proof: ["Tudo em um só lugar", "100% conectado", "IA trabalhando com sua equipe"],
    primarySection: "Tudo que sua academia precisa, em um só sistema",
    cards: [
      { title: "CRM de alunos", text: "Leads, alunos, aulas experimentais, matrículas e renovações em um só histórico.", icon: Users },
      { title: "WhatsApp integrado", text: "Atendimento, follow-up, lembretes e histórico comercial conectado.", icon: MessageCircle },
      { title: "Agenda inteligente", text: "Aulas, avaliações e compromissos organizados com próxima ação definida.", icon: CalendarCheck },
      { title: "Agentes de IA", text: "Qualificação, follow-up, agendamento, reativação e pós-venda apoiados por IA.", icon: Bot },
      { title: "Revenue Scout", text: "Encontra alunos em risco, oportunidades de reativação e novas receitas na base.", icon: Radar },
      { title: "Visitor Intelligence", text: "Entenda origem, campanha e comportamento digital antes do contato comercial.", icon: Search },
    ],
    journey: ["Lead", "Qualificação", "Aula", "Matrícula", "Retenção", "Renovação"],
    metricLabel: "Mais inteligência para operar melhor",
    metrics: [
      { value: "-60%", label: "tempo de gestão" },
      { value: "+45%", label: "produtividade" },
      { value: "+52%", label: "retenção" },
      { value: "+70%", label: "satisfação" },
    ],
  },
};

const SOLUTION_CARDS = [
  { title: "CRM de alunos", text: "Organize leads, aulas experimentais, matrículas e renovações.", icon: Users },
  { title: "WhatsApp integrado", text: "Converse, agende e acompanhe tudo em um só lugar.", icon: MessageCircle },
  { title: "Agentes de IA", text: "Automatize follow-up, qualificação, reativação e próximos passos.", icon: Bot },
  { title: "Revenue Scout", text: "Identifique alunos em risco e novas oportunidades de receita.", icon: Radar },
  { title: "Visitor Intelligence", text: "Veja quem visitou seu site, de onde veio e o que demonstrou interesse.", icon: Search },
  { title: "Relatórios e metas", text: "Acompanhe matrícula, retenção, churn e resultado por unidade.", icon: BarChart3 },
];

const FAQ = [
  ["O VendorAI funciona para academia, studio e personal?", "Sim. A jornada pode ser ajustada para academia, funcional, pilates, cross training, studios e operações com aulas recorrentes."],
  ["Consigo acompanhar aula experimental e matrícula?", "Sim. Essas etapas podem ficar visíveis no pipeline, com responsável, prazo e próxima ação."],
  ["Posso integrar meu WhatsApp?", "Sim. O WhatsApp pode fazer parte da jornada comercial e do histórico do aluno."],
  ["A IA ajuda a reativar alunos?", "Sim. A base pode ser analisada para identificar inatividade, queda de frequência e oportunidades de reativação conforme as regras da empresa."],
  ["Consigo medir campanhas até a matrícula?", "A jornada pode preservar origem, campanha, lead, agendamento, oportunidade e resultado para aproximar marketing de receita."],
  ["Posso começar com meus dados atuais?", "Sim. O onboarding pode partir de leads, usuários, serviços, integrações e dados já disponíveis."],
];

function Cta({ secondary = false }: { secondary?: boolean }) {
  return (
    <a
      href={secondary ? "/demo?vertical=academias-studios" : "/demo?vertical=academias-studios&intent=trial-5-dias"}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-black transition ${secondary ? "border border-white/25 bg-white/5 text-white hover:bg-white/10" : "bg-orange-500 text-white shadow-[0_16px_45px_rgba(249,115,22,.28)] hover:bg-orange-600"}`}
    >
      {secondary ? "Ver demonstração" : "Testar 5 dias grátis"}
      <ArrowRight className="h-4 w-4" />
    </a>
  );
}

function MiniDashboard({ intent }: { intent: Intent }) {
  const labels = intent === "marketing"
    ? ["Leads", "Agendamentos", "Matrículas", "ROAS"]
    : intent === "crm"
      ? ["Leads", "Alunos ativos", "Renovações", "Receita"]
      : ["Novos leads", "Aulas", "Em risco", "Reativações"];
  const values = intent === "marketing" ? ["312", "89", "56", "4.8x"] : intent === "crm" ? ["247", "892", "64", "R$ 42k"] : ["124", "31", "18", "22"];

  return (
    <div className="rounded-[28px] border border-white/10 bg-slate-950 p-4 shadow-2xl ring-1 ring-black/10 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><div className="h-8 w-8 rounded-lg bg-orange-500" /><div><div className="text-xs font-black text-white">Vendor<span className="text-orange-500">AI</span></div><div className="text-[10px] text-slate-500">Academia Movimento</div></div></div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold text-slate-300">Visão geral</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {labels.map((label, i) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><div className="text-lg font-black text-white">{values[i]}</div><div className="mt-1 text-[10px] text-slate-400">{label}</div></div>)}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.5fr_.8fr]">
        <div className="rounded-2xl bg-white p-4">
          <div className="flex items-end gap-2">
            {[42,58,50,72,63,88,78,104,96,126,118,150].map((h, i) => <div key={i} className="flex-1 rounded-t bg-orange-500/85" style={{ height: `${Math.max(18, h/2)}px` }} />)}
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] font-semibold text-slate-400"><span>Últimos 30 dias</span><span className="text-emerald-600">+28%</span></div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-xs font-bold text-white">Ações de hoje</div>
          <div className="mt-3 space-y-2 text-[10px] text-slate-300">
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-500" /> 12 leads sem retorno</div>
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" /> 8 aulas experimentais</div>
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" /> 5 renovações próximas</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AcademiasIntentLp() {
  const params = useParams<{ intent: string }>();
  const intent = (params.intent ?? "dor") as Intent;
  const theme = THEMES[intent] ?? THEMES.dor;

  useEffect(() => {
    document.title = `${theme.title} ${theme.accent} | VendorAI`;
    let description = document.querySelector('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.setAttribute("name", "description");
      document.head.appendChild(description);
    }
    description.setAttribute("content", theme.subtitle.slice(0, 155));
  }, [theme]);

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-slate-950 antialiased">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07101b]/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-xl font-black tracking-tight">Vendor<span className="text-orange-500">AI</span></Link>
          <nav className="hidden items-center gap-6 text-xs font-bold text-slate-300 md:flex">
            <a href="#desafios" className="hover:text-white">Desafios</a><a href="#solucao" className="hover:text-white">Solução</a><a href="#jornada" className="hover:text-white">Jornada</a><a href="#faq" className="hover:text-white">FAQ</a>
          </nav>
          <a href="/demo?vertical=academias-studios&intent=trial-5-dias" className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black text-white hover:bg-orange-600">Testar 5 dias grátis</a>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[#07101b] px-4 py-16 text-white sm:px-6 sm:py-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(249,115,22,.22),transparent_34%),radial-gradient(circle_at_10%_0%,rgba(14,165,233,.08),transparent_28%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.03fr_.97fr]">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-orange-300"><Dumbbell className="h-3.5 w-3.5" /> {theme.badge}</div>
              <p className="text-xs font-black tracking-[0.22em] text-orange-400">{theme.eyebrow}</p>
              <h1 className="mt-4 max-w-3xl text-5xl font-black leading-[.98] tracking-tight sm:text-6xl lg:text-7xl">{theme.title}<br/><span className="text-orange-500">{theme.accent}</span></h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{theme.subtitle}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Cta /><Cta secondary /></div>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-slate-400">{theme.proof.map((item) => <span key={item} className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-orange-400" />{item}</span>)}</div>
            </div>
            <div className="relative">
              <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-orange-500/20 blur-3xl" />
              <MiniDashboard intent={intent} />
              <div className="absolute -bottom-5 -right-2 hidden rounded-2xl border border-white/10 bg-[#101a27] p-4 shadow-2xl sm:block">
                <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"><MessageCircle className="h-5 w-5" /></div><div><div className="text-xs font-black">WhatsApp conectado</div><div className="mt-1 text-[10px] text-slate-400">Origem + histórico + próxima ação</div></div></div>
              </div>
            </div>
          </div>
        </section>

        <section id="desafios" className="px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-10 max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">O desafio é real</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{theme.primarySection}</h2><p className="mt-3 text-sm leading-6 text-slate-500">Menos perda de oportunidade, mais clareza sobre o que fazer hoje e mais conexão entre marketing, atendimento e receita.</p></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{theme.cards.map(({ title, text, icon: Icon }) => <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white"><Icon className="h-5 w-5" /></div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div>
          </div>
        </section>

        <section id="solucao" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-10 max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Tudo conectado</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Uma plataforma completa para o crescimento da sua academia</h2><p className="mt-3 text-sm leading-6 text-slate-500">Do primeiro contato à renovação, o VendorAI organiza contexto, automação, inteligência e acompanhamento.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{SOLUTION_CARDS.map(({ title, text, icon: Icon }) => <div key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-orange-600"><Icon className="h-4 w-4" /></div><h3 className="text-sm font-black">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p></div>)}</div>
            <div className="mt-8 grid items-center gap-6 lg:grid-cols-[1.45fr_.55fr]">
              <MiniDashboard intent={intent} />
              <div className="rounded-[28px] bg-orange-50 p-7 ring-1 ring-orange-100"><Zap className="h-7 w-7 text-orange-500"/><h3 className="mt-5 text-2xl font-black">Do primeiro contato à matrícula, tudo conectado.</h3><div className="mt-6 space-y-4 text-sm font-bold text-slate-700">{["Mais conversão", "Mais retenção", "Mais receita", "Mais previsibilidade"].map((item) => <div key={item} className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white"><Check className="h-3.5 w-3.5" /></span>{item}</div>)}</div></div>
            </div>
          </div>
        </section>

        <section id="jornada" className="px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-7xl"><div className="mb-10 text-center"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Da oportunidade ao resultado</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">A jornada do aluno no VendorAI</h2></div><div className="grid gap-3 md:grid-cols-6">{theme.journey.map((step, index) => <div key={step} className="relative rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm"><div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-600">{index + 1}</div><div className="text-sm font-black">{step}</div>{index < theme.journey.length - 1 && <span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-2xl text-orange-300 md:block">→</span>}</div>)}</div></div>
        </section>

        <section className="bg-[#07101b] px-4 py-16 text-white sm:px-6 sm:py-20">
          <div className="mx-auto max-w-7xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">{theme.metricLabel}</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Resultado visível para quem vende e para quem gere</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{theme.metrics.map((metric) => <div key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center"><div className="text-3xl font-black text-orange-400">{metric.value}</div><div className="mt-2 text-sm font-bold text-slate-300">{metric.label}</div></div>)}</div><div className="mt-8 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"><div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Antes</div><div className="mt-4 space-y-3 text-sm text-slate-300">{["Leads perdidos", "Follow-up manual", "Pouca clareza de resultado", "Alunos em risco invisíveis"].map((x) => <div key={x} className="flex gap-2"><span className="text-red-400">×</span>{x}</div>)}</div></div><div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-6"><div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-400">Com VendorAI</div><div className="mt-4 space-y-3 text-sm text-slate-200">{["Pipeline e prioridades", "Automação e IA", "Origem até matrícula", "Reativação e retenção"].map((x) => <div key={x} className="flex gap-2"><Check className="h-4 w-4 text-emerald-400" />{x}</div>)}</div></div></div></div>
        </section>

        <section id="faq" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-5xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Dúvidas?</p><h2 className="mt-3 text-3xl font-black">Perguntas frequentes</h2></div><div className="grid gap-3 md:grid-cols-2">{FAQ.map(([q,a]) => <details key={q} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-black"><span>{q}</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary><p className="mt-3 text-sm leading-6 text-slate-500">{a}</p></details>)}</div></div></section>

        <section className="relative overflow-hidden bg-[#07101b] px-4 py-14 text-white sm:px-6"><div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(249,115,22,.18),transparent_35%)]"/><div className="relative mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 lg:flex-row lg:items-center"><div><h2 className="text-3xl font-black sm:text-4xl">Sua academia pode ir mais longe.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Teste o VendorAI por 5 dias e veja na prática como aumentar matrículas, melhorar retenção e organizar a operação comercial.</p></div><div className="flex flex-col gap-3 sm:flex-row"><Cta /><Cta secondary /></div></div></section>
      </main>
    </div>
  );
}
