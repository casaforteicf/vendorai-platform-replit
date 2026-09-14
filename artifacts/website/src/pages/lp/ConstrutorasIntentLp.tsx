import { Link, useParams } from "wouter";
import { useEffect } from "react";
import { ArrowRight, Bot, CalendarCheck, Check, ChevronDown, HardHat, Home, Megaphone, MessageCircle, Radar, Search, Target, UserCheck, Workflow } from "lucide-react";

type Intent = "dor" | "marketing" | "crm";
type Theme = { badge:string; title:string; accent:string; subtitle:string; photo:string; photoAlt:string; visual:string; sectionTitle:string; cards:Array<{title:string;text:string;icon:typeof Target}>; flow:string[]; productModules:string[]; kpis:string[] };

const THEMES: Record<Intent, Theme> = {
  dor: {
    badge:"Dor / Descoberta",
    title:"Quantas obras sua construtora perde",
    accent:"antes mesmo do contrato?",
    subtitle:"Leads de alto valor podem esfriar entre o primeiro contato, a visita, o orçamento e a decisão. O VendorAI organiza prioridade, responsável, próxima ação e follow-up para cada oportunidade.",
    photo:"/lp-images/construtora-contexto-1.svg",
    photoAlt:"Cenário visual de uma construtora residencial acompanhado pelo VendorAI",
    visual:"/lp-images/construtoras-dor-vendorai.svg",
    sectionTitle:"Onde oportunidades de obra costumam escapar",
    cards:[
      {title:"Lead demora para receber retorno",text:"Quem pede informações sobre obra, projeto ou orçamento esfria quando não recebe resposta rápida.",icon:MessageCircle},
      {title:"Visita sem próxima ação",text:"Reuniões, visitas técnicas e apresentações acontecem, mas não viram um próximo passo claro.",icon:CalendarCheck},
      {title:"Orçamento sem follow-up",text:"Propostas de alto valor ficam abertas sem cadência, responsável e prazo bem definidos.",icon:UserCheck},
      {title:"Qualificação incompleta",text:"Tipo de obra, cidade, terreno, metragem, investimento e prazo ficam espalhados em conversas.",icon:Search},
      {title:"Lead antigo esquecido",text:"Clientes que adiaram a obra podem voltar, mas raramente recebem acompanhamento estruturado.",icon:Radar},
      {title:"Gestão vê tarde demais",text:"A direção enxerga contratos fechados, mas não onde as oportunidades estão travando antes disso.",icon:Workflow},
    ],
    flow:["Lead","Qualificação","Visita","Orçamento","Follow-up","Negociação","Contrato"],
    productModules:["WhatsApp + histórico","Próxima ação","Follow-up","Agendamento","Revenue Scout","Alertas comerciais"],
    kpis:["Tempo de resposta","Leads sem retorno","Visitas","Orçamentos abertos","Follow-up","Conversão em contrato"],
  },
  marketing: {
    badge:"Marketing / Crescimento",
    title:"Transforme interesse em construção",
    accent:"em visitas, orçamentos e contratos.",
    subtitle:"Conteúdo, Meta, Google, landing pages, Visitor Intelligence, WhatsApp e CRM conectados para acompanhar cada campanha até a oportunidade comercial.",
    photo:"/lp-images/construtora-contexto-2.svg",
    photoAlt:"Contexto visual de marketing e vendas para construtora residencial",
    visual:"/lp-images/construtoras-marketing-vendorai.svg",
    sectionTitle:"Marketing de construtora conectado ao comercial",
    cards:[
      {title:"Campanhas por tipo de obra",text:"Casa própria, alto padrão, turnkey, projeto + obra, financiamento, reforma ou região com mensagens próprias.",icon:Megaphone},
      {title:"Meta para descoberta",text:"Criativos visuais apresentam estilo, obra, diferenciais e conduzem para LP ou WhatsApp.",icon:Target},
      {title:"Google para intenção",text:"Capture quem já procura construtora, orçamento, construção residencial ou soluções específicas.",icon:Search},
      {title:"Visitor Intelligence",text:"Veja origem, páginas visitadas, campanha e sinais de intenção antes mesmo da conversa comercial.",icon:Radar},
      {title:"Landing Pages específicas",text:"Crie páginas por campanha, modelo de casa, região, proposta comercial ou público.",icon:Home},
      {title:"Atribuição até contrato",text:"Campanha, lead, visita, orçamento, negociação e contrato podem permanecer ligados na mesma jornada.",icon:Workflow},
    ],
    flow:["Conteúdo","Meta/Google","Landing Page","WhatsApp","Qualificação","Visita","Orçamento"],
    productModules:["Planejador de Marketing","Gerador de Conteúdo","Biblioteca de Mídia","Campanhas","Landing Pages","Visitor Intelligence","CRM"],
    kpis:["Origem do lead","Leads qualificados","Visitas","Orçamentos","Custo por oportunidade","Contratos por campanha"],
  },
  crm: {
    badge:"CRM / Alta intenção",
    title:"CRM com IA para",
    accent:"Construtoras Residenciais.",
    subtitle:"Organize leads, visitas, orçamentos, WhatsApp, responsáveis, próximas ações, agentes de IA e inteligência comercial em um único fluxo.",
    photo:"/lp-images/construtoras-crm-vendorai.svg",
    photoAlt:"Visual do CRM VendorAI aplicado a uma construtora residencial",
    visual:"/lp-images/construtoras-crm-vendorai.svg",
    sectionTitle:"Um CRM que entende o ciclo de venda de uma obra",
    cards:[
      {title:"Qualificação de obra",text:"Tipo de projeto, cidade, terreno, metragem, faixa de investimento, prazo e necessidade ficam estruturados.",icon:HardHat},
      {title:"Pipeline por etapa",text:"Lead, qualificação, visita, orçamento, negociação, contrato e pós-venda em uma única visão.",icon:Workflow},
      {title:"Responsável e prazo",text:"Cada oportunidade pode ter vendedor, próxima ação e prazo para reduzir esquecimentos.",icon:UserCheck},
      {title:"WhatsApp integrado",text:"Histórico, atendimento e oportunidade continuam conectados durante um ciclo comercial longo.",icon:MessageCircle},
      {title:"Agentes de IA",text:"SDR, Closer, Follow-up e Agendamento entram conforme a etapa e o contexto do lead.",icon:Bot},
      {title:"Revenue Scout",text:"Sinais de retomada, risco, oportunidade e janela ideal ajudam a priorizar leads e carteira.",icon:Radar},
    ],
    flow:["Lead","Qualificação","Visita","Orçamento","Negociação","Contrato","Pós-venda"],
    productModules:["CRM Hub","Omnichannel","SDR","Closer","Follow-up","Agendamento","Revenue Scout","Next Best Action"],
    kpis:["Pipeline por vendedor","Tempo por etapa","Visitas","Orçamentos","Follow-up","Conversão em contrato"],
  },
};

const FAQ = [
 ["Serve para construtora pequena e equipe comercial maior?","Sim. O fluxo pode ser adaptado por equipe, vendedor, cidade, tipo de obra, modelo comercial e processo de orçamento."],
 ["Consigo acompanhar orçamento que ainda não fechou?","Sim. A oportunidade pode manter responsável, etapa, histórico, prazo e próxima ação até a decisão."],
 ["O WhatsApp fica ligado ao CRM?","A proposta é manter atendimento, histórico e oportunidade conectados durante todo o ciclo comercial."],
 ["Consigo separar leads por tipo de obra?","Sim. É possível trabalhar contexto como região, modelo, terreno, investimento, metragem, prazo e interesse."],
 ["O marketing pode ser medido até o contrato?","Campanha, landing page, origem, lead, visita, orçamento e contrato podem permanecer rastreáveis na jornada."],
 ["Quais agentes são mais importantes?","SDR, Closer, Follow-up e Agendamento são os principais para este ciclo de venda."],
];

function CTA({secondary=false}:{secondary?:boolean}){return <a href={secondary?"/demo?vertical=construtora-residencial":"/demo?vertical=construtora-residencial&intent=trial-5-dias"} className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-black transition ${secondary?"border border-white/25 bg-white/5 text-white hover:bg-white/10":"bg-orange-500 text-white hover:bg-orange-600"}`}>{secondary?"Ver demonstração":"Testar 5 dias grátis"}<ArrowRight className="h-4 w-4"/></a>}

export default function ConstrutorasIntentLp(){
 const params=useParams<{intent:string}>();
 const intent=(["dor","marketing","crm"].includes(params.intent??"")?params.intent:"dor") as Intent;
 const theme=THEMES[intent];
 useEffect(()=>{document.title=`${theme.title} ${theme.accent} | VendorAI`;let meta=document.querySelector('meta[name="description"]');if(!meta){meta=document.createElement("meta");meta.setAttribute("name","description");document.head.appendChild(meta);}meta.setAttribute("content",theme.subtitle.slice(0,155));},[theme]);
 return <div className="min-h-screen bg-[#f7f7f5] text-slate-950">
  <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07101b]/95 text-white backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/" className="text-xl font-black">Vendor<span className="text-orange-500">AI</span></Link><nav className="hidden gap-6 text-xs font-bold text-slate-300 md:flex"><a href="#cenario">Cenário</a><a href="#funcoes">Funções</a><a href="#jornada">Jornada</a><a href="#faq">FAQ</a></nav><a href="/demo?vertical=construtora-residencial&intent=trial-5-dias" className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black">Testar 5 dias grátis</a></div></header>
  <main>
   <section className="relative overflow-hidden bg-[#07101b] text-white"><div className="relative mx-auto grid max-w-7xl lg:grid-cols-2"><div className="flex flex-col justify-center px-4 py-16 sm:px-6 sm:py-20 lg:pr-12"><span className="w-fit rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.18em] text-orange-300">{theme.badge}</span><p className="mt-5 text-xs font-black uppercase tracking-[.22em] text-orange-400">CONSTRUTORAS RESIDENCIAIS</p><h1 className="mt-4 text-5xl font-black leading-[.98] tracking-tight sm:text-6xl">{theme.title}<br/><span className="text-orange-500">{theme.accent}</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{theme.subtitle}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><CTA/><CTA secondary/></div></div><div className="relative min-h-[430px] overflow-hidden bg-white/[0.03] lg:min-h-[650px]"><img src={theme.photo} alt={theme.photoAlt} className="absolute inset-0 h-full w-full object-contain p-6 sm:p-10" loading="eager"/><div className="absolute inset-0 bg-gradient-to-r from-[#07101b]/30 via-transparent to-transparent"/></div></div></section>
   <section id="cenario" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mx-auto mb-10 max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Aplicação real no nicho</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">{theme.sectionTitle}</h2></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{theme.cards.map(({title,text,icon:Icon})=><div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white"><Icon className="h-5 w-5"/></div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div></section>
   <section id="funcoes" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[.9fr_1.1fr]"><div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">VendorAI aplicado ao objetivo desta página</p><h2 className="mt-3 text-3xl font-black">Funções certas para esta intenção.</h2><p className="mt-4 text-sm leading-6 text-slate-500">Cada versão destaca somente o conjunto do sistema que ajuda o visitante a avançar naquela decisão.</p><div className="mt-6 flex flex-wrap gap-2">{theme.productModules.map(item=><span key={item} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700">{item}</span>)}</div></div><div className="rounded-[30px] bg-[#07101b] p-3 shadow-2xl"><img src={theme.visual} alt={`Visual do VendorAI para ${theme.badge}`} className="w-full rounded-[22px]"/><p className="px-3 pb-2 pt-3 text-center text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">Exemplo visual da operação dentro do VendorAI</p></div></div></section>
   <section id="jornada" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Jornada comercial</p><h2 className="mt-3 text-3xl font-black">Do primeiro interesse ao contrato</h2></div><div className="grid gap-3 md:grid-cols-7">{theme.flow.map((step,index)=><div key={step} className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"><div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-600">{index+1}</div><div className="text-xs font-black">{step}</div></div>)}</div><div className="mt-10 rounded-[28px] bg-[#07101b] p-7 text-white"><p className="text-xs font-black uppercase tracking-[.18em] text-orange-400">Indicadores a acompanhar</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{theme.kpis.map(kpi=><div key={kpi} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4"><Check className="h-4 w-4 text-orange-400"/><span className="text-sm font-bold">{kpi}</span></div>)}</div></div></div></section>
   <section id="faq" className="border-t border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-4xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">FAQ</p><h2 className="mt-3 text-3xl font-black">Perguntas de uma construtora antes de mudar o processo comercial</h2></div><div className="space-y-3">{FAQ.map(([q,a])=><details key={q} className="group rounded-2xl border border-slate-200 bg-[#fafafa] p-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-black">{q}<ChevronDown className="h-4 w-4 text-orange-500 transition group-open:rotate-180"/></summary><p className="mt-3 text-sm leading-6 text-slate-500">{a}</p></details>)}</div></div></section>
   <section className="bg-orange-500 px-4 py-14 text-white sm:px-6"><div className="mx-auto flex max-w-5xl flex-col items-center text-center"><h2 className="text-3xl font-black sm:text-4xl">Transforme cada lead de obra em uma próxima ação clara.</h2><p className="mt-4 max-w-2xl text-sm text-orange-50">Teste o VendorAI com seu processo comercial e veja a jornada da construtora conectada do marketing ao contrato.</p><div className="mt-7"><a href="/demo?vertical=construtora-residencial&intent=trial-5-dias" className="inline-flex items-center gap-2 rounded-xl bg-[#07101b] px-6 py-3.5 text-sm font-black">Testar 5 dias grátis<ArrowRight className="h-4 w-4"/></a></div></div></section>
  </main>
 </div>
}
