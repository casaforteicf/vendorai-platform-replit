import { Link, useParams } from "wouter";
import { useEffect } from "react";
import { ArrowRight, Bot, Building2, CalendarCheck, Check, ChevronDown, Home, MapPin, Megaphone, MessageCircle, Radar, Search, Target, UserCheck, Users, Workflow } from "lucide-react";

type Intent = "dor" | "marketing" | "crm";
type Theme = { badge:string; title:string; accent:string; subtitle:string; photo:string; photoAlt:string; visual:string; sectionTitle:string; cards:Array<{title:string;text:string;icon:typeof Target}>; flow:string[]; productModules:string[]; kpis:string[] };

const THEMES: Record<Intent, Theme> = {
  dor: {
    badge:"Dor / Descoberta",
    title:"Quantos compradores sua imobiliária perde",
    accent:"antes mesmo da visita?",
    subtitle:"Leads de portais, Meta, Google e WhatsApp podem esfriar entre o primeiro contato, a seleção de imóveis, a visita e a proposta. O VendorAI organiza sinais, prioridade e próxima ação.",
    photo:"https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1600&q=84",
    photoAlt:"Corretora apresentando imóvel a cliente",
    visual:"/lp-images/imobiliarias-dor-vendorai.svg",
    sectionTitle:"Onde oportunidades imobiliárias costumam se perder",
    cards:[
      {title:"Lead sem resposta rápida",text:"Contatos de portais, anúncios e WhatsApp esfriam quando ninguém assume a próxima ação.",icon:MessageCircle},
      {title:"Preferências sem contexto",text:"Faixa de preço, bairro, tipo, dormitórios, financiamento e urgência ficam espalhados em conversas.",icon:Search},
      {title:"Visita sem follow-up",text:"A visita acontece, mas o corretor não recebe um próximo passo claro para manter a oportunidade viva.",icon:CalendarCheck},
      {title:"Proposta parada",text:"Negociações importantes ficam sem alerta, responsável e prazo definidos.",icon:UserCheck},
      {title:"Leads antigos esquecidos",text:"A carteira histórica pode voltar a comprar, vender ou investir, mas raramente é trabalhada de forma contínua.",icon:Radar},
      {title:"Gestão sem visão da jornada",text:"A direção vê vendas fechadas, mas não enxerga com clareza onde cada oportunidade está vazando.",icon:Workflow},
    ],
    flow:["Lead","Qualificação","Seleção","Visita","Follow-up","Proposta","Venda"],
    productModules:["WhatsApp + histórico","Próxima ação","Agente de Follow-up","Agendamento","Revenue Scout","Alertas comerciais"],
    kpis:["Tempo de resposta","Leads sem retorno","Visitas sem follow-up","Propostas abertas","Reativações","Conversão por corretor"],
  },
  marketing: {
    badge:"Marketing / Crescimento",
    title:"Transforme anúncios de imóveis",
    accent:"em visitas e propostas.",
    subtitle:"Planejamento, criativos, Meta, Google, landing pages, Visitor Intelligence, WhatsApp e CRM conectados para acompanhar a campanha até a oportunidade comercial.",
    photo:"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=84",
    photoAlt:"Residência contemporânea usada em campanha imobiliária",
    visual:"/lp-images/imobiliarias-marketing-vendorai.svg",
    sectionTitle:"Marketing imobiliário conectado ao que acontece depois do clique",
    cards:[
      {title:"Campanhas por imóvel e região",text:"Trabalhe empreendimento, bairro, alto padrão, primeiro imóvel, investimento, aluguel ou lançamento com mensagens próprias.",icon:Megaphone},
      {title:"Meta para descoberta",text:"Criativos visuais atraem interesse e conduzem para LP ou WhatsApp com contexto preservado.",icon:Target},
      {title:"Google para intenção",text:"Capture quem já procura imóvel, bairro, empreendimento ou solução imobiliária específica.",icon:Search},
      {title:"Visitor Intelligence",text:"Veja origem, página visitada, campanha, interesse e sinais antes do contato comercial.",icon:Radar},
      {title:"Landing Pages específicas",text:"Crie páginas por imóvel, lançamento, região, público e intenção em vez de levar tudo para uma página genérica.",icon:Home},
      {title:"Atribuição até a venda",text:"Campanha, lead, WhatsApp, visita, proposta e fechamento podem permanecer ligados na mesma jornada.",icon:Workflow},
    ],
    flow:["Conteúdo","Meta/Google","Landing Page","WhatsApp","Qualificação","Visita","Proposta"],
    productModules:["Planejador de Marketing","Gerador de Conteúdo","Biblioteca de Mídia","Campanhas","Landing Pages","Visitor Intelligence","CRM"],
    kpis:["Origem do lead","Leads por imóvel","Visitas","Propostas","Conversão por campanha","Custo por oportunidade"],
  },
  crm: {
    badge:"CRM / Alta intenção",
    title:"CRM com IA para",
    accent:"Imobiliárias e Corretores.",
    subtitle:"Organize leads, imóveis, corretores, visitas, propostas, WhatsApp, follow-up e inteligência comercial em um único fluxo com contexto completo.",
    photo:"https://images.unsplash.com/photo-1560520653-9e0e4c89eb11?auto=format&fit=crop&w=1600&q=84",
    photoAlt:"Corretor atendendo cliente em operação imobiliária",
    visual:"/lp-images/imobiliarias-crm-vendorai.svg",
    sectionTitle:"Um CRM que entende a jornada imobiliária",
    cards:[
      {title:"Qualificação imobiliária",text:"Compra ou locação, região, tipo, faixa de preço, dormitórios, financiamento, timing e preferências ficam estruturados.",icon:Users},
      {title:"Matching com contexto",text:"O corretor recebe a oportunidade sabendo o que o cliente procura e quais imóveis fazem sentido.",icon:Building2},
      {title:"Pipeline por etapa",text:"Lead, seleção, contato, visita, proposta, negociação, documentação, fechamento e pós-venda.",icon:Workflow},
      {title:"WhatsApp integrado",text:"Histórico e atendimento continuam ligados ao lead e à oportunidade, sem perder contexto entre corretores.",icon:MessageCircle},
      {title:"Agentes de IA",text:"SDR, atendimento, closer, follow-up, agendamento e pós-venda atuam conforme a etapa da jornada.",icon:Bot},
      {title:"Revenue Scout",text:"Sinais de retomada, risco, oportunidade e janela ideal de contato ajudam a priorizar a carteira.",icon:Radar},
    ],
    flow:["Lead","Qualificação","Imóveis","Visita","Proposta","Negociação","Fechamento"],
    productModules:["CRM Hub","Omnichannel","SDR","Closer","Follow-up","Agendamento","Pós-venda","Revenue Scout"],
    kpis:["Pipeline por corretor","Tempo por etapa","Visitas","Propostas","Follow-up","Conversão por origem"],
  },
};

const FAQ = [
  ["Serve para imobiliárias e corretores autônomos?","Sim. O fluxo pode ser adaptado para imobiliária, equipe, corretor, unidade, região, lançamento ou carteira individual."],
  ["Consigo registrar o imóvel de interesse e as preferências?","Sim. A qualificação pode manter região, tipo, faixa de preço, dormitórios, financiamento, timing e outros critérios relevantes."],
  ["O WhatsApp fica ligado ao CRM?","A proposta é manter atendimento, histórico, responsável e oportunidade conectados para reduzir perda de contexto."],
  ["Consigo acompanhar visita e proposta?","Sim. Visitas, propostas, negociação, documentação e próxima ação podem fazer parte do pipeline."],
  ["O marketing fica ligado à venda?","Campanha, landing page, origem, lead, visita, proposta e fechamento podem permanecer rastreáveis na mesma jornada."],
  ["Quais agentes de IA são mais úteis?","SDR, Atendimento, Closer, Follow-up, Agendamento e Pós-venda são os principais para essa operação."],
];

function CTA({secondary=false}:{secondary?:boolean}){return <a href={secondary?"/demo?vertical=imobiliarias-corretores":"/demo?vertical=imobiliarias-corretores&intent=trial-5-dias"} className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-black transition ${secondary?"border border-white/25 bg-white/5 text-white hover:bg-white/10":"bg-orange-500 text-white hover:bg-orange-600"}`}>{secondary?"Ver demonstração":"Testar 5 dias grátis"}<ArrowRight className="h-4 w-4"/></a>}

export default function ImobiliariasIntentLp(){
 const params=useParams<{intent:string}>();
 const intent=(["dor","marketing","crm"].includes(params.intent??"")?params.intent:"dor") as Intent;
 const theme=THEMES[intent];
 useEffect(()=>{document.title=`${theme.title} ${theme.accent} | VendorAI`;let meta=document.querySelector('meta[name="description"]');if(!meta){meta=document.createElement("meta");meta.setAttribute("name","description");document.head.appendChild(meta);}meta.setAttribute("content",theme.subtitle.slice(0,155));},[theme]);
 return <div className="min-h-screen bg-[#f7f7f5] text-slate-950">
  <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07101b]/95 text-white backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/" className="text-xl font-black">Vendor<span className="text-orange-500">AI</span></Link><nav className="hidden gap-6 text-xs font-bold text-slate-300 md:flex"><a href="#cenario">Cenário</a><a href="#funcoes">Funções</a><a href="#jornada">Jornada</a><a href="#faq">FAQ</a></nav><a href="/demo?vertical=imobiliarias-corretores&intent=trial-5-dias" className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black">Testar 5 dias grátis</a></div></header>
  <main>
   <section className="relative overflow-hidden bg-[#07101b] text-white"><div className="relative mx-auto grid max-w-7xl lg:grid-cols-2"><div className="flex flex-col justify-center px-4 py-16 sm:px-6 sm:py-20 lg:pr-12"><span className="w-fit rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.18em] text-orange-300">{theme.badge}</span><p className="mt-5 text-xs font-black uppercase tracking-[.22em] text-orange-400">IMOBILIÁRIAS E CORRETORES</p><h1 className="mt-4 text-5xl font-black leading-[.98] tracking-tight sm:text-6xl">{theme.title}<br/><span className="text-orange-500">{theme.accent}</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{theme.subtitle}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><CTA/><CTA secondary/></div></div><div className="relative min-h-[430px] overflow-hidden lg:min-h-[650px]"><img src={theme.photo} alt={theme.photoAlt} className="absolute inset-0 h-full w-full object-cover" loading="eager"/><div className="absolute inset-0 bg-gradient-to-r from-[#07101b]/45 via-transparent to-transparent"/><div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/15 bg-[#07101b]/80 p-4 backdrop-blur-md"><p className="text-xs font-black uppercase tracking-[.16em] text-orange-400">Jornada acompanhada</p><p className="mt-2 text-sm text-slate-200">Origem → interesse → corretor → visita → proposta → próxima ação → fechamento</p></div></div></div></section>
   <section id="cenario" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mx-auto mb-10 max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Aplicação real no nicho</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">{theme.sectionTitle}</h2></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{theme.cards.map(({title,text,icon:Icon})=><div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white"><Icon className="h-5 w-5"/></div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div></section>
   <section id="funcoes" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[.9fr_1.1fr]"><div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">VendorAI aplicado ao objetivo desta página</p><h2 className="mt-3 text-3xl font-black">Funções certas para esta intenção.</h2><p className="mt-4 text-sm leading-6 text-slate-500">Cada versão destaca somente o conjunto do sistema que ajuda aquele visitante a tomar uma decisão.</p><div className="mt-6 flex flex-wrap gap-2">{theme.productModules.map(item=><span key={item} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700">{item}</span>)}</div></div><div className="rounded-[30px] bg-[#07101b] p-3 shadow-2xl"><img src={theme.visual} alt={`Visual do VendorAI para ${theme.badge}`} className="w-full rounded-[22px]"/><p className="px-3 pb-2 pt-3 text-center text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">Exemplo visual da operação dentro do VendorAI</p></div></div></section>
   <section id="jornada" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Jornada comercial</p><h2 className="mt-3 text-3xl font-black">Do primeiro interesse ao fechamento</h2></div><div className="grid gap-3 md:grid-cols-7">{theme.flow.map((step,index)=><div key={step} className="relative rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"><div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-600">{index+1}</div><div className="text-xs font-black">{step}</div>{index<theme.flow.length-1&&<span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-orange-300 md:block">→</span>}</div>)}</div><div className="mt-10 rounded-[28px] bg-[#07101b] p-7 text-white"><p className="text-xs font-black uppercase tracking-[.18em] text-orange-400">Indicadores a acompanhar</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{theme.kpis.map(kpi=><div key={kpi} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4"><Check className="h-4 w-4 text-orange-400"/><span className="text-sm font-bold">{kpi}</span></div>)}</div></div></div></section>
   <section id="faq" className="border-t border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-4xl"><h2 className="text-center text-3xl font-black">Perguntas frequentes</h2><div className="mt-8 space-y-3">{FAQ.map(([q,a])=><details key={q} className="group rounded-2xl border border-slate-200 bg-white p-5"><summary className="flex cursor-pointer list-none items-center justify-between font-black">{q}<ChevronDown className="h-4 w-4 transition group-open:rotate-180"/></summary><p className="mt-3 text-sm leading-6 text-slate-500">{a}</p></details>)}</div></div></section>
   <section className="bg-[#07101b] px-4 py-16 text-center text-white sm:px-6"><div className="mx-auto max-w-3xl"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-400">VendorAI para Imobiliárias e Corretores</p><h2 className="mt-3 text-4xl font-black">Conecte marketing, atendimento, corretores e vendas.</h2><p className="mt-4 text-slate-300">Teste o fluxo com sua própria operação.</p><div className="mt-7 flex justify-center"><CTA/></div></div></section>
  </main>
 </div>
}
