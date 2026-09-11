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
  proofBadge: "Tela real do VendorAI",
  proofTitle: "CRM e Pipeline em operação",
  proofText: "A primeira dobra mostra apenas o núcleo comercial. As demais telas aparecem ao longo do site, junto da explicação de cada produto.",
  proofAlt: "Tela real do CRM e pipeline do VendorAI",
  proofLink: "Conhecer o CRM",
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
  proofBadge: "Pantalla real de VendorAI",
  proofTitle: "CRM y Pipeline en operación",
  proofText: "La primera pantalla muestra solo el núcleo comercial. Las demás pantallas aparecen a lo largo del sitio, junto a la explicación de cada producto.",
  proofAlt: "Pantalla real del CRM y pipeline de VendorAI",
  proofLink: "Conocer el CRM",
};

const MEDIA = "/media/vendorai-official";

export default function GrowthRevenueHero() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <section className="relative overflow-hidden border-b border-slate-200/80 bg-[#fbfaf7] text-slate-950">
      <div className="pointer-events-none absolute -left-40 top-10 h-96 w-96 rounded-full bg-orange-200/45 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-0 h-[420px] w-[420px] rounded-full bg-sky-100/65 blur-3xl" />

      <div className="relative mx-auto grid max-w-[1440px] gap-12 px-6 py-16 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:px-8 lg:py-20 xl:gap-16">
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
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-orange-600">
                  <Sparkles className="h-3.5 w-3.5" /> {copy.proofBadge}
                </div>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-slate-950 sm:text-2xl">
                  {copy.proofTitle}
                </h2>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                Real
              </span>
            </div>

            <picture>
              <source media="(max-width: 640px)" srcSet={`${MEDIA}/crm-pipeline/mobile-390.png`} />
              <img
                src={`${MEDIA}/crm-pipeline/desktop-1440.png`}
                alt={copy.proofAlt}
                width={1440}
                height={810}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className="aspect-[16/9] w-full object-cover object-top"
              />
            </picture>

            <div className="flex flex-col gap-4 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-sm leading-6 text-slate-600">{copy.proofText}</p>
              <Link
                href="/produtos/crm"
                className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-orange-700 hover:text-orange-600"
              >
                {copy.proofLink} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
