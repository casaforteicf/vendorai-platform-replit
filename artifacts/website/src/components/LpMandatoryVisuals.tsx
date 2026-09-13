import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";

type VisualSet = { title: string; first: string; second: string; firstAlt: string; secondAlt: string; third?: string; thirdAlt?: string };

const VISUALS: Record<string, VisualSet> = {
  "/lp/academias-studios": { title:"Academias e Studios", first:"/lp-images/academias-contexto-1.svg", second:"/lp-images/academias-contexto-2.svg", firstAlt:"Academia, treino e experiência do aluno", secondAlt:"Aula experimental, matrícula e retenção" },
  "/lp/concessionarias-lojas-veiculos": { title:"Concessionárias e Lojas de Veículos", first:"/lp-images/veiculos-contexto-1.svg", second:"/lp-images/veiculos-contexto-2.svg", firstAlt:"Showroom e atendimento de veículos", secondAlt:"Troca, financiamento, proposta e test-drive" },
  "/lp/clinicas-odontologicas-esteticas": { title:"Clínicas Odontológicas e Estéticas", first:"/lp-images/clinicas-contexto.svg", second:"/lp-images/clinicas-contexto-2.svg", firstAlt:"Clínica conectada ao VendorAI", secondAlt:"Avaliação, orçamento, agenda e follow-up" },
  "/lp/imobiliarias-corretores": { title:"Imobiliárias e Corretores", first:"/lp-images/imobiliarias-contexto-1.svg", second:"/lp-images/imobiliarias-contexto-2.svg", firstAlt:"Visita e negociação de imóvel", secondAlt:"Lead, visita e proposta imobiliária" },
  "/lp/construtora-residencial": { title:"Construtoras Residenciais", first:"/lp-images/construtora-contexto-1.svg", second:"/lp-images/construtora-contexto-2.svg", firstAlt:"Construção residencial e obra em andamento", secondAlt:"Projeto, proposta e pipeline comercial da construtora" },
  "/lp/esquadrias-portas-janelas": { title:"Esquadrias, Portas e Janelas", first:"/lp-images/esquadrias-contexto-1.svg", second:"/lp-images/esquadrias-contexto-2.svg", firstAlt:"Esquadrias, portas e janelas em projeto residencial", secondAlt:"Medição, orçamento e follow-up de esquadrias" },
  "/lp/piscinas": { title:"Piscinas e Lazer Residencial", first:"/lp-images/piscinas-contexto-1.svg", second:"/lp-images/piscinas-contexto-2.svg", firstAlt:"Piscina integrada a residência e área de lazer", secondAlt:"Projeto, proposta, instalação e pós-venda de piscinas" },
  "/lp/arquitetura-interiores": { title:"Arquitetura e Design de Interiores", first:"/lp-images/arquitetura-contexto-1.svg", second:"/lp-images/arquitetura-contexto-2.svg", firstAlt:"Projeto de arquitetura e interiores", secondAlt:"Briefing, proposta, aprovação e follow-up de projeto" },
  "/lp/distribuidora-autopecas": { title:"Distribuidoras de Autopeças", first:"/lp-images/autopecas-contexto-1.svg", second:"/lp-images/autopecas-contexto-2.svg", firstAlt:"Estoque e operação comercial de autopeças", secondAlt:"Cotação, follow-up, pedido e recompra" },
  "/lp/distribuidora-materiais-construcao": { title:"Distribuidoras de Materiais de Construção", first:"/lp-images/materiais-construcao-contexto-1.svg", second:"/lp-images/materiais-construcao-contexto-2.svg", firstAlt:"Distribuição de materiais por linha e região", secondAlt:"Orçamento, mix, pedido e recompra" },
  "/lp/distribuidora-alimentos-bebidas": { title:"Distribuidoras de Alimentos", first:"/lp-images/alimentos-contexto-1.svg", second:"/lp-images/alimentos-contexto-2.svg", firstAlt:"Carteira e distribuição de alimentos", secondAlt:"Pedido, frequência, mix e reativação" },
  "/lp/maquinas-insumos": { title:"Máquinas, Equipamentos e Insumos", first:"/lp-images/maquinas-insumos-contexto-1.svg", second:"/lp-images/maquinas-insumos-contexto-2.svg", firstAlt:"Máquinas e equipamentos em operação comercial", secondAlt:"Venda técnica, proposta e pós-venda" },
};

export default function LpMandatoryVisuals(){
  const [location] = useLocation();
  const [target,setTarget] = useState<HTMLElement|null>(null);
  const key = Object.keys(VISUALS).find(prefix => location.startsWith(prefix));
  const config = key ? VISUALS[key] : null;

  useEffect(()=>{
    setTarget(null);
    if(!config) return;
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
  },[location,config]);

  if(!config || !target) return null;
  const images = [
    {src:config.first, alt:config.firstAlt},
    {src:config.second, alt:config.secondAlt},
    ...(config.third ? [{src:config.third, alt:config.thirdAlt ?? `Visual VendorAI para ${config.title}`}] : []),
  ];
  return createPortal(
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
    </section>,
    target,
  );
}
