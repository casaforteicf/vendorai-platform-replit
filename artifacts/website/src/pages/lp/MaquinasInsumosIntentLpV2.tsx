import { Link, useParams } from "wouter";
import { useEffect } from "react";
import { ArrowRight, Bot, CalendarCheck, ChevronDown, Megaphone, MessageCircle, PackageSearch, Radar, Search, Settings2, Target, Users, Workflow } from "lucide-react";

type Intent = "dor" | "marketing" | "crm";
type Theme = { badge:string; title:string; accent:string; subtitle:string; photo:string; secondaryPhoto:string; photoAlt:string; secondaryAlt:string; visual:string; sectionTitle:string; cards:Array<{title:string;text:string;icon:typeof Target}>; flow:string[]; productModules:string[]; kpis:string[] };

const P1 = "/lp-images/maquinas-insumos-contexto-1.svg";
const P2 = "/lp-images/maquinas-insumos-contexto-2.svg";

const THEMES: Record<Intent, Theme> = {
  dor: {
    badge:"Dor / Descoberta",
    title:"Negociações técnicas longas",
    accent:"não podem depender da memória.",
    subtitle:"Propostas paradas, especificações sem retorno e oportunidades que esfriam no meio do ciclo exigem prioridade, próxima ação e acompanhamento contínuo.",
    photo:P1, secondaryPhoto:P2,
    photoAlt:"Operação industrial de máquinas e equipamentos", secondaryAlt:"Distribuição técnica de máquinas e insumos",
    visual:"/lp-images/maquinas-insumos-dor-vendorai.svg",
    sectionTitle:"Onde vendas técnicas costumam se perder",
    cards:[
      {title:"Proposta sem retorno",text:"Ciclos longos ficam vulneráveis quando ninguém sabe exatamente quando retomar.",icon:MessageCircle},
      {title:"Especificação parada",text:"Detalhes técnicos avançam sem uma próxima ação comercial claramente marcada.",icon:Settings2},
      {title:"Prioridade errada",text:"A equipe trata oportunidades de potencial muito diferente da mesma forma.",icon:Radar},
      {title:"Reposição esquecida",text:"Venda concluída não vira automaticamente nova oportunidade de insumo ou manutenção.",icon:PackageSearch},
      {title:"Histórico disperso",text:"WhatsApp, proposta, aplicação e responsável ficam separados.",icon:Workflow},
      {title:"Gerente descobre tarde",text:"A negociação trava e o problema só aparece no fechamento do mês.",icon:Users}
    ],
    flow:["Necessidade","Especificação","Proposta","Follow-up","Negociação","Venda","Pós-venda"],
    productModules:["Revenue Scout","Próxima ação","Follow-up","WhatsApp + histórico","Agenda Inteligente","Alertas comerciais"],
    kpis:["Propostas abertas","Tempo de ciclo","Follow-ups vencidos","Conversão","Reposição","Receita pós-venda"]
  },
  marketing: {
    badge:"Marketing / Crescimento",
    title:"Gere demanda técnica",
    accent:"para máquinas, equipamentos e insumos.",
    subtitle:"Conteúdo, Meta, Google, landing pages, Visitor Intelligence, WhatsApp e CRM conectados para captar aplicação, necessidade e intenção de compra.",
    photo:P2, secondaryPhoto:P1,
    photoAlt:"Distribuição técnica de máquinas e insumos", secondaryAlt:"Operação industrial de máquinas e equipamentos",
    visual:"/lp-images/maquinas-insumos-marketing-vendorai.svg",
    sectionTitle:"Marketing técnico ligado à oportunidade real",
    cards:[
      {title:"Campanhas por aplicação",text:"Produção, automação, reposição, upgrade e expansão podem ter campanhas próprias.",icon:Megaphone},
      {title:"Google para procura ativa",text:"Capture quem já pesquisa equipamento, solução técnica ou fornecedor.",icon:Search},
      {title:"Meta para descoberta",text:"Trabalhe inovação, ganho operacional, lançamento e demonstração.",icon:Target},
      {title:"Landing Pages técnicas",text:"Apresente aplicação, benefício, especificação e CTA coerentes com a campanha.",icon:Settings2},
      {title:"Visitor Intelligence",text:"Origem e comportamento ajudam a qualificar antes do contato técnico.",icon:Radar},
      {title:"Atribuição até a proposta",text:"Campanha, lead, especialista, proposta e venda permanecem conectados.",icon:Workflow}
    ],
    flow:["Conteúdo","Meta/Google","Landing Page","Qualificação","Especialista","Proposta","Venda"],
    productModules:["Planejador de Marketing","Gerador de Conteúdo","Biblioteca de Mídia","Campanhas","Landing Pages","Visitor Intelligence","CRM"],
    kpis:["Origem do lead","Leads técnicos","Propostas por campanha","Custo por oportunidade","Conversão","Receita por origem"]
  },
  crm: {
    badge:"CRM / Alta intenção",
    title:"CRM com IA para",
    accent:"Máquinas, Equipamentos e Insumos.",
    subtitle:"Organize venda técnica, aplicação, proposta, responsáveis, WhatsApp, follow-up, pós-venda, reposição e inteligência comercial no mesmo processo.",
    photo:P1, secondaryPhoto:P2,
    photoAlt:"Operação industrial de máquinas e equipamentos", secondaryAlt:"Distribuição técnica de máquinas e insumos",
    visual:"/lp-images/maquinas-insumos-crm-vendorai.svg",
    sectionTitle:"Um CRM para vendas complexas e ciclos longos",
    cards:[
      {title:"Pipeline técnico",text:"Necessidade, especificação, proposta, negociação, venda e pós-venda em etapas claras.",icon:Workflow},
      {title:"Contexto da aplicação",text:"Produto, necessidade, região e dados técnicos acompanham a oportunidade.",icon:Settings2},
      {title:"Responsável e prazo",text:"Cada negociação mantém próxima ação e dono definidos.",icon:CalendarCheck},
      {title:"WhatsApp integrado",text:"Conversa e histórico permanecem ligados à proposta e ao cliente.",icon:MessageCircle},
      {title:"Agentes de IA",text:"SDR, Closer, Follow-up e Pós-venda apoiam diferentes etapas.",icon:Bot},
      {title:"Revenue Scout",text:"Identifica sinais de expansão, reposição, risco e potencial na carteira.",icon:Radar}
    ],
    flow:["Lead","Qualificação","Especificação","Proposta","Negociação","Venda","Pós-venda"],
    productModules:["CRM Hub","Omnichannel","SDR","Closer","Follow-up","Pós-venda","Revenue Scout","Agenda Inteligente"],
    kpis:["Pipeline técnico","Tempo por etapa","Propostas","Conversão","Reposição","Receita pós-venda"]
  }
};

const FAQ = [
  ["Serve para máquinas industriais e agrícolas?","Sim. O fluxo pode ser adaptado por aplicação, linha, região, especialista, proposta e ciclo técnico."],
  ["Consigo acompanhar proposta técnica?","Sim. Proposta, responsável, prazo, histórico e próxima ação podem ficar ligados à oportunidade."],
  ["O sistema ajuda no pós-venda e reposição?","Sim. Revenue Scout, Follow-up e Pós-venda podem apoiar oportunidades de reposição, expansão e relacionamento."],
  ["O WhatsApp fica ligado ao CRM?","A proposta é manter conversa, histórico e oportunidade conectados para preservar contexto técnico e comercial."],
  ["Consigo saber qual campanha gerou a proposta?","Origem, campanha, landing page, lead, especialista e proposta podem permanecer conectados na jornada."],
  ["Quais agentes entram melhor?","SDR, Closer, Follow-up e Pós-venda são os principais para vendas técnicas e ciclos longos."]
];

function CTA({secondary=false}:{secondary?:boolean}) {
  return <a href={secondary?"/demo?vertical=maquinas-insumos":"/demo?vertical=maquinas-insumos&intent=trial-5-dias"} className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-black transition ${secondary?"border border-white/25 bg-white/5 text-white hover:bg-white/10":"bg-orange-500 text-white hover:bg-orange-600"}`}>{secondary?"Ver demonstração":"Testar 5 dias grátis"}<ArrowRight className="h-4 w-4"/></a>;
}

export default function MaquinasInsumosIntentLpV2(){
  const params=useParams<{intent:string}>();
  const intent=(["dor","marketing","crm"].includes(params.intent??"")?params.intent:"dor") as Intent;
  const theme=THEMES[intent];
  useEffect(()=>{document.title=`${theme.title} ${theme.accent} | VendorAI`;let meta=document.querySelector('meta[name="description"]');if(!meta){meta=document.createElement("meta");meta.setAttribute("name","description");document.head.appendChild(meta);}meta.setAttribute("content",theme.subtitle.slice(0,155));},[theme]);
  return <div className="min-h-screen bg-[#f7f7f5] text-slate-950">
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07101b]/95 text-white backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/" className="text-xl font-black">Vendor<span className="text-orange-500">AI</span></Link><a href="/demo?vertical=maquinas-insumos&intent=trial-5-dias" className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black">Testar 5 dias grátis</a></div></header>
    <main>
      <section className="bg-[#07101b] text-white"><div className="mx-auto grid max-w-7xl lg:grid-cols-2"><div className="flex flex-col justify-center px-4 py-16 sm:px-6 sm:py-20 lg:pr-12"><span className="w-fit rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.18em] text-orange-300">{theme.badge}</span><p className="mt-5 text-xs font-black uppercase tracking-[.22em] text-orange-400">DISTRIBUIÇÃO • MÁQUINAS • INSUMOS • B2B</p><h1 className="mt-4 text-5xl font-black leading-[.98] tracking-tight sm:text-6xl">{theme.title}<br/><span className="text-orange-500">{theme.accent}</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{theme.subtitle}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><CTA/><CTA secondary/></div></div><div className="relative min-h-[430px] overflow-hidden lg:min-h-[650px]"><img src={theme.photo} alt={theme.photoAlt} className="absolute inset-0 h-full w-full object-cover" loading="eager"/><div className="absolute inset-0 bg-gradient-to-r from-[#07101b]/35 via-transparent to-transparent"/></div></div></section>
      <section className="px-4 pt-10 sm:px-6 sm:pt-14"><div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1.15fr_.85fr]"><div className="overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-slate-200"><img src={theme.secondaryPhoto} alt={theme.secondaryAlt} className="h-[340px] w-full object-cover sm:h-[430px]" loading="lazy"/></div><div className="flex flex-col justify-center rounded-[30px] bg-[#111827] p-8 text-white"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-400">Contexto real do nicho</p><h2 className="mt-3 text-3xl font-black">Venda técnica exige contexto, prioridade e continuidade.</h2><p className="mt-4 text-sm leading-6 text-slate-300">As duas imagens desta LP agora são arquivos locais do próprio site. Não dependem de Pexels, Wikimedia ou qualquer outro domínio externo.</p></div></div></section>
      <section className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mx-auto mb-10 max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Aplicação real</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">{theme.sectionTitle}</h2></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{theme.cards.map(({title,text,icon:Icon})=><div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white"><Icon className="h-5 w-5"/></div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div></section>
      <section className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[.9fr_1.1fr]"><div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">VendorAI aplicado à intenção</p><h2 className="mt-3 text-3xl font-black">Funções certas para esta página.</h2><div className="mt-6 flex flex-wrap gap-2">{theme.productModules.map(item=><span key={item} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700">{item}</span>)}</div></div><div className="rounded-[30px] bg-[#07101b] p-3 shadow-2xl"><img src={theme.visual} alt={`Visual VendorAI para ${theme.badge}`} className="w-full rounded-[22px]"/><p className="px-3 pb-2 pt-3 text-center text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">Exemplo visual da operação no VendorAI</p></div></div></section>
      <section className="px-4 py-16 sm:px-6"><div className="mx-auto max-w-7xl"><div className="grid gap-3 md:grid-cols-7">{theme.flow.map((step,index)=><div key={step} className="rounded-2xl border border-slate-200 bg-white p-4 text-center"><div className="mb-2 text-xs font-black text-orange-600">0{index+1}</div><div className="text-xs font-black">{step}</div></div>)}</div><div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3">{theme.kpis.map(item=><div key={item} className="rounded-xl bg-[#07101b] p-4 text-sm font-bold text-white">{item}</div>)}</div></div></section>
      <section className="border-t border-slate-200 bg-white px-4 py-16 sm:px-6"><div className="mx-auto max-w-4xl"><h2 className="text-center text-3xl font-black">Perguntas frequentes</h2><div className="mt-8 space-y-3">{FAQ.map(([q,a])=><details key={q} className="group rounded-2xl border border-slate-200 p-5"><summary className="flex cursor-pointer list-none items-center justify-between font-black">{q}<ChevronDown className="h-5 w-5 transition group-open:rotate-180"/></summary><p className="mt-3 text-sm leading-6 text-slate-600">{a}</p></details>)}</div></div></section>
    </main>
  </div>;
}
