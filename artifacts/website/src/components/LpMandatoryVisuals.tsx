import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import agentExecutionDepth from "@/data/agentExecutionDepth.json";
import { getProductDeepDiveContent } from "@/data/productDeepDiveContent";

type VisualSet = { title: string; first: string; second: string; firstAlt: string; secondAlt: string; third?: string; thirdAlt?: string };
type AgentDepth = { title:string; intro:string; executions:string[]; workflow:string[]; autonomy:string; example:string };

const VISUALS: Record<string, VisualSet> = {
  "/lp/academias-studios": { title:"Academias e Studios", first:"/lp-images/academias-contexto-1.svg", second:"/lp-images/academias-contexto-2.svg", firstAlt:"Academia, treino e experiência do aluno", secondAlt:"Aula experimental, matrícula e retenção" },
  "/lp/concessionarias-lojas-veiculos": { title:"Concessionárias e Lojas de Veículos", first:"/lp-images/veiculos-contexto-1.svg", second:"/lp-images/veiculos-contexto-2.svg", firstAlt:"Showroom e atendimento de veículos", secondAlt:"Troca, financiamento, proposta e test-drive" },
  "/lp/clinicas-odontologicas-esteticas": { title:"Clínicas Odontológicas e Estéticas", first:"/lp-images/clinicas-contexto.svg", second:"/lp-images/clinicas-contexto-2.svg", firstAlt:"Clínica conectada ao VendorAI", secondAlt:"Avaliação, orçamento, agenda e follow-up" },
  "/lp/construtora-residencial": { title:"Construtoras Residenciais", first:"/lp-images/construtora-contexto-1.svg", second:"/lp-images/construtora-contexto-2.svg", firstAlt:"Construção residencial e obra em andamento", secondAlt:"Projeto, proposta e pipeline comercial da construtora" },
  "/lp/esquadrias-portas-janelas": { title:"Esquadrias, Portas e Janelas", first:"/lp-images/esquadrias-contexto-1.svg", second:"/lp-images/esquadrias-contexto-2.svg", firstAlt:"Esquadrias, portas e janelas em projeto residencial", secondAlt:"Medição, orçamento e follow-up de esquadrias" },
  "/lp/piscinas": { title:"Piscinas e Lazer Residencial", first:"/lp-images/piscinas-contexto-1.svg", second:"/lp-images/piscinas-contexto-2.svg", firstAlt:"Piscina integrada a residência e área de lazer", secondAlt:"Projeto, proposta, instalação e pós-venda de piscinas" },
  "/lp/arquitetura-interiores": { title:"Arquitetura e Design de Interiores", first:"/lp-images/arquitetura-contexto-1.svg", second:"/lp-images/arquitetura-contexto-2.svg", firstAlt:"Projeto de arquitetura e interiores", secondAlt:"Briefing, proposta, aprovação e follow-up de projeto" },
  "/lp/distribuidora-autopecas": { title:"Distribuidoras de Autopeças", first:"/lp-images/autopecas-contexto-1.svg", second:"/lp-images/autopecas-contexto-2.svg", firstAlt:"Estoque e operação comercial de autopeças", secondAlt:"Cotação, follow-up, pedido e recompra" },
  "/lp/distribuidora-materiais-construcao": { title:"Distribuidoras de Materiais de Construção", first:"/lp-images/materiais-construcao-contexto-1.svg", second:"/lp-images/materiais-construcao-contexto-2.svg", firstAlt:"Distribuição de materiais por linha e região", secondAlt:"Orçamento, mix, pedido e recompra" },
  "/lp/distribuidora-alimentos-bebidas": { title:"Distribuidoras de Alimentos", first:"/lp-images/alimentos-contexto-1.svg", second:"/lp-images/alimentos-contexto-2.svg", firstAlt:"Carteira e distribuição de alimentos", secondAlt:"Pedido, frequência, mix e reativação" },
};

const SEO_LINKS = [
  ["CRM com IA", "/produtos/crm"],
  ["CRM integrado ao WhatsApp", "/solucoes/crm-whatsapp"],
  ["Agentes de IA para vendas", "/produtos/agentes-ia"],
  ["Follow-up automático", "/solucoes/automatizar-follow-up"],
  ["Revenue Scout", "/produtos/revenue-scout"],
  ["Revenue Intelligence", "/solucoes/revenue-intelligence"],
  ["Todas as soluções", "/solucoes"],
  ["Conteúdo e guias", "/blog"],
] as const;

export default function LpMandatoryVisuals(){
  const [location] = useLocation();
  const [target,setTarget] = useState<HTMLElement|null>(null);
  const cleanLocation = location.split("?")[0].replace(/\/$/,"") || "/";
  const isLp = cleanLocation.startsWith("/lp/");
  const isAgent = cleanLocation === "/agentes-virtuais-inteligentes" || cleanLocation.startsWith("/agentes-virtuais-inteligentes/");
  const productSlug = cleanLocation.startsWith("/produtos/") ? cleanLocation.replace("/produtos/","") : "";
  const productDeepDive = productSlug ? getProductDeepDiveContent(productSlug) : null;
  const shouldMount = isLp || isAgent || Boolean(productDeepDive);
  const key = Object.keys(VISUALS).find(prefix => cleanLocation.startsWith(prefix));
  const config = key ? VISUALS[key] : null;
  const agentConfig = isAgent ? (agentExecutionDepth.pages as Record<string,AgentDepth>)[cleanLocation] : null;

  useEffect(()=>{
    setTarget(null);
    if(!shouldMount) return;
    let host: HTMLElement | null = null;
    let observer: MutationObserver | null = null;
    const mount = () => {
      const firstSection = document.querySelector("main section");
      if(!firstSection || !firstSection.parentElement) return false;
      host = document.createElement("div");
      host.dataset.lpMandatoryVisuals = "true";
      firstSection.insertAdjacentElement("afterend", host);
      setTarget(host);
      return true;
    };
    if(!mount()){
      observer = new MutationObserver(()=>{ if(mount()) observer?.disconnect(); });
      observer.observe(document.body,{childList:true,subtree:true});
    }
    return ()=>{ observer?.disconnect(); host?.remove(); };
  },[cleanLocation,shouldMount]);

  if(!shouldMount || !target) return null;
  const images = config ? [
    {src:config.first, alt:config.firstAlt},
    {src:config.second, alt:config.secondAlt},
    ...(config.third ? [{src:config.third, alt:config.thirdAlt ?? `Visual VendorAI para ${config.title}`}] : []),
  ] : [];

  return createPortal(
    <>
      {productDeepDive && (
        <section className="border-y border-slate-200 bg-white px-4 py-14 sm:px-6 sm:py-20" aria-label="Detalhamento da solução VendorAI">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-5xl">
              <p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Dor → execução → benefício → resultado</p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-5xl">{productDeepDive.headline}</h2>
              <p className="mt-6 text-base leading-8 text-slate-600 sm:text-lg">{productDeepDive.intro}</p>
              <div className="mt-6 rounded-[24px] border border-orange-200 bg-orange-50 p-6">
                <p className="text-xs font-black uppercase tracking-[.18em] text-orange-700">Por que esta função existe</p>
                <p className="mt-3 text-sm leading-7 text-slate-700 sm:text-base">{productDeepDive.why}</p>
              </div>
            </div>

            <div className="mt-10 rounded-[28px] bg-slate-950 p-7 text-white sm:p-9">
              <p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">Jornada completa</p>
              <h3 className="mt-3 text-2xl font-black">Como o trabalho acontece dentro do VendorAI</h3>
              <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {productDeepDive.journey.map((item,index)=><div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-5"><span className="text-sm font-black text-orange-300">{String(index+1).padStart(2,"0")}</span><p className="mt-2 text-sm leading-6 text-slate-200">{item}</p></div>)}
              </div>
            </div>

            <div className="mt-10 space-y-10">
              {productDeepDive.sections.map(section=><article key={section.title}>
                <div className="max-w-4xl"><h3 className="text-2xl font-black text-slate-950 sm:text-3xl">{section.title}</h3><p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">{section.intro}</p></div>
                <div className="mt-6 grid gap-5 lg:grid-cols-2">
                  {section.items.map(item=><div key={item.title} className="rounded-[28px] border border-slate-200 bg-[#fbfcfe] p-6 shadow-sm">
                    <h4 className="text-lg font-black text-slate-950">{item.title}</h4>
                    <div className="mt-5 space-y-4 text-sm leading-6">
                      <div><p className="font-black text-rose-700">Dor que resolve</p><p className="mt-1 text-slate-600">{item.pain}</p></div>
                      <div><p className="font-black text-blue-700">O que o VendorAI executa</p><p className="mt-1 text-slate-600">{item.execution}</p></div>
                      <div><p className="font-black text-emerald-700">Benefício gerado</p><p className="mt-1 text-slate-600">{item.benefit}</p></div>
                    </div>
                  </div>)}
                </div>
              </article>)}
            </div>

            <div className="mt-10 rounded-[28px] border border-emerald-200 bg-emerald-50 p-7 sm:p-9">
              <p className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">Resultado esperado</p>
              <p className="mt-3 text-lg font-semibold leading-8 text-slate-800">{productDeepDive.outcome}</p>
            </div>
          </div>
        </section>
      )}

      {agentConfig && (
        <section className="border-y border-slate-200 bg-white px-4 py-14 sm:px-6 sm:py-20" aria-label="Execução prática do agente VendorAI">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-4xl">
              <p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Execução real • contexto • controle</p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">{agentConfig.title}</h2>
              <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">{agentConfig.intro}</p>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <article className="rounded-[28px] border border-slate-200 bg-[#fffaf5] p-7">
                <h3 className="text-xl font-black text-slate-950">O que este agente executa</h3>
                <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
                  {agentConfig.executions.map(item=><li key={item} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-orange-500"/><span>{item}</span></li>)}
                </ul>
              </article>
              <article className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm">
                <h3 className="text-xl font-black text-slate-950">Como trabalha dentro do VendorAI</h3>
                <div className="mt-5 space-y-4 text-sm leading-7 text-slate-600">
                  {agentConfig.workflow.map((item,index)=><p key={item}><strong className="text-slate-900">{index+1}.</strong> {item}</p>)}
                </div>
              </article>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <article className="rounded-[28px] bg-slate-950 p-7 text-white">
                <p className="text-xs font-black uppercase tracking-[.18em] text-orange-300">Autonomia com governança</p>
                <h3 className="mt-3 text-xl font-black">A empresa continua no controle.</h3>
                <p className="mt-4 text-sm leading-7 text-slate-300">{agentConfig.autonomy}</p>
              </article>
              <article className="rounded-[28px] border border-orange-200 bg-orange-50 p-7">
                <p className="text-xs font-black uppercase tracking-[.18em] text-orange-700">Exemplo operacional</p>
                <h3 className="mt-3 text-xl font-black text-slate-950">Como isso acontece na prática</h3>
                <p className="mt-4 text-sm leading-7 text-slate-700">{agentConfig.example}</p>
              </article>
            </div>
          </div>
        </section>
      )}

      {config && (
        <section className="bg-[#f7f7f5] px-4 py-10 sm:px-6 sm:py-14" aria-label={`Imagens de ${config.title}`}>
          <div className="mx-auto max-w-7xl">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Contexto visual do nicho</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">{config.title} em contexto de operação</h2></div>
              <span className="hidden rounded-full bg-slate-900 px-4 py-2 text-[11px] font-black uppercase tracking-[.12em] text-white sm:inline-flex">Imagens locais • padrão obrigatório</span>
            </div>
            <div className={`grid gap-5 ${images.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
              {images.map((image)=><div key={image.src} className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-slate-200"><img src={image.src} alt={image.alt} className="h-[300px] w-full object-cover sm:h-[420px]" loading="eager"/></div>)}
            </div>
          </div>
        </section>
      )}

      {isLp && (
        <section className="border-y border-slate-200 bg-white px-4 py-10 sm:px-6" aria-label="Explore soluções VendorAI relacionadas">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-6 lg:grid-cols-[1.15fr_1.85fr] lg:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[.2em] text-orange-600">Continue explorando</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Veja como as soluções do VendorAI se conectam.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">A landing page mostra uma aplicação específica. Para entender o fluxo completo, explore CRM, WhatsApp, agentes de IA, follow-up e inteligência de receita. Esses módulos trabalham juntos para organizar atendimento, oportunidades, próxima ação, reativação e crescimento comercial.</p>
              </div>
              <nav className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Links internos estratégicos">
                {SEO_LINKS.map(([label,href])=><a key={href} href={href} className="rounded-2xl border border-slate-200 bg-[#fffaf5] px-4 py-4 text-sm font-black text-slate-800 transition hover:border-orange-300 hover:text-orange-600">{label}</a>)}
              </nav>
            </div>
          </div>
        </section>
      )}
    </>,
    target,
  );
}
