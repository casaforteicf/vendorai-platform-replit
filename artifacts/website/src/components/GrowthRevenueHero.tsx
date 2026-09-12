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
  eyebrow: "Revenue OS com IA para empresas que querem crescer",
  title: "Marketing, vendas e atendimento trabalhando como um só sistema.",
  accent: "Mais demanda. Mais conversão. Mais receita.",
  description:
    "O VendorAI transforma dados, canais e equipes em um ciclo comercial contínuo: cria campanhas, encontra oportunidades, atende, vende, acompanha e indica a próxima melhor ação.",
  primary: "Testar 5 dias grátis",
  secondary: "Explorar a plataforma",
  proof: "Sem limite de usuários · implantação autoguiada · suporte em português",
  enginesIntro: "Um sistema, três motores de crescimento",
  engines: [
    { icon: Megaphone, title: "Atrair", text: "Ads, conteúdo, social, sites e landing pages." },
    { icon: Radar, title: "Encontrar", text: "Prospecta, enriquece e prioriza novas oportunidades." },
    { icon: Target, title: "Converter e expandir", text: "CRM, agentes de IA, follow-up e Revenue Intelligence." },
  ],
  previewLabel: "VendorAI em operação",
  previewTitle: "Da visita ao fechamento, tudo conectado",
  previewText: "Veja pipeline, contexto comercial e próxima ação em uma única experiência.",
  previewLink: "Conhecer o CRM",
};

const ES = {
  eyebrow: "Revenue OS con IA para empresas que quieren crecer",
  title: "Marketing, ventas y atención trabajando como un solo sistema.",
  accent: "Más demanda. Más conversión. Más ingresos.",
  description:
    "VendorAI transforma datos, canales y equipos en un ciclo comercial continuo: crea campañas, encuentra oportunidades, atiende, vende, acompaña e indica la próxima mejor acción.",
  primary: "Probar 5 días gratis",
  secondary: "Explorar la plataforma",
  proof: "Sin límite de usuarios · implementación autoguiada · soporte en español",
  enginesIntro: "Un sistema, tres motores de crecimiento",
  engines: [
    { icon: Megaphone, title: "Atraer", text: "Ads, contenido, social, sitios y landing pages." },
    { icon: Radar, title: "Encontrar", text: "Prospecta, enriquece y prioriza nuevas oportunidades." },
    { icon: Target, title: "Convertir y expandir", text: "CRM, agentes de IA, follow-up y Revenue Intelligence." },
  ],
  previewLabel: "VendorAI en operación",
  previewTitle: "De la visita al cierre, todo conectado",
  previewText: "Vea pipeline, contexto comercial y próxima acción en una única experiencia.",
  previewLink: "Conocer el CRM",
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
            <Link href="/produtos" className="vendor-cta-secondary inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-7 font-semibold text-slate-800">
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
              <Link href="/produtos/crm" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-orange-700 hover:text-orange-600">
                {copy.previewLink} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="vendor-floating-stat vendor-floating-stat-left hidden lg:flex">
            <BarChart3 className="h-4 w-4 text-orange-600" />
            <div><strong>Revenue Intelligence</strong><span>Próxima melhor ação</span></div>
          </div>
          <div className="vendor-floating-stat vendor-floating-stat-right hidden xl:flex">
            <UsersRound className="h-4 w-4 text-emerald-600" />
            <div><strong>CRM + IA</strong><span>Contexto em tempo real</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
