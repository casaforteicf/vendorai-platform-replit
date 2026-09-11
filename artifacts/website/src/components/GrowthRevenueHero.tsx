import { Link } from "wouter";
import { ArrowRight, BarChart3, Megaphone, Radar, Sparkles, Target, UsersRound } from "lucide-react";
import { usePublicCountry } from "@/lib/publicCountry";

const PT = {
  badge: "Plataforma de crescimento e receita com IA",
  title: "Gere demanda. Encontre clientes. Venda mais.",
  accent: "E faça a receita voltar.",
  description:
    "O VendorAI conecta marketing, prospecção, atendimento, CRM, vendas, pós-venda e inteligência em um único ciclo que gera, converte e expande receita.",
  primary: "Testar 5 dias grátis",
  secondary: "Explorar produtos",
  note1: "Sem limite de usuários",
  note2: "5 dias grátis por mês",
  note3: "Implantação autoguiada",
  enginesTitle: "3 motores de crescimento. Uma só inteligência.",
  enginesSubtitle: "A receita pode nascer antes do lead, fora do inbound ou dentro da sua própria carteira.",
  engines: [
    {
      icon: Megaphone,
      label: "1. Gerar demanda",
      title: "Marketing & Inbound",
      description: "Conteúdo, mídia, sites e landing pages para criar procura e capturar intenção.",
      chips: ["Ads", "Conteúdo", "Sites & LPs"],
    },
    {
      icon: Radar,
      label: "2. Encontrar demanda",
      title: "Prospector & Outbound",
      description: "Descubra empresas, enriqueça dados, identifique fit e priorize quem abordar.",
      chips: ["Prospector IA", "Enriquecimento", "Scoring"],
    },
    {
      icon: Target,
      label: "3. Expandir receita",
      title: "Revenue Intelligence",
      description: "Encontre recompra, upsell, cross-sell, risco de churn e próxima melhor ação.",
      chips: ["Revenue Scout", "Churn", "NBA"],
    },
  ],
  core: "Tudo converge no VendorAI",
  flow: ["Captar", "Entender", "Converter", "Vender", "Reter", "Aprender"],
};

const ES = {
  badge: "Plataforma de crecimiento e ingresos con IA",
  title: "Genere demanda. Encuentre clientes. Venda más.",
  accent: "Y haga que los ingresos vuelvan.",
  description:
    "VendorAI conecta marketing, prospección, atención, CRM, ventas, posventa e inteligencia en un único ciclo que genera, convierte y expande ingresos.",
  primary: "Probar 5 días gratis",
  secondary: "Explorar productos",
  note1: "Sin límite de usuarios",
  note2: "5 días gratis por mes",
  note3: "Implementación autoguiada",
  enginesTitle: "3 motores de crecimiento. Una sola inteligencia.",
  enginesSubtitle: "Los ingresos pueden nacer antes del lead, fuera del inbound o dentro de su propia cartera.",
  engines: [
    {
      icon: Megaphone,
      label: "1. Generar demanda",
      title: "Marketing & Inbound",
      description: "Contenido, medios, sitios y landing pages para crear demanda y capturar intención.",
      chips: ["Ads", "Contenido", "Sites & LPs"],
    },
    {
      icon: Radar,
      label: "2. Encontrar demanda",
      title: "Prospector & Outbound",
      description: "Descubra empresas, enriquezca datos, identifique fit y priorice a quién abordar.",
      chips: ["Prospector IA", "Enriquecimiento", "Scoring"],
    },
    {
      icon: Target,
      label: "3. Expandir ingresos",
      title: "Revenue Intelligence",
      description: "Encuentre recompra, upsell, cross-sell, riesgo de churn y la próxima mejor acción.",
      chips: ["Revenue Scout", "Churn", "NBA"],
    },
  ],
  core: "Todo converge en VendorAI",
  flow: ["Captar", "Entender", "Convertir", "Vender", "Retener", "Aprender"],
};

export default function GrowthRevenueHero() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;

  return (
    <section className="relative overflow-hidden bg-[#07101f] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(59,130,246,0.20),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(249,115,22,0.14),transparent_26%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.10),transparent_34%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8 lg:py-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-4 py-2 text-sm font-medium text-blue-100">
            <Sparkles className="h-4 w-4" /> {copy.badge}
          </div>

          <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl xl:text-[78px]">
            {copy.title}
            <span className="mt-2 block bg-gradient-to-r from-blue-300 via-sky-400 to-orange-300 bg-clip-text text-transparent">
              {copy.accent}
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">{copy.description}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/demo"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-6 py-4 font-semibold text-white shadow-[0_12px_36px_rgba(249,115,22,0.25)] transition hover:bg-orange-400"
            >
              {copy.primary} <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/produtos"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-4 font-semibold text-white transition hover:bg-white/10"
            >
              {copy.secondary}
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-400">
            <span className="inline-flex items-center gap-2"><UsersRound className="h-4 w-4 text-emerald-400" />{copy.note1}</span>
            <span className="inline-flex items-center gap-2"><BarChart3 className="h-4 w-4 text-emerald-400" />{copy.note2}</span>
            <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-emerald-400" />{copy.note3}</span>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[#0d1728]/90 p-5 shadow-2xl shadow-black/30 backdrop-blur sm:p-6">
          <div className="mb-5">
            <p className="text-lg font-semibold text-white">{copy.enginesTitle}</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">{copy.enginesSubtitle}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {copy.engines.map((engine) => {
              const Icon = engine.icon;
              return (
                <div key={engine.title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-orange-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{engine.label}</p>
                  <h2 className="mt-2 text-base font-semibold text-white">{engine.title}</h2>
                  <p className="mt-2 min-h-[72px] text-sm leading-6 text-slate-400">{engine.description}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {engine.chips.map((chip) => (
                      <span key={chip} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">{chip}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-blue-300/15 bg-blue-400/[0.07] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-100">
              <Sparkles className="h-4 w-4 text-blue-300" /> {copy.core}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {copy.flow.map((step, index) => (
                <div key={step} className="relative rounded-xl border border-white/10 bg-[#0a1322] px-2 py-3 text-center text-xs font-medium text-slate-200">
                  <span className="mb-1 block text-[10px] text-slate-600">0{index + 1}</span>
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
