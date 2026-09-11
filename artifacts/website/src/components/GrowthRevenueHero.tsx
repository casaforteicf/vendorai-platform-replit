import { Link } from "wouter";
import {
  ArrowRight,
  BarChart3,
  Check,
  Megaphone,
  Radar,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { usePublicCountry } from "@/lib/publicCountry";

const PT = {
  badge: "Plataforma de crescimento e receita com IA",
  title: "Gere demanda. Encontre clientes. Venda mais.",
  accent: "Faça a receita voltar.",
  description:
    "O VendorAI conecta marketing, prospecção, atendimento, CRM, vendas, pós-venda e inteligência em um único ciclo que gera, converte e expande receita.",
  primary: "Testar 5 dias grátis",
  secondary: "Ver todos os produtos",
  benefits: [
    "Sem limite de usuários",
    "5 dias grátis por mês",
    "Implantação autoguiada",
    "Suporte em português",
  ],
  enginesIntro: "3 motores trabalham juntos",
  engines: [
    {
      icon: Megaphone,
      title: "Marketing & Inbound",
      text: "Gera demanda com Ads, conteúdo, sites e landing pages.",
    },
    {
      icon: Radar,
      title: "Prospector & Outbound",
      text: "Encontra empresas, enriquece dados e prioriza novos clientes.",
    },
    {
      icon: Target,
      title: "Revenue Intelligence",
      text: "Encontra recompra, expansão, churn e próxima melhor ação.",
    },
  ],
  proofBadge: "Telas reais do VendorAI",
  proofTitle: "Produto real. Operação real.",
  proofSubtitle: "Algumas das telas que já fazem parte da plataforma.",
  screenshots: {
    crm: {
      title: "CRM & Pipeline",
      text: "Oportunidades, etapas e próxima ação.",
      alt: "Tela real do CRM e pipeline do VendorAI",
    },
    prospector: {
      title: "Prospector IA",
      text: "Descoberta e priorização de novos clientes.",
      alt: "Tela real do Prospector IA do VendorAI",
    },
    revenue: {
      title: "Revenue Scout",
      text: "Recompra e novas oportunidades na carteira.",
      alt: "Tela real do Revenue Scout do VendorAI",
    },
    omnichannel: {
      title: "Omnichannel",
      text: "Atendimento e conversas em um único lugar.",
      alt: "Tela real do Omnichannel do VendorAI",
    },
    jarvis: {
      title: "JARVIS",
      text: "Inteligência executiva sobre toda a operação.",
      alt: "Tela real do JARVIS do VendorAI",
    },
  },
};

const ES = {
  badge: "Plataforma de crecimiento e ingresos con IA",
  title: "Genere demanda. Encuentre clientes. Venda más.",
  accent: "Haga que los ingresos vuelvan.",
  description:
    "VendorAI conecta marketing, prospección, atención, CRM, ventas, posventa e inteligencia en un único ciclo que genera, convierte y expande ingresos.",
  primary: "Probar 5 días gratis",
  secondary: "Ver todos los productos",
  benefits: [
    "Sin límite de usuarios",
    "5 días gratis por mes",
    "Implementación autoguiada",
    "Soporte en español",
  ],
  enginesIntro: "3 motores trabajan juntos",
  engines: [
    {
      icon: Megaphone,
      title: "Marketing & Inbound",
      text: "Genera demanda con Ads, contenido, sitios y landing pages.",
    },
    {
      icon: Radar,
      title: "Prospector & Outbound",
      text: "Encuentra empresas, enriquece datos y prioriza nuevos clientes.",
    },
    {
      icon: Target,
      title: "Revenue Intelligence",
      text: "Encuentra recompra, expansión, churn y la próxima mejor acción.",
    },
  ],
  proofBadge: "Pantallas reales de VendorAI",
  proofTitle: "Producto real. Operación real.",
  proofSubtitle: "Algunas de las pantallas que ya forman parte de la plataforma.",
  screenshots: {
    crm: {
      title: "CRM & Pipeline",
      text: "Oportunidades, etapas y próxima acción.",
      alt: "Pantalla real del CRM y pipeline de VendorAI",
    },
    prospector: {
      title: "Prospector IA",
      text: "Descubrimiento y priorización de nuevos clientes.",
      alt: "Pantalla real del Prospector IA de VendorAI",
    },
    revenue: {
      title: "Revenue Scout",
      text: "Recompra y nuevas oportunidades en la cartera.",
      alt: "Pantalla real de Revenue Scout de VendorAI",
    },
    omnichannel: {
      title: "Omnichannel",
      text: "Atención y conversaciones en un único lugar.",
      alt: "Pantalla real de Omnichannel de VendorAI",
    },
    jarvis: {
      title: "JARVIS",
      text: "Inteligencia ejecutiva sobre toda la operación.",
      alt: "Pantalla real de JARVIS de VendorAI",
    },
  },
};

const MEDIA = "/media/vendorai-official";

export default function GrowthRevenueHero() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <section className="relative overflow-hidden border-b border-slate-200/80 bg-[#fbfaf7] text-slate-950">
      <div className="pointer-events-none absolute -left-40 top-10 h-96 w-96 rounded-full bg-orange-200/45 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-0 h-[420px] w-[420px] rounded-full bg-sky-100/65 blur-3xl" />

      <div className="relative mx-auto grid max-w-[1440px] gap-12 px-6 py-16 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:px-8 lg:py-20 xl:gap-16">
        <div className="max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/85 px-4 py-2 text-sm font-semibold text-orange-700 shadow-sm">
            <Sparkles className="h-4 w-4" /> {copy.badge}
          </div>

          <h1 className="text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-slate-950 sm:text-6xl lg:text-[68px] xl:text-[76px]">
            {copy.title}
            <span className="mt-2 block text-orange-600">{copy.accent}</span>
          </h1>

          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl">
            {copy.description}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/demo"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-600 px-6 py-4 font-semibold text-white shadow-[0_12px_30px_rgba(234,88,12,0.20)] transition hover:bg-orange-500"
            >
              {copy.primary} <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/produtos"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-6 py-4 font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            >
              {copy.secondary}
            </Link>
          </div>

          <div className="mt-6 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            {copy.benefits.map((benefit, index) => (
              <span key={benefit} className="inline-flex items-center gap-2">
                {index === 0 ? (
                  <UsersRound className="h-4 w-4 text-emerald-600" />
                ) : index === 1 ? (
                  <BarChart3 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Check className="h-4 w-4 text-emerald-600" />
                )}
                {benefit}
              </span>
            ))}
          </div>

          <div className="mt-9">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              {copy.enginesIntro}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {copy.engines.map((engine) => {
                const Icon = engine.icon;
                return (
                  <div
                    key={engine.title}
                    className="rounded-2xl border border-slate-200 bg-white/90 p-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
                  >
                    <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{engine.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{engine.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-orange-500" /> {copy.proofBadge}
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-slate-950 sm:text-3xl">
                {copy.proofTitle}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{copy.proofSubtitle}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <article className="group overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.10)] sm:col-span-2">
              <picture>
                <source
                  media="(max-width: 640px)"
                  srcSet={`${MEDIA}/crm-pipeline/mobile-390.png`}
                />
                <img
                  src={`${MEDIA}/crm-pipeline/desktop-1440.png`}
                  alt={copy.screenshots.crm.alt}
                  loading="eager"
                  fetchPriority="high"
                  className="aspect-[16/8.2] w-full object-cover object-top transition duration-500 group-hover:scale-[1.01]"
                />
              </picture>
              <div className="flex items-start justify-between gap-4 border-t border-slate-100 px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{copy.screenshots.crm.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{copy.screenshots.crm.text}</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  Real
                </span>
              </div>
            </article>

            <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.07)]">
              <picture>
                <source media="(max-width: 640px)" srcSet={`${MEDIA}/prospector/mobile-390.png`} />
                <img
                  src={`${MEDIA}/prospector/desktop-1440.png`}
                  alt={copy.screenshots.prospector.alt}
                  loading="eager"
                  className="aspect-[16/9.5] w-full object-cover object-top transition duration-500 group-hover:scale-[1.015]"
                />
              </picture>
              <div className="border-t border-slate-100 px-3.5 py-3">
                <p className="text-sm font-semibold text-slate-900">{copy.screenshots.prospector.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{copy.screenshots.prospector.text}</p>
              </div>
            </article>

            <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.07)]">
              <picture>
                <source media="(max-width: 640px)" srcSet={`${MEDIA}/revenue-scout/mobile-390.png`} />
                <img
                  src={`${MEDIA}/revenue-scout/desktop-1440.png`}
                  alt={copy.screenshots.revenue.alt}
                  loading="eager"
                  className="aspect-[16/9.5] w-full object-cover object-top transition duration-500 group-hover:scale-[1.015]"
                />
              </picture>
              <div className="border-t border-slate-100 px-3.5 py-3">
                <p className="text-sm font-semibold text-slate-900">{copy.screenshots.revenue.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{copy.screenshots.revenue.text}</p>
              </div>
            </article>

            <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.07)]">
              <picture>
                <source media="(max-width: 640px)" srcSet={`${MEDIA}/omnichannel/mobile-390.png`} />
                <img
                  src={`${MEDIA}/omnichannel/desktop-1440.png`}
                  alt={copy.screenshots.omnichannel.alt}
                  loading="lazy"
                  className="aspect-[16/9.5] w-full object-cover object-top transition duration-500 group-hover:scale-[1.015]"
                />
              </picture>
              <div className="border-t border-slate-100 px-3.5 py-3">
                <p className="text-sm font-semibold text-slate-900">{copy.screenshots.omnichannel.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{copy.screenshots.omnichannel.text}</p>
              </div>
            </article>

            <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.07)]">
              <img
                src={`${MEDIA}/jarvis/desktop-aberto.png`}
                alt={copy.screenshots.jarvis.alt}
                loading="lazy"
                className="aspect-[16/9.5] w-full object-cover object-top transition duration-500 group-hover:scale-[1.015]"
              />
              <div className="border-t border-slate-100 px-3.5 py-3">
                <p className="text-sm font-semibold text-slate-900">{copy.screenshots.jarvis.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{copy.screenshots.jarvis.text}</p>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
