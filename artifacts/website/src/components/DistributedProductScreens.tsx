import { Link } from "wouter";
import { motion } from "framer-motion";
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

export default function DistributedProductScreens() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <section className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 pb-8 pt-20 text-center lg:px-8 lg:pt-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700">
          <Sparkles className="h-4 w-4" /> {copy.kicker}
        </div>
        <h2 className="mx-auto mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.045em] text-slate-950 md:text-5xl">
          {copy.title}
        </h2>
        <p className="mx-auto mt-5 max-w-3xl text-lg leading-8 text-slate-600">{copy.description}</p>
      </div>

      <div>
        {copy.items.map((item, index) => {
          const imageFirst = index % 2 === 1;
          const bg = index % 3 === 1 ? "bg-[#fbfaf7]" : index % 3 === 2 ? "bg-slate-50" : "bg-white";
          const mobile = "mobile" in item ? item.mobile : undefined;

          return (
            <motion.article
              key={item.title}
              className={`border-t border-slate-200 ${bg}`}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.12 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            >
              <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-16 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-20">
                <div className={imageFirst ? "lg:order-2" : ""}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">{item.eyebrow}</p>
                  <h3 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-slate-950 md:text-4xl">
                    {item.title}
                  </h3>
                  <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">{item.description}</p>

                  <div className="mt-6 space-y-3">
                    {item.bullets.map((bullet) => (
                      <div key={bullet} className="flex items-center gap-3 text-sm text-slate-700">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                        {bullet}
                      </div>
                    ))}
                  </div>

                  <Link
                    href={item.href}
                    className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-orange-700 transition hover:text-orange-600"
                  >
                    {copy.cta} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>

                <motion.div
                  className={imageFirst ? "lg:order-1" : ""}
                  initial={{ opacity: 0, x: imageFirst ? -28 : 28, scale: 0.985 }}
                  whileInView={{ opacity: 1, x: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.65, delay: 0.08, ease: "easeOut" }}
                >
                  <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)] transition duration-500 hover:-translate-y-1 hover:shadow-[0_32px_90px_rgba(15,23,42,0.14)]">
                    <picture>
                      {mobile ? <source type="image/webp" media="(max-width: 640px)" srcSet={modernPath(mobile)} /> : null}
                      <source type="image/webp" srcSet={modernPath(item.image)} />
                      {mobile ? <source media="(max-width: 640px)" srcSet={mobile} /> : null}
                      <img
                        src={item.image}
                        alt={item.alt}
                        loading="lazy"
                        decoding="async"
                        className="aspect-[16/9] w-full object-cover object-top"
                      />
                    </picture>
                  </div>
                </motion.div>
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
