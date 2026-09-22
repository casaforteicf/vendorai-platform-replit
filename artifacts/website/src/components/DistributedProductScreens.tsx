import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { usePublicCountry } from "@/lib/publicCountry";

const MEDIA = "/media/vendorai-official";

const PT = {
  kicker: "Produto real, função por função",
  title: "Veja exatamente o que cada parte do VendorAI faz.",
  description:
    "Cada bloco abaixo usa uma tela real do sistema. Você entende a função, o resultado esperado e onde ela entra na operação — sem ilustração genérica.",
  cta: "Ver produto",
  items: [
    {
      eyebrow: "CRM",
      title: "Pipeline comercial com estágio, responsável e próxima ação.",
      description:
        "O CRM organiza oportunidades e mantém o histórico comercial visível para pessoas e agentes de IA.",
      bullets: ["Pipeline visual", "Responsável e próxima ação", "Histórico compartilhado com os agentes"],
      image: `${MEDIA}/crm-pipeline/desktop-1440.png`,
      mobile: `${MEDIA}/crm-pipeline/mobile-390.png`,
      alt: "Tela real do CRM Pipeline do VendorAI",
      href: "/produtos/crm",
    },
    {
      eyebrow: "Leads",
      title: "Contexto completo do lead antes de alguém entrar em contato.",
      description:
        "Origem, histórico, informações comerciais e sinais ficam reunidos para evitar atendimento sem contexto.",
      bullets: ["Origem e histórico", "Dados do lead", "Contexto para SDR, Closer e vendedor"],
      image: `${MEDIA}/crm-leads/desktop-1440.png`,
      mobile: `${MEDIA}/crm-leads/mobile-390.png`,
      alt: "Tela real de Leads do VendorAI",
      href: "/produtos/crm",
    },
    {
      eyebrow: "Prospecção",
      title: "Encontre novos clientes antes de esperar o próximo lead.",
      description:
        "O Prospector IA organiza descoberta, enriquecimento e priorização para transformar busca ativa em uma rotina comercial estruturada.",
      bullets: ["Busca por perfil e região", "Enriquecimento de contexto", "Priorização para abordagem"],
      image: `${MEDIA}/prospector/desktop-1440.png`,
      mobile: `${MEDIA}/prospector/mobile-390.png`,
      alt: "Tela real do Prospector IA do VendorAI",
      href: "/produtos/prospeccao",
    },
    {
      eyebrow: "Atendimento",
      title: "Todas as conversas entram na mesma operação.",
      description:
        "O Omnichannel reúne atendimento e histórico para reduzir perda de contexto entre canais, pessoas e etapas do funil.",
      bullets: ["Caixa de entrada unificada", "Histórico do contato", "Distribuição e continuidade"],
      image: `${MEDIA}/omnichannel/desktop-1440.png`,
      mobile: `${MEDIA}/omnichannel/mobile-390.png`,
      alt: "Tela real do Omnichannel do VendorAI",
      href: "/produtos/omnichannel",
    },
    {
      eyebrow: "Revenue Intelligence",
      title: "A próxima venda também pode estar dentro da sua carteira.",
      description:
        "O Revenue Scout observa sinais, regras e comportamento para encontrar recompra, expansão e oportunidades que poderiam passar despercebidas.",
      bullets: ["Recompra e cross-sell", "Sinais de oportunidade", "Próxima melhor ação"],
      image: `${MEDIA}/revenue-scout/desktop-1440.png`,
      mobile: `${MEDIA}/revenue-scout/mobile-390.png`,
      alt: "Tela real do Revenue Scout do VendorAI",
      href: "/produtos/revenue-scout",
    },
    {
      eyebrow: "Inteligência Executiva",
      title: "Pergunte o que está acontecendo na operação.",
      description:
        "O JARVIS transforma dados operacionais em leitura executiva para destacar riscos, oportunidades, prioridades e mudanças relevantes.",
      bullets: ["Perguntas em linguagem natural", "Riscos e oportunidades", "Visão executiva conectada"],
      image: `${MEDIA}/jarvis/desktop-aberto.png`,
      alt: "Tela real do JARVIS do VendorAI",
      href: "/produtos/jarvis",
    },
    {
      eyebrow: "Oportunidades de Receita",
      title: "Sinais comerciais viram ações concretas.",
      description:
        "A tela de oportunidades reúne sinais detectados pela inteligência e organiza o que merece abordagem, follow-up ou expansão.",
      bullets: ["Sinais priorizados", "Motivo da oportunidade", "Próxima ação sugerida"],
      image: `${MEDIA}/revenue-opportunities/desktop-1440.png`,
      mobile: `${MEDIA}/revenue-opportunities/mobile-390.png`,
      alt: "Tela real de Oportunidades de Receita do VendorAI",
      href: "/produtos/revenue-scout",
    },
    {
      eyebrow: "Agenda Inteligente",
      title: "Próxima ação com responsável e prazo.",
      description:
        "A agenda conecta compromissos, tarefas e follow-ups ao contexto comercial para que a operação não dependa da memória de alguém.",
      bullets: ["Compromissos e tarefas", "Vínculo com leads", "Próxima ação organizada"],
      image: `${MEDIA}/agenda/desktop-1440.png`,
      mobile: `${MEDIA}/agenda/mobile-390.png`,
      alt: "Tela real da Agenda Inteligente do VendorAI",
      href: "/produtos/agenda-inteligente",
    },
    {
      eyebrow: "Analytics",
      title: "Dados comerciais precisam virar decisão.",
      description:
        "Os painéis conectam indicadores de vendas, marketing e operação para facilitar comparação, leitura de desempenho e acompanhamento de evolução.",
      bullets: ["KPIs comerciais", "Indicadores de marketing", "Comparações e relatórios"],
      image: `${MEDIA}/analytics/desktop-1440.png`,
      mobile: `${MEDIA}/analytics/mobile-390.png`,
      alt: "Tela real de Analytics do VendorAI",
      href: "/produtos/analytics",
    },
    {
      eyebrow: "Catálogo",
      title: "Produto, preço e informação comercial no mesmo fluxo da venda.",
      description:
        "O catálogo conecta itens, famílias, aplicações e informações usadas por vendedores, propostas e automações.",
      bullets: ["Produtos organizados", "Informação comercial centralizada", "Uso em propostas e atendimento"],
      image: `${MEDIA}/catalogo/desktop-1440.png`,
      mobile: `${MEDIA}/catalogo/mobile-390.png`,
      alt: "Tela real do Catálogo do VendorAI",
      href: "/produtos",
    },
    {
      eyebrow: "Financeiro & ERP",
      title: "A operação comercial não termina no fechamento.",
      description:
        "O Financeiro / ERP Hub aproxima cobrança, comissões, conciliação e indicadores da mesma jornada que originou a venda.",
      bullets: ["Cobranças e recebimentos", "Comissões", "Conciliação e indicadores"],
      image: `${MEDIA}/financeiro-erp/desktop-1440.png`,
      mobile: `${MEDIA}/financeiro-erp/mobile-390.png`,
      alt: "Tela real do Financeiro e ERP Hub do VendorAI",
      href: "/produtos/financeiro",
    },
  ],
};

const ES = {
  kicker: "Producto real, función por función",
  title: "Vea exactamente qué hace cada parte de VendorAI.",
  description:
    "Cada bloque utiliza una pantalla real del sistema. Usted entiende la función, el resultado esperado y dónde entra en la operación, sin ilustraciones genéricas.",
  cta: "Ver producto",
  items: [
    {
      eyebrow: "CRM",
      title: "Pipeline comercial con etapa, responsable y próxima acción.",
      description:
        "El CRM organiza oportunidades y mantiene el historial comercial visible para personas y agentes de IA.",
      bullets: ["Pipeline visual", "Responsable y próxima acción", "Historial compartido con los agentes"],
      image: `${MEDIA}/crm-pipeline/desktop-1440.png`,
      mobile: `${MEDIA}/crm-pipeline/mobile-390.png`,
      alt: "Pantalla real de CRM Pipeline de VendorAI",
      href: "/produtos/crm",
    },
    {
      eyebrow: "Leads",
      title: "Contexto completo del lead antes de contactar.",
      description:
        "Origen, historial, información comercial y señales quedan reunidos para evitar atención sin contexto.",
      bullets: ["Origen e historial", "Datos del lead", "Contexto para SDR, Closer y vendedor"],
      image: `${MEDIA}/crm-leads/desktop-1440.png`,
      mobile: `${MEDIA}/crm-leads/mobile-390.png`,
      alt: "Pantalla real de Leads de VendorAI",
      href: "/produtos/crm",
    },
    {
      eyebrow: "Prospección",
      title: "Encuentre nuevos clientes antes de esperar el próximo lead.",
      description:
        "Prospector IA organiza descubrimiento, enriquecimiento y priorización para convertir la búsqueda activa en una rutina comercial estructurada.",
      bullets: ["Búsqueda por perfil y región", "Enriquecimiento de contexto", "Priorización para contacto"],
      image: `${MEDIA}/prospector/desktop-1440.png`,
      mobile: `${MEDIA}/prospector/mobile-390.png`,
      alt: "Pantalla real de Prospector IA de VendorAI",
      href: "/produtos/prospeccao",
    },
    {
      eyebrow: "Atención",
      title: "Todas las conversaciones entran en la misma operación.",
      description:
        "Omnichannel reúne atención e historial para reducir pérdida de contexto entre canales, personas y etapas del embudo.",
      bullets: ["Bandeja unificada", "Historial del contacto", "Distribución y continuidad"],
      image: `${MEDIA}/omnichannel/desktop-1440.png`,
      mobile: `${MEDIA}/omnichannel/mobile-390.png`,
      alt: "Pantalla real de Omnichannel de VendorAI",
      href: "/produtos/omnichannel",
    },
    {
      eyebrow: "Revenue Intelligence",
      title: "La próxima venta también puede estar dentro de su cartera.",
      description:
        "Revenue Scout observa señales, reglas y comportamiento para encontrar recompra, expansión y oportunidades que podrían pasar desapercibidas.",
      bullets: ["Recompra y cross-sell", "Señales de oportunidad", "Próxima mejor acción"],
      image: `${MEDIA}/revenue-scout/desktop-1440.png`,
      mobile: `${MEDIA}/revenue-scout/mobile-390.png`,
      alt: "Pantalla real de Revenue Scout de VendorAI",
      href: "/produtos/revenue-scout",
    },
    {
      eyebrow: "Inteligencia Ejecutiva",
      title: "Pregunte qué está pasando en la operación.",
      description:
        "JARVIS transforma datos operativos en lectura ejecutiva para destacar riesgos, oportunidades, prioridades y cambios relevantes.",
      bullets: ["Preguntas en lenguaje natural", "Riesgos y oportunidades", "Visión ejecutiva conectada"],
      image: `${MEDIA}/jarvis/desktop-aberto.png`,
      alt: "Pantalla real de JARVIS de VendorAI",
      href: "/produtos/jarvis",
    },
    {
      eyebrow: "Oportunidades de Ingreso",
      title: "Las señales comerciales se convierten en acciones concretas.",
      description:
        "La pantalla de oportunidades reúne señales detectadas por la inteligencia y organiza qué merece contacto, seguimiento o expansión.",
      bullets: ["Señales priorizadas", "Motivo de la oportunidad", "Próxima acción sugerida"],
      image: `${MEDIA}/revenue-opportunities/desktop-1440.png`,
      mobile: `${MEDIA}/revenue-opportunities/mobile-390.png`,
      alt: "Pantalla real de Oportunidades de Ingreso de VendorAI",
      href: "/produtos/revenue-scout",
    },
    {
      eyebrow: "Agenda Inteligente",
      title: "Próxima acción con responsable y plazo.",
      description:
        "La agenda conecta compromisos, tareas y seguimientos al contexto comercial para que la operación no dependa de la memoria de alguien.",
      bullets: ["Compromisos y tareas", "Vínculo con leads", "Próxima acción organizada"],
      image: `${MEDIA}/agenda/desktop-1440.png`,
      mobile: `${MEDIA}/agenda/mobile-390.png`,
      alt: "Pantalla real de la Agenda Inteligente de VendorAI",
      href: "/produtos/agenda-inteligente",
    },
    {
      eyebrow: "Analytics",
      title: "Los datos comerciales deben convertirse en decisión.",
      description:
        "Los paneles conectan indicadores de ventas, marketing y operación para facilitar comparación, lectura de desempeño y seguimiento de evolución.",
      bullets: ["KPIs comerciales", "Indicadores de marketing", "Comparaciones e informes"],
      image: `${MEDIA}/analytics/desktop-1440.png`,
      mobile: `${MEDIA}/analytics/mobile-390.png`,
      alt: "Pantalla real de Analytics de VendorAI",
      href: "/produtos/analytics",
    },
    {
      eyebrow: "Catálogo",
      title: "Producto, precio e información comercial en el mismo flujo de venta.",
      description:
        "El catálogo conecta ítems, familias, aplicaciones e información usada por vendedores, propuestas y automatizaciones.",
      bullets: ["Productos organizados", "Información comercial centralizada", "Uso en propuestas y atención"],
      image: `${MEDIA}/catalogo/desktop-1440.png`,
      mobile: `${MEDIA}/catalogo/mobile-390.png`,
      alt: "Pantalla real del Catálogo de VendorAI",
      href: "/produtos",
    },
    {
      eyebrow: "Finanzas & ERP",
      title: "La operación comercial no termina en el cierre.",
      description:
        "Financeiro / ERP Hub acerca cobros, comisiones, conciliación e indicadores a la misma jornada que originó la venta.",
      bullets: ["Cobros y recibos", "Comisiones", "Conciliación e indicadores"],
      image: `${MEDIA}/financeiro-erp/desktop-1440.png`,
      mobile: `${MEDIA}/financeiro-erp/mobile-390.png`,
      alt: "Pantalla real de Finanzas y ERP Hub de VendorAI",
      href: "/produtos/financeiro",
    },
  ],
};

function modernPath(path: string) {
  return path.replace(/\.png$/i, ".webp");
}

type ProductScreenItem = {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  image: string;
  mobile?: string;
  alt: string;
  href: string;
};

function ProductScreenImage({ item }: { item: ProductScreenItem }) {
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    setFallback(false);
  }, [item.image]);

  if (fallback) {
    return (
      <picture className="block h-full w-full">
        {item.mobile ? <source media="(max-width: 640px)" srcSet={item.mobile} /> : null}
        <img
          src={item.image}
          alt={item.alt}
          loading="eager"
          decoding="async"
          className="h-full w-full object-contain object-top"
        />
      </picture>
    );
  }

  return (
    <picture className="block h-full w-full">
      {item.mobile ? (
        <source
          type="image/webp"
          media="(max-width: 640px)"
          srcSet={modernPath(item.mobile)}
        />
      ) : null}
      <source type="image/webp" srcSet={modernPath(item.image)} />
      <img
        src={item.image}
        alt={item.alt}
        loading="eager"
        decoding="async"
        onError={() => setFallback(true)}
        className="h-full w-full object-contain object-top"
      />
    </picture>
  );
}

function prefetchScreen(item: ProductScreenItem) {
  if (typeof window === "undefined") return;
  const image = new Image();
  image.decoding = "async";
  image.src = modernPath(item.image);
}

export default function DistributedProductScreens() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = copy.items[activeIndex] as ProductScreenItem;

  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-[#070b12] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:48px_48px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-48 top-40 h-[420px] w-[420px] rounded-full bg-orange-500/10 blur-[110px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-56 bottom-20 h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[120px]"
      />

      <div className="relative mx-auto max-w-[1480px] px-4 pb-16 pt-16 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8 lg:pb-24 lg:pt-24">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end lg:gap-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-300">
              <Sparkles className="h-4 w-4" />
              {copy.kicker}
            </div>
            <h2 className="vendor-display mt-6 max-w-4xl text-4xl font-semibold leading-[1.02] tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
              {copy.title}
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
            {copy.description}
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:mt-14 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
          <div
            role="tablist"
            aria-label={copy.kicker}
            className="overflow-x-auto rounded-[28px] border border-white/10 bg-white/[0.035] p-3 backdrop-blur-xl lg:max-h-[730px] lg:overflow-y-auto"
          >
            <div className="mb-3 flex items-center justify-between gap-3 px-2 py-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {copy.items.length} {isSpanish ? "módulos" : "módulos"}
              </span>
              <span className="rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
                {isSpanish ? "Producto real" : "Produto real"}
              </span>
            </div>

            <div className="grid grid-flow-col auto-cols-[minmax(185px,1fr)] gap-2 lg:grid-flow-row lg:auto-cols-auto">
              {copy.items.map((rawItem, index) => {
                const item = rawItem as ProductScreenItem;
                const selected = index === activeIndex;

                return (
                  <button
                    key={item.title}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveIndex(index)}
                    onMouseEnter={() => prefetchScreen(item)}
                    onFocus={() => prefetchScreen(item)}
                    className={\`group rounded-2xl border px-4 py-3.5 text-left transition ${
                      selected
                        ? "border-orange-400/30 bg-orange-400/10 shadow-[0_12px_35px_rgba(249,115,22,0.08)]"
                        : "border-transparent bg-white/[0.025] hover:border-white/10 hover:bg-white/[0.05]"
                    }\`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={\`text-[10px] font-bold uppercase tracking-[0.14em] ${
                        selected ? "text-orange-300" : "text-slate-500"
                      }\`}>
                        {String(index + 1).padStart(2, "0")} · {item.eyebrow}
                      </span>
                      <span className={\`h-1.5 w-1.5 rounded-full ${
                        selected ? "bg-orange-400" : "bg-slate-700"
                      }\`} />
                    </div>
                    <p className={\`mt-2 line-clamp-2 text-sm font-semibold leading-5 ${
                      selected ? "text-white" : "text-slate-300"
                    }\`}>
                      {item.title}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 lg:sticky lg:top-28 lg:self-start">
            <AnimatePresence mode="wait">
              <motion.article
                key={active.title}
                initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.992 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.995 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
                className="overflow-hidden rounded-[30px] border border-white/10 bg-[#0b111c]/95 shadow-[0_34px_100px_rgba(0,0,0,0.38)] backdrop-blur-2xl"
              >
                <div className="grid xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,.7fr)]">
                  <div className="min-w-0 border-b border-white/10 xl:border-b-0 xl:border-r">
                    <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-black/20 px-4 py-3.5 sm:px-5">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1.5" aria-hidden="true">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-400">
                          appvendorai.com · {active.eyebrow}
                        </span>
                      </div>
                      <span className="hidden rounded-full border border-emerald-400/15 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300 sm:inline-flex">
                        {isSpanish ? "Pantalla real" : "Tela real"}
                      </span>
                    </div>

                    <div className="relative aspect-[9/12] overflow-hidden bg-[#05080d] sm:aspect-[16/10]">
                      <ProductScreenImage item={active} />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#05080d]/35 to-transparent" />
                    </div>
                  </div>

                  <div className="flex flex-col justify-center p-6 sm:p-8 xl:p-9">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">
                      {active.eyebrow}
                    </p>
                    <h3 className="vendor-display mt-4 text-3xl font-semibold leading-[1.06] tracking-[-0.04em] text-white sm:text-4xl">
                      {active.title}
                    </h3>
                    <p className="mt-5 text-sm leading-7 text-slate-300 sm:text-base">
                      {active.description}
                    </p>

                    <div className="mt-6 grid gap-2.5">
                      {active.bullets.map((bullet) => (
                        <div
                          key={bullet}
                          className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-3.5 py-3 text-sm text-slate-200"
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span>{bullet}</span>
                        </div>
                      ))}
                    </div>

                    <Link
                      href={active.href}
                      className="mt-7 inline-flex items-center gap-2 self-start text-sm font-semibold text-orange-300 transition hover:text-orange-200"
                    >
                      {copy.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </motion.article>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
