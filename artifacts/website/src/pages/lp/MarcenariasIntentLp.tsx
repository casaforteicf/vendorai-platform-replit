import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { ArrowRight, Check, ChevronDown, MessageCircle, Radar, Target, Users } from "lucide-react";

type Intent = "dor" | "marketing" | "crm";

type Theme = {
  badge: string;
  title: string;
  accent: string;
  subtitle: string;
  problems: string[];
  solutionTitle: string;
  solution: string[];
  cta: string;
};

const THEMES: Record<Intent, Theme> = {
  dor: {
    badge: "Dor / Descoberta",
    title: "Sua carteira pode comprar mais",
    accent: "sem você perceber.",
    subtitle: "Marceneiros comprando menos, mix subaproveitado e orçamentos sem retorno deixam receita parada dentro da própria base.",
    problems: [
      "Clientes reduzem compras e ninguém percebe cedo",
      "O vendedor não sabe quem abordar primeiro",
      "Orçamentos ficam sem follow-up",
      "Arquitetos e especificadores são esquecidos",
    ],
    solutionTitle: "O VendorAI transforma sinais em próxima ação",
    solution: ["Revenue Scout para priorizar carteira", "Follow-up com responsável e prazo", "WhatsApp conectado ao histórico", "Reativação e oportunidade de mix"],
    cta: "Quero recuperar oportunidades",
  },
  marketing: {
    badge: "Marketing / Crescimento",
    title: "Mais demanda para MDF, ferragens",
    accent: "e móveis planejados.",
    subtitle: "Conteúdo visual, campanhas, landing pages, WhatsApp e CRM conectados para gerar demanda entre marcenarias, arquitetos e especificadores.",
    problems: [
      "Campanhas sem ligação com a venda",
      "Conteúdo sem foco em aplicação e acabamento",
      "Leads chegam sem origem e contexto",
      "Lançamentos não viram rotina comercial",
    ],
    solutionTitle: "Do anúncio até o pedido, tudo no mesmo fluxo",
    solution: ["Planejamento e criativos por linha", "Meta e Google por intenção", "Landing pages por campanha", "Visitor Intelligence + CRM"],
    cta: "Quero gerar mais demanda",
  },
  crm: {
    badge: "CRM / Alta intenção",
    title: "CRM com IA para distribuidores",
    accent: "de marcenaria e planejados.",
    subtitle: "Carteira, mix, orçamentos, especificadores, WhatsApp, follow-up e oportunidades comerciais em uma única operação.",
    problems: [
      "Histórico comercial espalhado",
      "Pipeline sem próxima ação clara",
      "Carteira depende da memória do vendedor",
      "Gestão não enxerga oportunidades de mix",
    ],
    solutionTitle: "Uma operação comercial simples de acompanhar",
    solution: ["Pipeline por etapa", "Responsável, prazo e próxima ação", "Agentes de IA", "Revenue Scout + inteligência de carteira"],
    cta: "Quero ver o CRM",
  },
};

const FAQ = [
  ["Serve para distribuidora de MDF e ferragens?", "Sim. A jornada pode ser adaptada para MDF, ferragens, acessórios, acabamentos e linhas para móveis planejados."],
  ["Consigo trabalhar arquitetos e especificadores?", "Sim. Eles podem fazer parte da carteira e do pipeline, com histórico, responsável, próxima ação e campanhas próprias."],
  ["O WhatsApp fica ligado ao CRM?", "Sim. Atendimento, histórico e oportunidade podem permanecer conectados ao mesmo cliente."],
  ["Dá para identificar clientes com potencial de comprar mais mix?", "O Revenue Scout pode apoiar a priorização da carteira e sinalizar oportunidades conforme os dados e regras disponíveis."],
];

export default function MarcenariasIntentLp() {
  const params = useParams<{ intent: string }>();
  const intent = (["dor", "marketing", "crm"].includes(params.intent ?? "") ? params.intent : "dor") as Intent;
  const theme = THEMES[intent];

  useEffect(() => {
    document.title = `${theme.title} ${theme.accent} | VendorAI`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", theme.subtitle);
  }, [theme]);

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="text-xl font-black">Vendor<span className="text-orange-500">AI</span></Link>
          <a href="/demo?vertical=marcenarias-moveis-planejados&intent=trial-5-dias" className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black text-white">Testar 5 dias</a>
        </div>
      </header>

      <main>
        <section className="bg-[#07101b] text-white">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2">
            <div>
              <span className="inline-flex rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[.16em] text-orange-300">{theme.badge}</span>
              <p className="mt-5 text-xs font-black uppercase tracking-[.2em] text-orange-400">MARCENARIAS • MDF • FERRAGENS • MÓVEIS PLANEJADOS</p>
              <h1 className="mt-4 text-4xl font-black leading-[1.02] sm:text-6xl">{theme.title}<br/><span className="text-orange-500">{theme.accent}</span></h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">{theme.subtitle}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a href="/demo?vertical=marcenarias-moveis-planejados&intent=trial-5-dias" className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 text-sm font-black">{theme.cta}<ArrowRight className="h-4 w-4"/></a>
                <a href="#como-funciona" className="inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3.5 text-sm font-black">Como funciona</a>
              </div>
            </div>
            <img src="/lp-images/marcenaria-contexto-1.svg" alt="Ambiente de marcenaria e móveis planejados" className="min-h-[360px] w-full rounded-[30px] object-cover shadow-2xl" loading="eager"/>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 sm:py-18">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[.95fr_1.05fr] lg:items-center">
              <img src="/lp-images/marcenaria-contexto-2.svg" alt="Orçamento, especificação e acompanhamento comercial" className="w-full rounded-[28px] bg-white object-cover shadow-sm ring-1 ring-slate-200" loading="eager"/>
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-orange-600">O problema</p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">O que está ficando para trás na operação?</h2>
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {theme.problems.map((item) => <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5 font-bold shadow-sm">{item}</div>)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="border-y border-slate-200 bg-white px-4 py-14 sm:px-6 sm:py-18">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-orange-600">A solução</p>
              <h2 className="mt-3 text-3xl font-black sm:text-4xl">{theme.solutionTitle}</h2>
              <div className="mt-6 space-y-3">
                {theme.solution.map((item) => <div key={item} className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 font-bold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-white"><Check className="h-4 w-4"/></span>{item}</div>)}
              </div>
              <div className="mt-7 grid grid-cols-3 gap-3 text-center text-xs font-black text-slate-600">
                <div className="rounded-xl bg-orange-50 p-4"><MessageCircle className="mx-auto mb-2 h-5 w-5 text-orange-500"/>WhatsApp</div>
                <div className="rounded-xl bg-orange-50 p-4"><Radar className="mx-auto mb-2 h-5 w-5 text-orange-500"/>Scout</div>
                <div className="rounded-xl bg-orange-50 p-4"><Users className="mx-auto mb-2 h-5 w-5 text-orange-500"/>CRM</div>
              </div>
            </div>
            <img src="/lp-images/marcenaria-vendorai.svg" alt="Visual do VendorAI para marcenarias e móveis planejados" className="w-full rounded-[28px] bg-[#07101b] p-2 shadow-2xl" loading="eager"/>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 sm:py-18">
          <div className="mx-auto max-w-5xl">
            <div className="text-center"><Target className="mx-auto h-7 w-7 text-orange-500"/><h2 className="mt-3 text-3xl font-black">Fluxo simples, sem confusão</h2><p className="mt-3 text-slate-500">Cliente → sinal → prioridade → contato → orçamento → pedido → recompra.</p></div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {["Cliente", "Sinal", "Prioridade", "Contato", "Orçamento", "Pedido"].map((step, i) => <div key={step} className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm"><div className="text-xs font-black text-orange-500">0{i+1}</div><div className="mt-2 text-sm font-black">{step}</div></div>)}
            </div>
          </div>
        </section>

        <section className="bg-[#07101b] px-4 py-14 text-white sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="text-center"><h2 className="text-3xl font-black">Perguntas frequentes</h2></div>
            <div className="mt-8 grid gap-3 md:grid-cols-2">
              {FAQ.map(([q,a]) => <details key={q} className="group rounded-2xl border border-white/10 bg-white/[.04] p-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-black">{q}<ChevronDown className="h-4 w-4 transition group-open:rotate-180"/></summary><p className="mt-3 text-sm leading-6 text-slate-300">{a}</p></details>)}
            </div>
          </div>
        </section>

        <section className="bg-orange-500 px-4 py-12 text-white sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 lg:flex-row lg:items-center"><div><h2 className="text-3xl font-black">Menos texto. Mais clareza. Mais ação.</h2><p className="mt-2 text-orange-50">Veja o VendorAI aplicado à sua operação comercial.</p></div><a href="/demo?vertical=marcenarias-moveis-planejados&intent=trial-5-dias" className="rounded-xl bg-white px-6 py-3.5 text-sm font-black text-orange-600">Testar 5 dias grátis</a></div>
        </section>
      </main>
    </div>
  );
}
