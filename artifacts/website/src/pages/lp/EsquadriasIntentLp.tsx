import { Link, useParams } from "wouter";
import { useEffect } from "react";
import { ArrowRight, Bot, CalendarCheck, Check, ChevronDown, DraftingCompass, HardHat, Megaphone, MessageCircle, Radar, Ruler, Search, Target, UserCheck, Workflow } from "lucide-react";

type Intent = "dor" | "marketing" | "crm";
type Theme = { badge:string; title:string; accent:string; subtitle:string; photo:string; photoAlt:string; visual:string; sectionTitle:string; cards:Array<{title:string;text:string;icon:typeof Target}>; flow:string[]; productModules:string[]; kpis:string[] };

const THEMES: Record<Intent, Theme> = {
  dor: {
    badge:"Dor / Descoberta",
    title:"Quantos projetos de esquadrias esfriam",
    accent:"depois do orçamento?",
    subtitle:"Leads de alto valor podem se perder entre projeto, medição, orçamento, aprovação e obra. O VendorAI organiza responsável, prazo, contexto e próxima ação para cada oportunidade.",
    photo:"/lp-images/esquadrias-contexto-1.svg",
    photoAlt:"Contexto visual de uma venda técnica de esquadrias acompanhada pelo VendorAI",
    visual:"/lp-images/esquadrias-dor-vendorai.svg",
    sectionTitle:"Onde vendas de esquadrias costumam se perder",
    cards:[
      {title:"Orçamento sem retorno",text:"Propostas de alto valor ficam dias sem contato porque o follow-up depende da memória da equipe.",icon:MessageCircle},
      {title:"Medição sem próxima ação",text:"Visita técnica acontece, mas nem sempre gera prazo, responsável e sequência comercial clara.",icon:Ruler},
      {title:"Projeto sem contexto",text:"Cliente, arquiteto, construtora, obra, linha, acabamento e etapa ficam espalhados em conversas e arquivos.",icon:DraftingCompass},
      {title:"Lead quente tratado como comum",text:"Projetos avançados e obras próximas da compra competem com contatos frios na mesma fila.",icon:Radar},
      {title:"Parceiros pouco acompanhados",text:"Arquitetos, construtoras e especificadores geram oportunidades recorrentes, mas raramente têm cadência própria.",icon:HardHat},
      {title:"Gestão vê tarde demais",text:"A direção descobre a perda depois que o cliente fechou com outro fornecedor.",icon:Workflow},
    ],
    flow:["Lead","Projeto","Medição","Orçamento","Follow-up","Negociação","Fechamento"],
    productModules:["WhatsApp + histórico","Próxima ação","Follow-up","Agenda de medição","Revenue Scout","Alertas comerciais"],
    kpis:["Orçamentos sem retorno","Tempo por etapa","Medições pendentes","Projetos quentes","Follow-ups vencidos","Conversão por parceiro"],
  },
  marketing: {
    badge:"Marketing / Crescimento",
    title:"Transforme arquitetura e intenção de obra",
    accent:"em projetos para orçar.",
    subtitle:"Planejamento, conteúdo, Meta, Google, landing pages, Visitor Intelligence, WhatsApp e CRM conectados para captar clientes, arquitetos e construtoras com contexto comercial.",
    photo:"/lp-images/esquadrias-contexto-2.svg",
    photoAlt:"Contexto visual de marketing para esquadrias, portas e janelas",
    visual:"/lp-images/esquadrias-marketing-vendorai.svg",
    sectionTitle:"Marketing de esquadrias conectado à obra real",
    cards:[
      {title:"Campanhas por aplicação",text:"Alto padrão, eficiência térmica, acústica, grandes vãos, retrofit, construção nova e linhas específicas podem ter jornadas próprias.",icon:Megaphone},
      {title:"Meta para inspiração",text:"Criativos de arquitetura e aplicação atraem quem ainda está definindo soluções para a obra.",icon:Target},
      {title:"Google para intenção",text:"Capture buscas por esquadrias de PVC, alumínio, portas, janelas, isolamento, orçamento e fornecedores.",icon:Search},
      {title:"Campanhas para especificadores",text:"Arquitetos, construtoras e profissionais podem receber conteúdo e ofertas próprias por região e perfil.",icon:DraftingCompass},
      {title:"Visitor Intelligence",text:"Origem, página, campanha e sinais de intenção ajudam a entender qual solução despertou interesse.",icon:Radar},
      {title:"Atribuição até o orçamento",text:"Campanha, LP, WhatsApp, projeto, medição e orçamento podem permanecer conectados na mesma jornada.",icon:Workflow},
    ],
    flow:["Conteúdo","Meta/Google","Landing Page","WhatsApp","Projeto","Medição","Orçamento"],
    productModules:["Planejador de Marketing","Gerador de Conteúdo","Biblioteca de Mídia","Campanhas","Landing Pages","Visitor Intelligence","CRM"],
    kpis:["Origem do lead","Projetos por campanha","Medições","Orçamentos","Conversão por parceiro","Custo por oportunidade"],
  },
  crm: {
    badge:"CRM / Alta intenção",
    title:"CRM com IA para",
    accent:"Esquadrias, Portas e Janelas.",
    subtitle:"Organize clientes, obras, arquitetos, construtoras, medições, orçamentos, WhatsApp, follow-up e inteligência comercial em um único fluxo.",
    photo:"/lp-images/esquadrias-crm-vendorai.svg",
    photoAlt:"Visual do CRM VendorAI aplicado à operação de esquadrias",
    visual:"/lp-images/esquadrias-crm-vendorai.svg",
    sectionTitle:"Um CRM que entende a venda técnica de esquadrias",
    cards:[
      {title:"Pipeline técnico-comercial",text:"Lead, projeto, medição, orçamento, aprovação, produção, instalação e pós-venda podem seguir uma jornada estruturada.",icon:Workflow},
      {title:"Contexto da obra",text:"Tipo de obra, cidade, cliente, arquiteto, construtora, linha, acabamento e etapa ficam ligados à oportunidade.",icon:HardHat},
      {title:"Agenda de visitas e medições",text:"Compromissos podem ficar ligados ao responsável, oportunidade e próxima ação.",icon:CalendarCheck},
      {title:"WhatsApp integrado",text:"Atendimento, arquivos, histórico e negociação permanecem conectados ao negócio.",icon:MessageCircle},
      {title:"Agentes de IA",text:"SDR, Closer, Follow-up, Agendamento e Pós-venda entram conforme a etapa comercial.",icon:Bot},
      {title:"Revenue Scout",text:"Sinais de prioridade, risco, retomada e melhor momento de contato ajudam a trabalhar a carteira.",icon:Radar},
    ],
    flow:["Lead","Qualificação","Projeto","Medição","Orçamento","Negociação","Fechamento"],
    productModules:["CRM Hub","Omnichannel","SDR","Closer","Follow-up","Agendamento","Pós-venda","Revenue Scout"],
    kpis:["Pipeline por obra","Tempo por etapa","Medições","Orçamentos","Follow-up","Conversão por origem"],
  },
};

const FAQ = [
  ["Serve para empresas de PVC e alumínio?","Sim. O fluxo pode ser adaptado por material, linha, aplicação, região, unidade, vendedor e perfil de obra."],
  ["Consigo acompanhar medição e orçamento?","Sim. Medição, orçamento, responsável, prazo e próxima ação podem permanecer vinculados à oportunidade."],
  ["Posso relacionar arquitetos e construtoras?","Sim. Parceiros, especificadores e empresas envolvidas podem fazer parte do contexto comercial da oportunidade."],
  ["O WhatsApp fica ligado ao CRM?","A proposta é manter atendimento, histórico e oportunidade conectados para reduzir perda de contexto."],
  ["Consigo medir qual campanha gerou orçamento?","Origem, campanha, landing page, lead, projeto, medição e orçamento podem permanecer rastreáveis na mesma jornada."],
  ["Quais agentes de IA são mais úteis?","SDR, Closer, Follow-up, Agendamento e Pós-venda são os principais para vendas técnicas de ciclo mais longo."],
];

function CTA({secondary=false}:{secondary?:boolean}){return <a href={secondary?"/demo?vertical=esquadrias-portas-janelas":"/demo?vertical=esquadrias-portas-janelas&intent=trial-5-dias"} className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-black transition ${secondary?"border border-white/25 bg-white/5 text-white hover:bg-white/10":"bg-orange-500 text-white hover:bg-orange-600"}`}>{secondary?"Ver demonstração":"Testar 5 dias grátis"}<ArrowRight className="h-4 w-4"/></a>}

export default function EsquadriasIntentLp(){
 const params=useParams<{intent:string}>();
 const intent=(["dor","marketing","crm"].includes(params.intent??"")?params.intent:"dor") as Intent;
 const theme=THEMES[intent];
 useEffect(()=>{document.title=`${theme.title} ${theme.accent} | VendorAI`;let meta=document.querySelector('meta[name="description"]');if(!meta){meta=document.createElement("meta");meta.setAttribute("name","description");document.head.appendChild(meta);}meta.setAttribute("content",theme.subtitle.slice(0,155));},[theme]);
 return <div className="min-h-screen bg-[#f7f7f5] text-slate-950">
  <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07101b]/95 text-white backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/" className="text-xl font-black">Vendor<span className="text-orange-500">AI</span></Link><nav className="hidden gap-6 text-xs font-bold text-slate-300 md:flex"><a href="#cenario">Cenário</a><a href="#funcoes">Funções</a><a href="#jornada">Jornada</a><a href="#faq">FAQ</a></nav><a href="/demo?vertical=esquadrias-portas-janelas&intent=trial-5-dias" className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black">Testar 5 dias grátis</a></div></header>
  <main>
   <section className="relative overflow-hidden bg-[#07101b] text-white"><div className="relative mx-auto grid max-w-7xl lg:grid-cols-2"><div className="flex flex-col justify-center px-4 py-16 sm:px-6 sm:py-20 lg:pr-12"><span className="w-fit rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.18em] text-orange-300">{theme.badge}</span><p className="mt-5 text-xs font-black uppercase tracking-[.22em] text-orange-400">ESQUADRIAS • PORTAS • JANELAS</p><h1 className="mt-4 text-5xl font-black leading-[.98] tracking-tight sm:text-6xl">{theme.title}<br/><span className="text-orange-500">{theme.accent}</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{theme.subtitle}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><CTA/><CTA secondary/></div></div><div className="relative min-h-[430px] overflow-hidden bg-white/[0.03] lg:min-h-[650px]"><img src={theme.photo} alt={theme.photoAlt} className="absolute inset-0 h-full w-full object-contain p-6 sm:p-10" loading="eager"/><div className="absolute inset-0 bg-gradient-to-r from-[#07101b]/30 via-transparent to-transparent"/></div></div></section>
   <section id="cenario" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mx-auto mb-10 max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Aplicação real no nicho</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">{theme.sectionTitle}</h2></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{theme.cards.map(({title,text,icon:Icon})=><div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white"><Icon className="h-5 w-5"/></div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div></section>
   <section id="funcoes" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[.9fr_1.1fr]"><div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">VendorAI aplicado ao objetivo desta página</p><h2 className="mt-3 text-3xl font-black">Funções certas para esta intenção.</h2><p className="mt-4 text-sm leading-6 text-slate-500">A página mostra somente o que ajuda a resolver aquele momento da jornada: gerar demanda, evitar perdas ou operar o comercial.</p><div className="mt-6 flex flex-wrap gap-2">{theme.productModules.map(item=><span key={item} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700">{item}</span>)}</div></div><div className="rounded-[30px] bg-[#07101b] p-3 shadow-2xl"><img src={theme.visual} alt={`Visual do VendorAI para ${theme.badge}`} className="w-full rounded-[22px]"/><p className="px-3 pb-2 pt-3 text-center text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">Exemplo visual da operação dentro do VendorAI</p></div></div></section>
   <section id="jornada" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Jornada comercial</p><h2 className="mt-3 text-3xl font-black">Do primeiro interesse ao fechamento</h2></div><div className="grid gap-3 md:grid-cols-7">{theme.flow.map((step,index)=><div key={step} className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"><div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-600">{index+1}</div><div className="text-xs font-black">{step}</div></div>)}</div><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{theme.kpis.map(k=><div key={k} className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"><Check className="h-4 w-4 text-orange-400"/>{k}</div>)}</div></div></section>
   <section id="faq" className="border-t border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-4xl"><div className="mb-10 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">FAQ</p><h2 className="mt-3 text-3xl font-black">Dúvidas comuns</h2></div><div className="space-y-3">{FAQ.map(([q,a])=><details key={q} className="group rounded-2xl border border-slate-200 bg-white p-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-black">{q}<ChevronDown className="h-4 w-4 transition group-open:rotate-180"/></summary><p className="mt-3 text-sm leading-6 text-slate-500">{a}</p></details>)}</div></div></section>
   <section className="bg-[#07101b] px-4 py-16 text-center text-white sm:px-6 sm:py-20"><div className="mx-auto max-w-3xl"><h2 className="text-4xl font-black">Transforme projetos em próximas ações claras.</h2><p className="mx-auto mt-4 max-w-2xl text-slate-300">Use o VendorAI para conectar marketing, atendimento, orçamento, follow-up e inteligência comercial na operação de esquadrias.</p><div className="mt-8 flex justify-center"><CTA/></div></div></section>
  </main>
 </div>
}