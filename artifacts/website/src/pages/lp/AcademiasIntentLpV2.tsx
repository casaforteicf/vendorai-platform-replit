import { Link, useParams } from "wouter";
import { useEffect } from "react";
import { ArrowRight, BarChart3, Bot, CalendarCheck, Check, ChevronDown, Dumbbell, Instagram, MessageCircle, Radar, Search, Sparkles, Target, UserCheck, Users } from "lucide-react";

type Intent = "dor" | "marketing" | "crm";

type Theme = {
  badge:string; eyebrow:string; title:string; accent:string; subtitle:string;
  heroImage:string; productImage:string; productAlt:string;
  sectionTitle:string; cards:Array<{title:string;text:string;icon:any}>;
  journey:string[]; metrics:Array<{value:string;label:string}>;
  imageCaption:string;
};

const THEMES: Record<Intent, Theme> = {
  dor:{
    badge:"Dor / Descoberta", eyebrow:"PARA ACADEMIAS E STUDIOS", title:"Mais alunos. Mais resultado.", accent:"Menos perda.",
    subtitle:"Capture mais leads, converta aulas experimentais em matrículas, reduza cancelamentos e reative alunos com IA e acompanhamento estruturado.",
    heroImage:"https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1600&q=82",
    productImage:"/lp/academias/vendorai-pipeline.svg", productAlt:"Pipeline de alunos do VendorAI para academias",
    sectionTitle:"Os vazamentos que reduzem suas matrículas",
    cards:[
      {title:"Leads frios",text:"Contatos interessados ficam sem retorno no momento certo.",icon:MessageCircle},
      {title:"Aula sem matrícula",text:"A pessoa faz a aula experimental e não recebe o próximo passo ideal.",icon:CalendarCheck},
      {title:"Alunos faltando",text:"A frequência cai antes do cancelamento, mas o sinal passa despercebido.",icon:UserCheck},
      {title:"Reativação esquecida",text:"Ex-alunos com potencial de retorno ficam parados na base.",icon:Radar},
      {title:"Follow-up sem padrão",text:"Cada atendente acompanha de um jeito e oportunidades se perdem.",icon:Target},
      {title:"Pouca clareza de resultado",text:"A gestão demora para descobrir onde a receita está escapando.",icon:BarChart3},
    ],
    journey:["Lead","Qualificação","Aula experimental","Follow-up","Matrícula","Retenção"],
    metrics:[{value:"+67%",label:"mais matrículas"},{value:"-38%",label:"menos cancelamentos"},{value:"+52%",label:"mais retenção"},{value:"3x",label:"mais eficiência no follow-up"}],
    imageCaption:"Do primeiro contato à matrícula, tudo conectado.",
  },
  marketing:{
    badge:"Marketing / Crescimento", eyebrow:"PARA ACADEMIAS E STUDIOS", title:"Atraia mais alunos com", accent:"marketing inteligente.",
    subtitle:"Planejamento, conteúdo, Meta, Google, landing pages, WhatsApp e CRM conectados para transformar campanha em aula experimental e matrícula.",
    heroImage:"https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1600&q=82",
    productImage:"/lp/academias/vendorai-marketing.svg", productAlt:"Painel de marketing e campanhas do VendorAI para academias",
    sectionTitle:"Campanhas que realmente funcionam",
    cards:[
      {title:"Meta Ads",text:"Descoberta, desejo, prova social e remarketing para públicos certos.",icon:Instagram},
      {title:"Google Ads",text:"Capture quem já procura academia, pilates, funcional ou personal.",icon:Search},
      {title:"Landing Pages",text:"Páginas específicas por modalidade, público, cidade e campanha.",icon:Target},
      {title:"Criativos com IA",text:"Posts, anúncios, vídeos e variações alinhados ao objetivo.",icon:Sparkles},
      {title:"WhatsApp conectado",text:"O lead chega com contexto de origem e continua a conversa sem perda.",icon:MessageCircle},
      {title:"Medição até matrícula",text:"Acompanhe campanha, lead, agendamento, aula e matrícula.",icon:BarChart3},
    ],
    journey:["Anúncio","Landing Page","Lead","WhatsApp","Aula experimental","Matrícula"],
    metrics:[{value:"+120%",label:"engajamento"},{value:"+68%",label:"geração de leads"},{value:"+54%",label:"matrículas"},{value:"-45%",label:"custo por lead"}],
    imageCaption:"Do anúncio à matrícula, o resultado fica mensurável.",
  },
  crm:{
    badge:"CRM / Alta intenção", eyebrow:"PARA ACADEMIAS E STUDIOS", title:"Gestão completa da sua academia", accent:"em um só lugar.",
    subtitle:"CRM, WhatsApp, agenda, follow-up, IA, reativação, relatórios e inteligência para organizar a operação comercial sem depender de planilhas e memória.",
    heroImage:"https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=1600&q=82",
    productImage:"/lp/academias/vendorai-crm.svg", productAlt:"Dashboard CRM do VendorAI para academias e studios",
    sectionTitle:"Tudo que sua academia precisa, em um só sistema",
    cards:[
      {title:"CRM de alunos",text:"Leads, alunos, aulas experimentais, matrículas e renovações.",icon:Users},
      {title:"WhatsApp integrado",text:"Atendimento, histórico, follow-up e próximos passos conectados.",icon:MessageCircle},
      {title:"Agenda inteligente",text:"Aulas, avaliações e compromissos com responsável e prazo.",icon:CalendarCheck},
      {title:"Agentes de IA",text:"Qualificação, follow-up, agendamento, reativação e pós-venda.",icon:Bot},
      {title:"Revenue Scout",text:"Encontre alunos em risco e oportunidades de receita escondidas.",icon:Radar},
      {title:"Visitor Intelligence",text:"Entenda origem, campanha e interesse antes do contato comercial.",icon:Search},
    ],
    journey:["Lead","Qualificação","Aula","Matrícula","Retenção","Renovação"],
    metrics:[{value:"-60%",label:"tempo de gestão"},{value:"+45%",label:"produtividade"},{value:"+52%",label:"retenção"},{value:"+70%",label:"visibilidade da operação"}],
    imageCaption:"Mais controle, menos operação manual e uma equipe mais produtiva.",
  },
};

const FAQ=[
  ["O VendorAI funciona para academia, studio e personal?","Sim. A jornada pode ser adaptada para academia, funcional, pilates, cross training, studios e operações com aulas recorrentes."],
  ["Consigo acompanhar aula experimental e matrícula?","Sim. Essas etapas podem ficar visíveis no pipeline com responsável, prazo e próxima ação."],
  ["Posso integrar meu WhatsApp?","Sim. O WhatsApp pode fazer parte da jornada comercial e do histórico do aluno."],
  ["A IA ajuda na reativação?","Sim. A base pode sinalizar inatividade, queda de frequência e oportunidades de reativação conforme as regras da empresa."],
  ["Consigo medir campanha até matrícula?","A jornada pode preservar origem, campanha, lead, agendamento, oportunidade e resultado."],
  ["Posso começar com meus dados atuais?","Sim. O onboarding pode partir de leads, usuários, serviços e integrações já disponíveis."],
];

function Cta({secondary=false}:{secondary?:boolean}){
  return <a href={secondary?"/demo?vertical=academias-studios":"/demo?vertical=academias-studios&intent=trial-5-dias"} className={secondary?"inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-black text-white hover:bg-white/10":"inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 text-sm font-black text-white shadow-[0_16px_45px_rgba(249,115,22,.32)] hover:bg-orange-600"}>{secondary?"Ver demonstração":"Testar 5 dias grátis"}<ArrowRight className="h-4 w-4"/></a>
}

export default function AcademiasIntentLpV2(){
  const params=useParams<{intent:string}>();
  const intent=((params.intent||"dor") as Intent);
  const theme=THEMES[intent]||THEMES.dor;
  useEffect(()=>{document.title=`${theme.title} ${theme.accent} | VendorAI`;let m=document.querySelector('meta[name="description"]');if(!m){m=document.createElement("meta");m.setAttribute("name","description");document.head.appendChild(m)}m.setAttribute("content",theme.subtitle.slice(0,155));},[theme]);
  return <div className="min-h-screen bg-[#f7f7f5] text-slate-950 antialiased">
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07101b]/95 text-white backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/" className="text-xl font-black">Vendor<span className="text-orange-500">AI</span></Link><nav className="hidden gap-6 text-xs font-bold text-slate-300 md:flex"><a href="#desafios">Desafios</a><a href="#solucao">Solução</a><a href="#jornada">Jornada</a><a href="#faq">FAQ</a></nav><a href="/demo?vertical=academias-studios&intent=trial-5-dias" className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black">Testar 5 dias grátis</a></div></header>
    <main>
      <section className="relative overflow-hidden bg-[#07101b] text-white"><div className="absolute inset-0"><img src={theme.heroImage} alt="Academia e treino" className="h-full w-full object-cover opacity-55" loading="eager"/><div className="absolute inset-0 bg-gradient-to-r from-[#07101b] via-[#07101b]/90 to-[#07101b]/25"/></div><div className="relative mx-auto grid min-h-[640px] max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.02fr_.98fr]"><div><div className="inline-flex items-center gap-2 rounded-full border border-orange-400/30 bg-black/25 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.18em] text-orange-300"><Dumbbell className="h-3.5 w-3.5"/>{theme.badge}</div><p className="mt-6 text-xs font-black tracking-[.22em] text-orange-400">{theme.eyebrow}</p><h1 className="mt-4 text-5xl font-black leading-[.96] tracking-tight sm:text-6xl lg:text-7xl">{theme.title}<br/><span className="text-orange-500">{theme.accent}</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">{theme.subtitle}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><Cta/><Cta secondary/></div><div className="mt-6 flex flex-wrap gap-4 text-[11px] font-semibold text-slate-300"><span>✓ Sem cartão de crédito</span><span>✓ Configuração rápida</span><span>✓ Suporte em português</span></div></div><div className="hidden lg:block"><img src={theme.productImage} alt={theme.productAlt} className="w-full rounded-[30px] border border-white/10 shadow-2xl"/></div></div></section>

      <section id="desafios" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mx-auto mb-10 max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">O desafio é real</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">{theme.sectionTitle}</h2></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{theme.cards.map(({title,text,icon:Icon})=><div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white"><Icon className="h-5 w-5"/></div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div></section>

      <section id="solucao" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.1fr_.9fr]"><div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Tudo conectado</p><h2 className="mt-3 text-3xl font-black sm:text-5xl">Como o Vendor<span className="text-orange-500">AI</span> ajuda sua academia</h2><p className="mt-4 max-w-2xl text-slate-500">Uma plataforma para atrair, converter, engajar e reter alunos com automação, IA e contexto comercial.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{theme.cards.slice(0,4).map(({title,text,icon:Icon})=><div key={title} className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200"><Icon className="h-5 w-5 text-orange-500"/><h3 className="mt-3 font-black">{title}</h3><p className="mt-2 text-sm text-slate-500">{text}</p></div>)}</div></div><div><img src={theme.productImage} alt={theme.productAlt} className="w-full rounded-[28px] border border-slate-200 shadow-2xl" loading="lazy"/><p className="mt-4 text-center text-sm font-bold text-slate-500">{theme.imageCaption}</p></div></div></section>

      <section id="jornada" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mb-10 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Da oportunidade ao resultado</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">A jornada conectada no VendorAI</h2></div><div className="grid gap-3 md:grid-cols-6">{theme.journey.map((step,i)=><div key={step} className="relative rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm"><div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-600">{i+1}</div><div className="text-sm font-black">{step}</div>{i<theme.journey.length-1&&<span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-2xl text-orange-300 md:block">→</span>}</div>)}</div></div></section>

      <section className="bg-[#07101b] px-4 py-16 text-white sm:px-6"><div className="mx-auto max-w-7xl"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{theme.metrics.map(m=><div key={m.label} className="rounded-2xl border border-white/10 bg-white/[.04] p-6 text-center"><div className="text-3xl font-black text-orange-400">{m.value}</div><div className="mt-2 text-sm font-bold text-slate-300">{m.label}</div></div>)}</div><div className="mt-8 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-red-400/15 bg-red-400/[.04] p-6"><div className="text-xs font-black uppercase tracking-[.16em] text-red-300">Antes</div><div className="mt-4 space-y-3 text-sm text-slate-300">{["Leads perdidos no WhatsApp","Sem controle da aula experimental","Pouco acompanhamento","Resultados difíceis de medir"].map(x=><div key={x}>× {x}</div>)}</div></div><div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.06] p-6"><div className="text-xs font-black uppercase tracking-[.16em] text-emerald-400">Com VendorAI</div><div className="mt-4 space-y-3 text-sm text-slate-200">{["Pipeline e prioridades","Follow-up com IA","Origem até matrícula","Reativação e retenção"].map(x=><div key={x} className="flex gap-2"><Check className="h-4 w-4 text-emerald-400"/>{x}</div>)}</div></div></div></div></section>

      <section id="faq" className="px-4 py-16 sm:px-6"><div className="mx-auto max-w-5xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Dúvidas?</p><h2 className="mt-3 text-3xl font-black">Perguntas frequentes</h2></div><div className="grid gap-3 md:grid-cols-2">{FAQ.map(([q,a])=><details key={q} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-black"><span>{q}</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180"/></summary><p className="mt-3 text-sm leading-6 text-slate-500">{a}</p></details>)}</div></div></section>

      <section className="bg-orange-500 px-4 py-14 text-white sm:px-6"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 lg:flex-row lg:items-center"><div><h2 className="text-3xl font-black sm:text-4xl">Sua academia pode ir mais longe.</h2><p className="mt-2 max-w-2xl text-sm text-orange-50">Teste por 5 dias e veja na prática como organizar leads, matrículas, retenção e crescimento.</p></div><div className="flex flex-col gap-3 sm:flex-row"><a href="/demo?vertical=academias-studios&intent=trial-5-dias" className="rounded-xl bg-white px-6 py-3.5 text-sm font-black text-orange-600">Testar 5 dias grátis</a><a href="/demo?vertical=academias-studios" className="rounded-xl border border-white/40 px-6 py-3.5 text-sm font-black">Ver demonstração</a></div></div></section>
    </main>
  </div>
}
