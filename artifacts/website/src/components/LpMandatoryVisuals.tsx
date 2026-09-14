import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";

type VisualSet = { title: string; first: string; second: string; firstAlt: string; secondAlt: string; third?: string; thirdAlt?: string };

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

// SEO discovery links intentionally live in the public LP shell so every niche page
// has direct paths to the strongest commercial and educational sections of VendorAI.
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
  const isLp = location.startsWith("/lp/");
  const key = Object.keys(VISUALS).find(prefix => location.startsWith(prefix));
  const config = key ? VISUALS[key] : null;

  useEffect(()=>{
    setTarget(null);
    if(!isLp) return;
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
  },[location,isLp]);

  if(!isLp || !target) return null;
  const images = config ? [
    {src:config.first, alt:config.firstAlt},
    {src:config.second, alt:config.secondAlt},
    ...(config.third ? [{src:config.third, alt:config.thirdAlt ?? `Visual VendorAI para ${config.title}`}] : []),
  ] : [];

  return createPortal(
    <>
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
    </>,
    target,
  );
}
