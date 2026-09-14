import { Link, useParams } from "wouter";
import { useEffect } from "react";
import { ArrowRight, ChevronDown, Sparkles, Target, Workflow } from "lucide-react";

export type PremiumIntent = "dor" | "marketing" | "crm";
export type PremiumTheme = {
  badge:string;
  title:string;
  accent:string;
  subtitle:string;
  hero:string;
  heroAlt:string;
  secondary:string;
  secondaryAlt:string;
  visual:string;
  sectionTitle:string;
  contextTitle:string;
  contextText:string;
  cards:Array<{title:string;text:string}>;
  modules:string[];
  flow:string[];
  indicators:string[];
};

export type PremiumIntentLpProps = {
  segment:string;
  slug:string;
  themes:Record<PremiumIntent,PremiumTheme>;
  faq:Array<[string,string]>;
  finalTitle:string;
  finalText:string;
};

function CTA({slug,secondary=false}:{slug:string;secondary?:boolean}){
  return <a href={secondary?`/demo?vertical=${slug}`:`/demo?vertical=${slug}&intent=trial-5-dias`} className={`inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-black transition ${secondary?"border border-white/25 bg-white/5 text-white hover:bg-white/10":"bg-orange-500 text-white hover:bg-orange-600"}`}>{secondary?"Ver demonstração":"Testar 5 dias grátis"}<ArrowRight className="h-4 w-4"/></a>;
}

export default function PremiumIntentLp({segment,slug,themes,faq,finalTitle,finalText}:PremiumIntentLpProps){
  const params=useParams<{intent:string}>();
  const intent=(["dor","marketing","crm"].includes(params.intent??"")?params.intent:"dor") as PremiumIntent;
  const theme=themes[intent];
  useEffect(()=>{document.title=`${theme.title} ${theme.accent} | VendorAI`;let meta=document.querySelector('meta[name="description"]');if(!meta){meta=document.createElement("meta");meta.setAttribute("name","description");document.head.appendChild(meta)}meta.setAttribute("content",theme.subtitle.slice(0,155));},[theme]);
  return <div className="min-h-screen bg-[#f7f7f5] text-slate-950">
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07101b]/95 text-white backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link href="/" className="text-xl font-black">Vendor<span className="text-orange-500">AI</span></Link><nav className="hidden gap-6 text-xs font-bold text-slate-300 md:flex"><a href="#contexto">Operação</a><a href="#cenario">Cenário</a><a href="#funcoes">VendorAI</a><a href="#jornada">Jornada</a><a href="#faq">FAQ</a></nav><a href={`/demo?vertical=${slug}&intent=trial-5-dias`} className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black">Testar 5 dias grátis</a></div></header>
    <main>
      <section className="bg-[#07101b] text-white"><div className="mx-auto grid max-w-7xl lg:grid-cols-2"><div className="flex flex-col justify-center px-4 py-16 sm:px-6 sm:py-20 lg:pr-12"><span className="w-fit rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.18em] text-orange-300">{theme.badge}</span><p className="mt-5 text-xs font-black uppercase tracking-[.22em] text-orange-400">{segment}</p><h1 className="mt-4 text-5xl font-black leading-[.98] tracking-tight sm:text-6xl">{theme.title}<br/><span className="text-orange-500">{theme.accent}</span></h1><p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{theme.subtitle}</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><CTA slug={slug}/><CTA slug={slug} secondary/></div><div className="mt-7 flex flex-wrap gap-2">{theme.modules.slice(0,4).map(item=><span key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-bold text-slate-300">{item}</span>)}</div></div><div className="relative min-h-[460px] overflow-hidden lg:min-h-[680px]"><img src={theme.hero} alt={theme.heroAlt} className="absolute inset-0 h-full w-full object-cover" loading="eager"/><div className="absolute inset-0 bg-gradient-to-r from-[#07101b]/40 via-transparent to-transparent"/><div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/15 bg-[#07101b]/82 p-4 backdrop-blur"><p className="text-xs font-black uppercase tracking-[.16em] text-orange-400">Jornada conectada</p><p className="mt-2 text-sm text-slate-200">{theme.flow.join(" → ")}</p></div></div></div></section>
      <section id="contexto" className="px-4 pt-10 sm:px-6 sm:pt-14"><div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1.15fr_.85fr]"><div className="overflow-hidden rounded-[30px] bg-white shadow-sm ring-1 ring-slate-200"><img src={theme.secondary} alt={theme.secondaryAlt} className="h-[350px] w-full object-cover sm:h-[440px]" loading="lazy"/></div><div className="flex flex-col justify-center rounded-[30px] bg-[#111827] p-8 text-white"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500"><Sparkles className="h-5 w-5"/></div><p className="mt-5 text-xs font-black uppercase tracking-[.2em] text-orange-400">Contexto real do segmento</p><h2 className="mt-3 text-3xl font-black">{theme.contextTitle}</h2><p className="mt-4 text-sm leading-6 text-slate-300">{theme.contextText}</p></div></div></section>
      <section id="cenario" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mx-auto mb-10 max-w-3xl text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Aplicação real</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">{theme.sectionTitle}</h2></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{theme.cards.map(({title,text},index)=><div key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white">{index%2===0?<Target className="h-5 w-5"/>:<Workflow className="h-5 w-5"/>}</div><h3 className="font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div></section>
      <section id="funcoes" className="border-y border-slate-200 bg-white px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[.9fr_1.1fr]"><div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">VendorAI na prática</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">Funções certas para esta intenção.</h2><p className="mt-4 text-sm leading-6 text-slate-500">Cada LP destaca os módulos que ajudam a resolver a intenção daquele visitante, sem repetir uma lista genérica do sistema.</p><div className="mt-6 flex flex-wrap gap-2">{theme.modules.map(item=><span key={item} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700">{item}</span>)}</div></div><div className="rounded-[30px] bg-[#07101b] p-3 shadow-2xl"><img src={theme.visual} alt={`Visual VendorAI para ${segment}`} className="w-full rounded-[22px]" loading="lazy"/><p className="px-3 pb-2 pt-3 text-center text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">Exemplo visual da operação dentro do VendorAI</p></div></div></section>
      <section id="jornada" className="px-4 py-16 sm:px-6 sm:py-20"><div className="mx-auto max-w-7xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Jornada comercial</p><h2 className="mt-3 text-3xl font-black">Do primeiro sinal ao resultado</h2></div><div className="grid gap-3 md:grid-cols-7">{theme.flow.map((step,index)=><div key={step} className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"><div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-600">{index+1}</div><div className="text-xs font-black">{step}</div></div>)}</div><div className="mt-10 rounded-3xl bg-[#07101b] p-7 text-white"><p className="text-xs font-black uppercase tracking-[.18em] text-orange-400">Indicadores operacionais</p><div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">{theme.indicators.map(item=><div key={item} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-bold">{item}</div>)}</div></div></div></section>
      <section id="faq" className="border-t border-slate-200 bg-white px-4 py-16 sm:px-6"><div className="mx-auto max-w-5xl"><div className="mb-8 text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Dúvidas?</p><h2 className="mt-3 text-3xl font-black">Perguntas frequentes</h2></div><div className="grid gap-3 md:grid-cols-2">{faq.map(([q,a])=><details key={q} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-black"><span>{q}</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180"/></summary><p className="mt-3 text-sm leading-6 text-slate-500">{a}</p></details>)}</div></div></section>
      <section className="bg-orange-500 px-4 py-14 text-white sm:px-6"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 lg:flex-row lg:items-center"><div><h2 className="text-3xl font-black sm:text-4xl">{finalTitle}</h2><p className="mt-2 max-w-2xl text-sm text-orange-50">{finalText}</p></div><a href={`/demo?vertical=${slug}&intent=trial-5-dias`} className="rounded-xl bg-white px-6 py-3.5 text-sm font-black text-orange-600">Testar 5 dias grátis</a></div></section>
    </main>
  </div>;
}
