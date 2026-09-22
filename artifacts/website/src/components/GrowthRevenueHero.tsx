import { Link } from "wouter";
import { motion } from "framer-motion";
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
  eyebrow: "TAD coordena agentes + CRM + canais em uma única operação",
  title: "Sua operação comercial trabalhando com IA.",
  accent: "Do primeiro sinal à próxima venda.",
  description:
    "O VendorAI conecta prospecção, atendimento, CRM, propostas, follow-up, marketing, cobrança e pós-venda. O TAD entende o contexto e aciona o agente certo em cada etapa.",
  primary: "Testar 5 dias grátis",
  secondary: "Explorar a plataforma",
  proof: "5 dias grátis · CRM e histórico preservados · suporte em português",
  enginesIntro: "Uma operação, três momentos coordenados",
  engines: [
    { icon: Megaphone, title: "Gerar demanda", text: "Ads, conteúdo, social, sites, landing pages e campanhas." },
    { icon: Radar, title: "Encontrar oportunidades", text: "Prospector, sinais, enriquecimento, priorização e Revenue Scout." },
    { icon: Target, title: "Converter e expandir", text: "CRM, SDR, Closer, follow-up, propostas, cobrança e pós-venda." },
  ],
  previewLabel: "VendorAI em operação",
  previewTitle: "Tela real do VendorAI em operação",
  previewText: "Este é o produto real: pipeline, contexto comercial, responsáveis, estágio e próxima ação no mesmo lugar.",
  previewLink: "Conhecer o CRM",
};

const ES = {
  eyebrow: "TAD coordina agentes + CRM + canales en una única operación",
  title: "Tu operación comercial trabajando con IA.",
  accent: "Desde la primera señal hasta la próxima venta.",
  description:
    "VendorAI conecta prospección, atención, CRM, propuestas, seguimiento, marketing, cobranza y posventa. TAD entiende el contexto y activa al agente correcto en cada etapa.",
  primary: "Probar 5 días gratis",
  secondary: "Explorar la plataforma",
  proof: "5 días gratis · CRM e historial preservados · soporte en español",
  enginesIntro: "Una operación, tres momentos coordinados",
  engines: [
    { icon: Megaphone, title: "Generar demanda", text: "Ads, contenido, social, sitios, landing pages y campañas." },
    { icon: Radar, title: "Encontrar oportunidades", text: "Prospector, señales, enriquecimiento, priorización y Revenue Scout." },
    { icon: Target, title: "Convertir y expandir", text: "CRM, SDR, Closer, seguimiento, propuestas, cobranza y posventa." },
  ],
  previewLabel: "VendorAI en operación",
  previewTitle: "Pantalla real de VendorAI en operación",
  previewText: "Este es el producto real: pipeline, contexto comercial, responsables, etapa y próxima acción en el mismo lugar.",
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
        <motion.div
          className="max-w-3xl"
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
        >
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
        </motion.div>

        <motion.div
          className="relative min-w-0 lg:pl-2"
          initial={{ opacity: 0, x: 34, scale: 0.985 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.78, delay: 0.08, ease: "easeOut" }}
        >
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

            <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
              <video
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                poster={`${MEDIA}/crm-pipeline/desktop-1440.webp`}
                className="h-full w-full object-cover object-top"
                aria-label={copy.previewTitle}
              >
                <source src={`${MEDIA}/videos/crm-short.webm`} type="video/webm" />
              </video>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white/35 to-transparent" />
            </div>

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
          <motion.div
            className="pointer-events-none absolute -bottom-5 left-8 right-8 hidden items-center justify-between rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-xs font-semibold text-slate-600 shadow-xl backdrop-blur-xl md:flex"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.65 }}
          >
            {["Sinal", "Prospector", "CRM", "SDR", "Closer", "Venda", "Pós-venda"].map((step, index) => (
              <span key={step} className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-50 text-[10px] font-bold text-orange-700">{index + 1}</span>
                {step}
                {index < 6 ? <ArrowRight className="h-3 w-3 text-slate-300" /> : null}
              </span>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
