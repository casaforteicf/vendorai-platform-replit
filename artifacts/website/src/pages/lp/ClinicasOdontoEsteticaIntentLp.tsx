import { Link, useParams } from "wouter";
import { useEffect } from "react";
import { ArrowRight, Bot, CalendarCheck, Check, ChevronDown, HeartPulse, Megaphone, MessageCircle, Radar, Search, Sparkles, Target, UserCheck, Users, Workflow } from "lucide-react";

type Intent = "dor" | "marketing" | "crm";

type Theme = {
  badge: string;
  title: string;
  accent: string;
  subtitle: string;
  visual: string;
  sectionTitle: string;
  cards: Array<{ title: string; text: string; icon: typeof Target }>;
  flow: string[];
  productModules: string[];
  kpis: string[];
};

const THEMES: Record<Intent, Theme> = {
  dor: {
    badge: "Dor / Descoberta",
    title: "Sua clínica pode estar perdendo pacientes",
    accent: "antes e depois da avaliação.",
    subtitle: "No-show, orçamento sem retorno, agenda ociosa, paciente que some e oportunidade de reativação não deveriam depender da memória da equipe.",
    visual: "/lp-images/clinicas-dor-vendorai.svg",
    sectionTitle: "Onde a receita costuma escapar",
    cards: [
      { title: "No-show e cancelamentos", text: "A consulta some da agenda, mas não vira uma sequência inteligente de recuperação.", icon: CalendarCheck },
      { title: "Orçamento sem follow-up", text: "Avaliação feita e proposta enviada, mas ninguém sabe qual é a próxima ação ideal.", icon: MessageCircle },
      { title: "Lead esquecido no WhatsApp", text: "Contatos de campanhas e indicações esfriam sem responsável, prazo e contexto.", icon: UserCheck },
      { title: "Agenda com horários ociosos", text: "A clínica percebe a ociosidade, mas não conecta isso automaticamente à base que pode voltar.", icon: CalendarCheck },
      { title: "Paciente sem retorno", text: "Recorrência, manutenção e continuidade do tratamento ficam sem acompanhamento estruturado.", icon: HeartPulse },
      { title: "Oportunidades escondidas", text: "A base contém sinais de reativação, cross-sell e risco que podem virar ação comercial.", icon: Radar },
    ],
    flow: ["Lead", "Avaliação", "Orçamento", "Follow-up", "Procedimento", "Retorno", "Reativação"],
    productModules: ["WhatsApp + histórico", "Agenda e próxima ação", "Agente de Follow-up", "Agente de Agendamento", "Revenue Scout", "Alertas de oportunidade"],
    kpis: ["no-show", "tempo sem retorno", "orçamentos abertos", "agenda ociosa", "reativações", "pacientes em risco"],
  },
  marketing: {
    badge: "Marketing / Crescimento",
    title: "Transforme campanhas em avaliações",
    accent: "e avaliações em tratamentos.",
    subtitle: "Conteúdo, Meta, Google, landing pages, Visitor Intelligence, WhatsApp e CRM conectados para acompanhar cada campanha até o resultado comercial.",
    visual: "/lp-images/clinicas-marketing-vendorai.svg",
    sectionTitle: "Marketing conectado ao que acontece na clínica",
    cards: [
      { title: "Campanhas por procedimento", text: "Implantes, estética, ortodontia, harmonização, depilação, laser e outros serviços podem ter jornadas próprias.", icon: Megaphone },
      { title: "Landing Pages específicas", text: "Uma página para cada intenção, procedimento, região, campanha ou oferta relevante.", icon: Target },
      { title: "Visitor Intelligence", text: "Entenda origem, página visitada, campanha e sinal de intenção antes mesmo do contato comercial.", icon: Search },
      { title: "Criativos e conteúdo", text: "Planejamento, peças, roteiros e variações orientadas pelo objetivo da campanha.", icon: Sparkles },
      { title: "WhatsApp com contexto", text: "O lead chega mantendo origem e contexto para continuar a conversa sem perder rastreabilidade.", icon: MessageCircle },
      { title: "Atribuição até fechamento", text: "Acompanhe campanha, lead, avaliação, orçamento e fechamento na mesma jornada.", icon: Workflow },
    ],
    flow: ["Conteúdo", "Meta/Google", "Landing Page", "WhatsApp", "Avaliação", "Orçamento", "Fechamento"],
    productModules: ["Planejador de Marketing", "Gerador de Conteúdo", "Biblioteca de Mídia", "Campanhas", "Landing Pages", "Visitor Intelligence", "CRM"],
    kpis: ["origem do lead", "custo por lead", "avaliações", "orçamentos", "fechamentos", "conversão por campanha"],
  },
  crm: {
    badge: "CRM / Alta intenção",
    title: "CRM com IA para Clínicas",
    accent: "Odontológicas e Estéticas.",
    subtitle: "Pipeline, WhatsApp, agenda, responsáveis, próximas ações, agentes de IA, Revenue Scout e inteligência comercial em um único fluxo.",
    visual: "/lp-images/clinicas-crm-vendorai.svg",
    sectionTitle: "Um CRM que entende a jornada do paciente",
    cards: [
      { title: "Pipeline por procedimento", text: "Lead, avaliação, orçamento, follow-up, procedimento, retorno e reativação com contexto completo.", icon: Users },
      { title: "Responsável e prazo", text: "Cada oportunidade pode ter responsável, próxima ação e prazo definidos para evitar contatos esquecidos.", icon: UserCheck },
      { title: "WhatsApp integrado", text: "Atendimento e histórico comercial ficam conectados ao paciente e à oportunidade.", icon: MessageCircle },
      { title: "Agentes de IA", text: "SDR, atendimento, closer, follow-up, agendamento e pós-venda entram conforme a etapa da jornada.", icon: Bot },
      { title: "Revenue Scout", text: "Sinais de oportunidade, risco, expansão, janela ideal de contato e priorização da carteira.", icon: Radar },
      { title: "Agenda inteligente", text: "Consultas e retornos podem ficar ligados ao CRM, responsável e próxima ação comercial.", icon: CalendarCheck },
    ],
    flow: ["Lead", "Qualificação", "Avaliação", "Orçamento", "Negociação", "Procedimento", "Pós-venda"],
    productModules: ["CRM Hub", "Omnichannel", "SDR", "Closer", "Follow-up", "Agendamento", "Pós-venda", "Revenue Scout"],
    kpis: ["pipeline por procedimento", "tempo por etapa", "taxa de follow-up", "agendamentos", "fechamentos", "reativação"],
  },
};

const FAQ = [
  ["Serve para clínica odontológica e estética?", "Sim. A jornada pode ser adaptada por procedimento, unidade, profissional, campanha e etapa comercial."],
  ["Consigo acompanhar orçamento que ainda não fechou?", "Sim. O orçamento pode continuar vinculado ao paciente, responsável, prazo e próxima ação."],
  ["A agenda conversa com o CRM?", "A proposta é manter agenda, atendimento e oportunidade conectados para reduzir perda de contexto entre consulta e comercial."],
  ["O Revenue Scout pode ajudar na reativação?", "Sim. O módulo trabalha com sinais e oportunidades para priorizar contatos e ações sobre a base."],
  ["Consigo medir marketing até o fechamento?", "A jornada pode preservar origem, campanha, landing page, lead, avaliação, orçamento e resultado comercial."],
  ["Quais agentes de IA entram nesse nicho?", "SDR, Atendimento, Closer, Follow-up, Agendamento e Pós-venda são os principais agentes a explorar nessa operação."],
];

function CTA({ secondary = false }: { secondary?: boolean }) {
  return <a href={secondary ? "/demo?vertical=clinicas-odontologicas-esteticas" : "/demo?vertical=clinicas-odontologicas-esteticas&intent=trial-5-dias"} className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-black transition ${secondary ? "border border-white/25 bg-white/5 text-white hover:bg-white/10" : "bg-orange-500 text-white hover:bg-orange-600"}`}>{secondary ? "Ver demonstração" : "Testar 5 dias grátis"}<ArrowRight className="h-4 w-4"/></a>;
}

export default function ClinicasOdontoEsteticaIntentLp() {
  const params = useParams<{ intent: string }>();
  const intent = (["dor", "marketing", "crm"].includes(params.intent ?? "") ? params.intent : "dor") as Intent;
  const theme = THEMES[intent];

  useEffect(() => {
    document.title = `${theme.title} ${theme.accent} | VendorAI`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) { meta = document.createElement("meta"); meta.setAttribute("name", "description"); document.head.appendChild(meta); }
    meta.setAttribute("content", theme.subtitle.slice(0, 155));
  }, [theme]);

  return <div className="min-h-screen bg-[#f7f7f5] text-slate-950">
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07101b]/95 text-white backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/" className="text-xl font-black">Vendor<span className="text-orange-500">AI</span></Link><nav className="hidden gap-6 text-xs font-bold text-slate-300 md:flex"><a href="#problemas">Cenário</a><a href="#funcoes">Funções</a><a href="#jornada">Jornada</a><a href="#faq">FAQ</a></nav><a href="/demo?vertical=clinicas-odontologicas-esteticas&intent=trial-5-dias" className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black">Testar 5 dias grátis</a></div></header>

    <main>
      <section className="relative overflow-hidden bg-[#07101b] px-4 py-16 text-white sm:px-6 sm:py-20"><div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_15%,rgba(249,115,22,.20),transparent_32%)]"/><div className="relative mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1fr_1fr]"><div><span className="inline-flex rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.18em] text-orange-300">{theme.badge}</span><p className="mt-5 text-xs font-black uppercase tracking-[.22em] text-orange-400">CLÍNICAS ODONTOLÓGICAS E ESTÉTICAS</p><h1 className="mt-4 text-5xl font-black leading-[.98] tracking-tight sm:text-6xl">{theme.title}<br/><span className="text-orange-500">{theme.accent}</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{theme.subtitle}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><CTA/><CTA secondary/></div></div><div className="space-y-4"><img src="/lp-images/clinicas-contexto.svg" alt="Clínica conectada ao VendorAI" className="w-full rounded-[28px] border border-white/10 shadow-2xl"/><img src={theme.visual} alt={`VendorAI para ${theme.badge}`} className="w-full rounded-[28px] border border-white/10 shadow-2xl"/></div></div></section>

      <section id="problemas" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mx-auto mb-10 max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Aplicação real no nicho</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">{theme.sectionTitle}</h2></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{theme.cards.map(({title,text,icon:Icon}) => <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white"><Icon className="h-5 w-5"/></div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div></section>

      <section id="funcoes" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.9fr_1.1fr]"><div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Funções do VendorAI exploradas nesta LP</p><h2 className="mt-3 text-3xl font-black">Não mostramos tudo. Mostramos o que vende esta intenção.</h2><p className="mt-4 text-sm leading-6 text-slate-500">Cada LP usa um conjunto diferente do sistema para manter a mensagem específica e convincente.</p><div className="mt-6 flex flex-wrap gap-2">{theme.productModules.map(item => <span key={item} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700">{item}</span>)}</div></div><img src={theme.visual} alt="Tela funcional ilustrativa do VendorAI" className="w-full rounded-[28px] border border-slate-200 shadow-xl"/></div></section>

      <section id="jornada" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Jornada operacional</p><h2 className="mt-3 text-3xl font-black">Do primeiro sinal à próxima oportunidade</h2></div><div className={`grid gap-3 ${theme.flow.length === 7 ? "md:grid-cols-7" : "md:grid-cols-6"}`}>{theme.flow.map((step,index)=><div key={step} className="relative rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"><div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-600">{index+1}</div><div className="text-xs font-black">{step}</div>{index < theme.flow.length-1 && <span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-orange-300 md:block">→</span>}</div>)}</div><div className="mt-10 rounded-[28px] bg-[#07101b] p-7 text-white"><p className="text-xs font-black uppercase tracking-[.18em] text-orange-400">Indicadores que esta LP deve vender</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{theme.kpis.map(kpi=><div key={kpi} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] p-4 text-sm font-bold"><Check className="h-4 w-4 text-orange-400"/>{kpi}</div>)}</div></div></div></section>

      <section id="faq" className="bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-5xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">FAQ específico</p><h2 className="mt-3 text-3xl font-black">Perguntas frequentes</h2></div><div className="grid gap-3 md:grid-cols-2">{FAQ.map(([q,a])=><details key={q} className="group rounded-2xl border border-slate-200 bg-slate-50 p-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-black"><span>{q}</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180"/></summary><p className="mt-3 text-sm leading-6 text-slate-500">{a}</p></details>)}</div></div></section>

      <section className="bg-[#07101b] px-4 py-14 text-white sm:px-6"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 lg:flex-row lg:items-center"><div><h2 className="text-3xl font-black">Transforme sinais em próxima ação.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Use marketing, atendimento, CRM e IA no mesmo fluxo para reduzir perdas e aumentar previsibilidade.</p></div><div className="flex flex-col gap-3 sm:flex-row"><CTA/><CTA secondary/></div></div></section>
    </main>
  </div>;
}
