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
  WandSparkles,
} from "lucide-react";
import { usePublicCountry } from "@/lib/publicCountry";

const PT = {
  eyebrow: "Ferramentas conectadas ao resultado do seu negócio",
  title: "Seu negócio não precisa de mais ferramentas.",
  accent: "Precisa que elas trabalhem juntas.",
  description:
    "O VendorAI conecta marketing, prospecção, atendimento, CRM, follow-up e inteligência em uma única operação: encontra oportunidades, cria a próxima ação, acompanha a execução e mede o que virou resultado.",
  primary: "Ver funcionando no meu negócio",
  secondary: "Conhecer a operação conectada",
  proof: "5 dias grátis · sem limite de usuários · suporte em português",
  enginesIntro: "Uma operação conectada, do primeiro sinal à próxima venda",
  engines: [
    { icon: Radar, title: "Encontrar e atrair", text: "Oportunidades, visitantes, conteúdo, social, campanhas, sites e LPs." },
    { icon: Target, title: "Converter e recuperar", text: "CRM, atendimento, agentes de IA, pipeline, follow-up e reativação." },
    { icon: Megaphone, title: "Reter e escalar", text: "Pós-venda, Revenue Scout, inteligência e decisões baseadas em resultado." },
  ],
  previewLabel: "VendorAI em operação",
  previewTitle: "Do sinal à execução. Da execução ao resultado.",
  previewText: "Veja contexto comercial, pipeline e próxima ação trabalhando juntos — sem depender de ferramentas isoladas.",
  previewLink: "Ver a operação conectada",
};

const ES = {
  eyebrow: "Herramientas conectadas al resultado de tu negocio",
  title: "Tu negocio no necesita más herramientas.",
  accent: "Necesita que trabajen juntas.",
  description:
    "VendorAI conecta marketing, prospección, atención, CRM, seguimiento e inteligencia en una sola operación: encuentra oportunidades, crea la próxima acción, acompaña la ejecución y mide lo que se convierte en resultado.",
  primary: "Verlo funcionando en mi negocio",
  secondary: "Conocer la operación conectada",
  proof: "5 días gratis · sin límite de usuarios · soporte en español",
  enginesIntro: "Una operación conectada, desde la primera señal hasta la próxima venta",
  engines: [
    { icon: Radar, title: "Encontrar y atraer", text: "Oportunidades, visitantes, contenido, social, campañas, sitios y LPs." },
    { icon: Target, title: "Convertir y recuperar", text: "CRM, atención, agentes de IA, pipeline, seguimiento y reactivación." },
    { icon: Megaphone, title: "Retener y escalar", text: "Posventa, Revenue Scout, inteligencia y decisiones basadas en resultados." },
  ],
  previewLabel: "VendorAI en operación",
  previewTitle: "De la señal a la ejecución. De la ejecución al resultado.",
  previewText: "Vea contexto comercial, pipeline y próxima acción trabajando juntos, sin depender de herramientas aisladas.",
  previewLink: "Ver la operación conectada",
};

const MEDIA = "/media/vendorai-official";

export default function GrowthRevenueHero() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <section className="vendor-home-hero relative overflow-hidden border-b border-slate-200/70 text-slate-950">
      <div className="vendor-home-grid" aria-hidden="true" />
      <div className="vendor-home-orb vendor-home-orb-orange" aria-hidden="true" />
      <div className="vendor-home-orb vendor-home-orb-blue" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-[1480px] gap-14 px-5 pb-16 pt-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8 lg:pb-24 lg:pt-20 xl:gap-20">
        <div className="max-w-3xl">
          <div className="vendor-hero-eyebrow mb-7 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold">
            <WandSparkles className="h-4 w-4" />
            {copy.eyebrow}
          </div>

          <h1 className="vendor-display text-[clamp(2.7rem,5.4vw,5.5rem)] font-semibold leading-[0.94] tracking-[-0.065em] text-[#111827]">
            {copy.title}
            <span className="vendor-hero-accent mt-4 block">{copy.accent}</span>
          </h1>

          <p className="mt-8 max-w-2xl text-[17px] leading-8 text-slate-600 sm:text-xl sm:leading-9">
            {copy.description}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/demo" className="vendor-cta-primary group inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-7 font-semibold text-white">
              {copy.primary}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link href="/lp/ferramentas-conectadas" className="vendor-cta-secondary inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-7 font-semibold text-slate-800">
              {copy.secondary}
            </Link>
          </div>

          <div className="mt-5 flex items-start gap-2 text-sm leading-6 text-slate-500">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{copy.proof}</span>
          </div>

          <div className="mt-10">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.19em] text-slate-400">{copy.enginesIntro}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {copy.engines.map((engine, index) => {
                const Icon = engine.icon;
                return (
                  <div key={engine.title} className="vendor-engine-card rounded-[20px] p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-semibold text-slate-300">0{index + 1}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-950">{engine.title}</p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">{engine.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="relative min-w-0 lg:pl-2">
          <div className="vendor-product-window overflow-hidden rounded-[30px]">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200/70 bg-white/90 px-5 py-4 backdrop-blur-xl sm:px-6">
              <div>
                <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.17em] text-orange-600">
                  <Sparkles className="h-3.5 w-3.5" /> {copy.previewLabel}
                </div>
                <h2 className="mt-2 text-lg font-semibold tracking-[-0.025em] text-slate-950 sm:text-2xl">{copy.previewTitle}</h2>
              </div>
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
              </span>
            </div>

            <picture>
              <source type="image/webp" media="(max-width: 640px)" srcSet={`${MEDIA}/crm-pipeline/mobile-390.webp`} />
              <source type="image/webp" srcSet={`${MEDIA}/crm-pipeline/desktop-1440.webp`} />
              <source media="(max-width: 640px)" srcSet={`${MEDIA}/crm-pipeline/mobile-390.png`} />
              <img
                src={`${MEDIA}/crm-pipeline/desktop-1440.png`}
                alt={copy.previewTitle}
                width={1440}
                height={810}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className="aspect-[16/9] w-full object-cover object-top"
              />
            </picture>

            <div className="flex flex-col gap-4 border-t border-slate-200/70 bg-white/95 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="max-w-xl text-sm leading-6 text-slate-600">{copy.previewText}</p>
              <Link href="/lp/ferramentas-conectadas" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-orange-700 hover:text-orange-600">
                {copy.previewLink} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="vendor-floating-stat vendor-floating-stat-left hidden lg:flex">
            <BarChart3 className="h-4 w-4 text-orange-600" />
            <div><strong>Inteligência de resultado</strong><span>Próxima melhor ação</span></div>
          </div>
          <div className="vendor-floating-stat vendor-floating-stat-right hidden xl:flex">
            <UsersRound className="h-4 w-4 text-emerald-600" />
            <div><strong>Operação conectada</strong><span>Contexto em tempo real</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}