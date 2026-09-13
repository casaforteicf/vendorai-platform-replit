import { Link, useParams } from "wouter";
import { useEffect } from "react";
import { ArrowRight, Bot, CalendarCheck, Check, ChevronDown, Droplets, Megaphone, MessageCircle, Radar, Search, Sparkles, Target, UserCheck, Waves, Workflow } from "lucide-react";

type Intent = "dor" | "marketing" | "crm";
type Theme = { badge:string; title:string; accent:string; subtitle:string; photo:string; photoAlt:string; visual:string; sectionTitle:string; cards:Array<{title:string;text:string;icon:typeof Target}>; flow:string[]; productModules:string[]; kpis:string[] };

const THEMES: Record<Intent, Theme> = {
 dor:{
  badge:"Dor / Descoberta", title:"Quantos projetos de piscina esfriam", accent:"depois da visita ou orçamento?",
  subtitle:"Visitas sem próxima ação, orçamentos esquecidos, clientes sazonais e oportunidades de manutenção ou upgrade não deveriam depender da memória da equipe.",
  photo:"https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1600&q=84", photoAlt:"Piscina residencial contemporânea",
  visual:"/lp-images/piscinas-dor-vendorai.svg", sectionTitle:"Onde vendas e recorrência costumam escapar",
  cards:[
   {title:"Orçamento sem follow-up",text:"Projetos de alto valor ficam sem sequência clara depois da proposta.",icon:MessageCircle},
   {title:"Visita sem prazo",text:"A visita técnica acontece, mas a próxima ação nem sempre fica definida.",icon:CalendarCheck},
   {title:"Cliente sazonal esquecido",text:"Quem pediu orçamento em outra estação pode voltar a comprar quando a janela muda.",icon:Radar},
   {title:"Pós-venda desconectado",text:"Venda concluída não vira automaticamente manutenção, acessórios ou indicação.",icon:Droplets},
   {title:"Upsell perdido",text:"Aquecimento, iluminação, automação, cascata e tratamento ficam fora da jornada comercial.",icon:Sparkles},
   {title:"Gestão sem visão do funil",text:"A direção vê vendas fechadas, mas não os vazamentos entre visita, orçamento e decisão.",icon:Workflow},
  ],
  flow:["Lead","Visita","Projeto","Orçamento","Follow-up","Fechamento","Pós-venda"],
  productModules:["WhatsApp + histórico","Próxima ação","Follow-up","Agenda de visita","Revenue Scout","Pós-venda"],
  kpis:["Visitas sem retorno","Orçamentos abertos","Tempo por etapa","Follow-ups vencidos","Reativações","Oportunidades de upsell"],
 },
 marketing:{
  badge:"Marketing / Crescimento", title:"Transforme desejo de lazer", accent:"em visitas e orçamentos.",
  subtitle:"Conteúdo, Meta, Google, landing pages, Visitor Intelligence, WhatsApp e CRM conectados para captar projetos de piscina, reforma, aquecimento e manutenção.",
  photo:"https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1600&q=84", photoAlt:"Área de lazer com piscina residencial",
  visual:"/lp-images/piscinas-marketing-vendorai.svg", sectionTitle:"Marketing para piscina conectado ao momento de compra",
  cards:[
   {title:"Campanhas sazonais",text:"Verão, reforma, aquecimento, manutenção e preparação da área de lazer podem ter campanhas próprias.",icon:Megaphone},
   {title:"Meta para inspiração",text:"Criativos visuais trabalham desejo, estilo e transformação do espaço.",icon:Target},
   {title:"Google para intenção",text:"Capture buscas por piscina, aquecimento, reforma, manutenção e orçamento na região.",icon:Search},
   {title:"Landing Pages específicas",text:"Separe piscina nova, reforma, aquecimento, acessórios e manutenção por intenção.",icon:Waves},
   {title:"Visitor Intelligence",text:"Origem, página e interesse ajudam a entender o que o visitante quer antes do contato.",icon:Radar},
   {title:"Atribuição até a venda",text:"Campanha, LP, WhatsApp, visita, orçamento e fechamento podem permanecer conectados.",icon:Workflow},
  ],
  flow:["Conteúdo","Meta/Google","Landing Page","WhatsApp","Visita","Orçamento","Venda"],
  productModules:["Planejador de Marketing","Gerador de Conteúdo","Biblioteca de Mídia","Campanhas","Landing Pages","Visitor Intelligence","CRM"],
  kpis:["Origem do lead","Visitas técnicas","Orçamentos","Conversão por campanha","Custo por oportunidade","Vendas"],
 },
 crm:{
  badge:"CRM / Alta intenção", title:"CRM com IA para", accent:"Piscinas e Lazer Residencial.",
  subtitle:"Organize clientes, visitas, projetos, dimensões, acabamentos, acessórios, orçamentos, instalação, WhatsApp, follow-up e pós-venda em um único fluxo.",
  photo:"https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=1600&q=84", photoAlt:"Piscina em residência moderna",
  visual:"/lp-images/piscinas-crm-vendorai.svg", sectionTitle:"Um CRM que acompanha a venda e a vida útil da piscina",
  cards:[
   {title:"Pipeline técnico-comercial",text:"Lead, visita, projeto, orçamento, negociação, instalação e pós-venda em etapas claras.",icon:Workflow},
   {title:"Contexto do projeto",text:"Tipo, dimensão, acabamento, cidade, obra, acessórios e prazo ligados à oportunidade.",icon:Waves},
   {title:"Agenda de visitas",text:"Visitas técnicas e retornos conectados ao responsável e próxima ação.",icon:CalendarCheck},
   {title:"WhatsApp integrado",text:"Histórico, arquivos e negociação continuam ligados ao cliente e ao negócio.",icon:MessageCircle},
   {title:"Agentes de IA",text:"SDR, Closer, Follow-up, Agendamento e Pós-venda entram conforme a etapa.",icon:Bot},
   {title:"Revenue Scout",text:"Detecta oportunidades de manutenção, reforma, aquecimento, acessórios e reativação.",icon:Radar},
  ],
  flow:["Lead","Qualificação","Visita","Projeto","Orçamento","Instalação","Pós-venda"],
  productModules:["CRM Hub","Omnichannel","SDR","Closer","Follow-up","Agendamento","Pós-venda","Revenue Scout"],
  kpis:["Pipeline por projeto","Tempo por etapa","Visitas","Orçamentos","Follow-up","Receita pós-venda"],
 }
};

const FAQ = [
 ["Serve para loja, instalador e empresa de piscinas?","Sim. O fluxo pode ser adaptado para venda, instalação, reforma, manutenção, aquecimento e acessórios."],
 ["Consigo acompanhar visita e orçamento?","Sim. Visita, responsável, prazo, orçamento e próxima ação podem permanecer ligados à oportunidade."],
 ["O pós-venda também entra no CRM?","Sim. Manutenção, reforma, acessórios, aquecimento e reativação podem continuar na jornada do cliente."],
 ["O WhatsApp fica ligado ao histórico?","A proposta é manter atendimento, arquivos, contexto e oportunidade conectados."],
 ["Consigo medir qual campanha gerou venda?","Origem, campanha, landing page, lead, visita, orçamento e fechamento podem permanecer rastreáveis."],
 ["Quais agentes de IA são mais úteis?","SDR, Closer, Follow-up, Agendamento e Pós-venda são os principais para esse nicho."],
];

function CTA({secondary=false}:{secondary?:boolean}){return <a href={secondary?"/demo?vertical=piscinas":"/demo?vertical=piscinas&intent=trial-5-dias"} className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-black transition ${secondary?"border border-white/25 bg-white/5 text-white hover:bg-white/10":"bg-orange-500 text-white hover:bg-orange-600"}`}>{secondary?"Ver demonstração":"Testar 5 dias grátis"}<ArrowRight className="h-4 w-4"/></a>}

export default function PiscinasIntentLp(){
 const params=useParams<{intent:string}>();
 const intent=(["dor","marketing","crm"].includes(params.intent??"")?params.intent:"dor") as Intent;
 const theme=THEMES[intent];
 useEffect(()=>{document.title=`${theme.title} ${theme.accent} | VendorAI`;let meta=document.querySelector('meta[name="description"]');if(!meta){meta=document.createElement("meta");meta.setAttribute("name","description");document.head.appendChild(meta);}meta.setAttribute("content",theme.subtitle.slice(0,155));},[theme]);
 return <div className="min-h-screen bg-[#f7f7f5] text-slate-950">
  <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07101b]/95 text-white backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/" className="text-xl font-black">Vendor<span className="text-orange-500">AI</span></Link><nav className="hidden gap-6 text-xs font-bold text-slate-300 md:flex"><a href="#cenario">Cenário</a><a href="#funcoes">Funções</a><a href="#jornada">Jornada</a><a href="#faq">FAQ</a></nav><a href="/demo?vertical=piscinas&intent=trial-5-dias" className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black">Testar 5 dias grátis</a></div></header>
  <main>
   <section className="relative overflow-hidden bg-[#07101b] text-white"><div className="relative mx-auto grid max-w-7xl lg:grid-cols-2"><div className="flex flex-col justify-center px-4 py-16 sm:px-6 sm:py-20 lg:pr-12"><span className="w-fit rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.18em] text-orange-300">{theme.badge}</span><p className="mt-5 text-xs font-black uppercase tracking-[.22em] text-orange-400">PISCINAS • LAZER • MANUTENÇÃO</p><h1 className="mt-4 text-5xl font-black leading-[.98] tracking-tight sm:text-6xl">{theme.title}<br/><span className="text-orange-500">{theme.accent}</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{theme.subtitle}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><CTA/><CTA secondary/></div></div><div className="relative min-h-[430px] overflow-hidden lg:min-h-[650px]"><img src={theme.photo} alt={theme.photoAlt} className="absolute inset-0 h-full w-full object-cover" loading="eager"/><div className="absolute inset-0 bg-gradient-to-r from-[#07101b]/45 via-transparent to-transparent"/><div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/15 bg-[#07101b]/80 p-4 backdrop-blur-md"><p className="text-xs font-black uppercase tracking-[.16em] text-orange-400">Jornada acompanhada</p><p className="mt-2 text-sm text-slate-200">Origem → visita → projeto → orçamento → instalação → pós-venda → reativação</p></div></div></div></section>
   <section id="cenario" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mx-auto mb-10 max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Aplicação real no nicho</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">{theme.sectionTitle}</h2></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{theme.cards.map(({title,text,icon:Icon})=><div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white"><Icon className="h-5 w-5"/></div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div></section>
   <section id="funcoes" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[.9fr_1.1fr]"><div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">VendorAI aplicado ao objetivo desta página</p><h2 className="mt-3 text-3xl font-black">Funções certas para esta intenção.</h2><p className="mt-4 text-sm leading-6 text-slate-500">Cada versão destaca o conjunto do sistema que ajuda naquele momento da jornada.</p><div className="mt-6 flex flex-wrap gap-2">{theme.productModules.map(item=><span key={item} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700">{item}</span>)}</div></div><div className="rounded-[30px] bg-[#07101b] p-3 shadow-2xl"><img src={theme.visual} alt={`Visual do VendorAI para ${theme.badge}`} className="w-full rounded-[22px]"/><p className="px-3 pb-2 pt-3 text-center text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">Exemplo visual da operação dentro do VendorAI</p></div></div></section>
   <section id="jornada" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Jornada comercial</p><h2 className="mt-3 text-3xl font-black">Da intenção ao pós-venda</h2></div><div className="grid gap-3 md:grid-cols-7">{theme.flow.map((step,index)=><div key={step} className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"><div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-600">{index+1}</div><div className="text-xs font-black">{step}</div></div>)}</div><div className="mt-10 grid gap-4 md:grid-cols-2"><div className="rounded-3xl bg-[#07101b] p-7 text-white"><p className="text-xs font-black uppercase tracking-[.18em] text-orange-400">Indicadores</p><div className="mt-5 grid grid-cols-2 gap-3">{theme.kpis.map(item=><div key={item} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-bold">{item}</div>)}</div></div><div className="rounded-3xl border border-slate-200 bg-white p-7"><p className="text-xs font-black uppercase tracking-[.18em] text-orange-600">O que muda</p><div className="mt-5 space-y-3">{["Responsável e prazo definidos","Histórico preservado","Próxima ação clara","Campanha ligada ao comercial","Pós-venda continua a jornada"].map(item=><div key={item} className="flex gap-3 text-sm"><Check className="h-5 w-5 text-orange-500"/><span>{item}</span></div>)}</div></div></div></div></section>
   <section id="faq" className="border-t border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-4xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">FAQ</p><h2 className="mt-3 text-3xl font-black">Dúvidas frequentes</h2></div><div className="space-y-3">{FAQ.map(([q,a])=><details key={q} className="group rounded-2xl border border-slate-200 bg-slate-50 p-5"><summary className="flex cursor-pointer list-none items-center justify-between font-black">{q}<ChevronDown className="h-5 w-5 transition group-open:rotate-180"/></summary><p className="mt-3 text-sm leading-6 text-slate-500">{a}</p></details>)}</div></div></section>
   <section className="bg-[#07101b] px-4 py-16 text-white sm:px-6"><div className="mx-auto max-w-4xl text-center"><h2 className="text-4xl font-black">Transforme cada projeto em uma jornada comercial completa.</h2><p className="mx-auto mt-4 max-w-2xl text-slate-300">Teste o VendorAI com a sua operação por 5 dias.</p><div className="mt-7 flex justify-center"><CTA/></div></div></section>
  </main>
 </div>;
}
