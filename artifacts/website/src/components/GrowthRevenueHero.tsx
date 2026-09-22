import { useEffect, useState } from "react";
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
  Zap,
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
  live: "Sistema real em operação",
  enginesIntro: "Uma operação, três movimentos coordenados",
  engines: [
    { icon: Megaphone, title: "Gerar demanda", text: "Ads, conteúdo, social, sites, landing pages e campanhas." },
    { icon: Radar, title: "Encontrar oportunidades", text: "Prospector, sinais, enriquecimento, priorização e Revenue Scout." },
    { icon: Target, title: "Converter e expandir", text: "CRM, SDR, Closer, follow-up, propostas, cobrança e pós-venda." },
  ],
  previewLabel: "VendorAI em operação",
  previewTitle: "O produto real, não um mockup.",
  previewText:
    "Pipeline, contexto comercial, responsáveis, estágio e próxima ação funcionando na mesma tela.",
  previewLink: "Conhecer o CRM",
  signal: "Novo sinal comercial",
  signalText: "Oportunidade priorizada pelo TAD",
  context: "CRM + IA",
  contextText: "Contexto compartilhado em tempo real",
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
  live: "Sistema real en operación",
  enginesIntro: "Una operación, tres movimientos coordinados",
  engines: [
    { icon: Megaphone, title: "Generar demanda", text: "Ads, contenido, social, sitios, landing pages y campañas." },
    { icon: Radar, title: "Encontrar oportunidades", text: "Prospector, señales, enriquecimiento, priorización y Revenue Scout." },
    { icon: Target, title: "Convertir y expandir", text: "CRM, SDR, Closer, seguimiento, propuestas, cobranza y posventa." },
  ],
  previewLabel: "VendorAI en operación",
  previewTitle: "El producto real, no un mockup.",
  previewText:
    "Pipeline, contexto comercial, responsables, etapa y próxima acción funcionando en la misma pantalla.",
  previewLink: "Conocer el CRM",
  signal: "Nueva señal comercial",
  signalText: "Oportunidad priorizada por TAD",
  context: "CRM + IA",
  contextText: "Contexto compartido en tiempo real",
};

const MEDIA = "/media/vendorai-official";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

export default function GrowthRevenueHero() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;
  const reduceMotion = usePrefersReducedMotion();
  const [videoEnabled, setVideoEnabled] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    let timeoutId: number | undefined;
    let idleId: number | undefined;
    const start = () => setVideoEnabled(true);
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const schedule = () => {
      if (idleWindow.requestIdleCallback) idleId = idleWindow.requestIdleCallback(start, { timeout: 1800 });
      else timeoutId = window.setTimeout(start, 900);
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      window.removeEventListener("load", schedule);
      if (idleId != null) idleWindow.cancelIdleCallback?.(idleId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [reduceMotion]);

  return (
    <section className="vendor-home-hero vendor-home-hero-cinematic relative overflow-hidden text-white">
      <div className="vendor-home-grid vendor-home-grid-dark" aria-hidden="true" />
      <div className="vendor-home-orb vendor-home-orb-orange" aria-hidden="true" />
      <div className="vendor-home-orb vendor-home-orb-blue" aria-hidden="true" />
      <div className="vendor-hero-beam" aria-hidden="true" />

      <div className="relative mx-auto grid min-h-[760px] max-w-[1480px] gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-14 lg:px-8 lg:pb-28 lg:pt-24 xl:gap-20">
        <div className="vendor-hero-enter max-w-3xl">
          <div className="vendor-hero-eyebrow vendor-hero-eyebrow-dark mb-6 inline-flex max-w-full items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold leading-5 sm:mb-7 sm:px-4 sm:text-sm">
            <WandSparkles className="h-4 w-4" />
            {copy.eyebrow}
          </div>

          <h1 className="vendor-display text-[clamp(2.55rem,10vw,5.9rem)] font-semibold leading-[0.96] tracking-[-0.06em] text-white lg:leading-[0.92] lg:tracking-[-0.068em]">
            {copy.title}
            <span className="vendor-hero-accent mt-4 block">{copy.accent}</span>
          </h1>

          <p className="mt-7 max-w-2xl text-[16px] leading-7 text-slate-300 sm:mt-8 sm:text-xl sm:leading-9">
            {copy.description}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:mt-9 sm:flex-row">
            <Link href="/demo" className="vendor-cta-primary group inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-7 font-semibold text-white">
              {copy.primary}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link href="/produtos" className="vendor-cta-secondary vendor-cta-secondary-dark inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-7 font-semibold text-white">
              {copy.secondary}
            </Link>
          </div>

          <div className="mt-5 flex items-start gap-2 text-sm leading-6 text-slate-400">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>{copy.proof}</span>
          </div>

          <div className="mt-9 sm:mt-11">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.19em] text-slate-500">{copy.enginesIntro}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {copy.engines.map((engine, index) => {
                const Icon = engine.icon;
                return (
                  <div
                    key={engine.title}
                    className="vendor-engine-card vendor-engine-card-dark vendor-engine-enter rounded-[20px] p-4"
                    style={{ animationDelay: (200 + index * 80) + "ms" }}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-400/20 bg-orange-400/10 text-orange-300">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-semibold text-slate-600">0{index + 1}</span>
                    </div>
                    <p className="text-sm font-semibold text-white">{engine.title}</p>
                    <p className="mt-1.5 text-xs leading-5 text-slate-400">{engine.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="vendor-hero-visual-enter relative min-w-0 lg:pl-2">
          <div className="vendor-product-window vendor-product-window-dark overflow-hidden rounded-[24px] sm:rounded-[32px]">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-black/25 px-4 py-3.5 backdrop-blur-xl sm:px-6 sm:py-4">
              <div>
                <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.17em] text-orange-300">
                  <Sparkles className="h-3.5 w-3.5" /> {copy.previewLabel}
                </div>
                <h2 className="mt-2 text-lg font-semibold tracking-[-0.025em] text-white sm:text-2xl">{copy.previewTitle}</h2>
              </div>
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300 sm:inline-flex">
                <span className="vendor-live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {copy.live}
              </span>
            </div>

            <div className="relative aspect-[4/3] overflow-hidden bg-[#05080d] sm:aspect-[16/9]">
              <picture className="absolute inset-0 block">
                <source media="(max-width: 640px)" srcSet={MEDIA + "/crm-pipeline/mobile-390.webp"} type="image/webp" />
                <img
                  src={MEDIA + "/crm-pipeline/desktop-1440.webp"}
                  alt="Tela real do CRM Pipeline do VendorAI"
                  width={1440}
                  height={810}
                  fetchPriority="high"
                  decoding="async"
                  className="h-full w-full object-cover object-top"
                />
              </picture>
              {videoEnabled ? (
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 h-full w-full object-cover object-top"
                  aria-label={copy.previewTitle}
                >
                  <source src={MEDIA + "/videos/crm-short.webm"} type="video/webm" />
                </video>
              ) : null}
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_50%,rgba(249,115,22,0.07)_100%)]" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#05080d]/70 to-transparent" />
            </div>

            <div className="flex flex-col gap-3 border-t border-white/10 bg-black/25 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
              <p className="max-w-xl text-sm leading-6 text-slate-300">{copy.previewText}</p>
              <Link href="/produtos/crm" className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-orange-300 hover:text-orange-200">
                {copy.previewLink} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="vendor-floating-stat vendor-floating-stat-dark vendor-floating-stat-left vendor-float-up hidden lg:flex">
            <BarChart3 className="h-4 w-4 text-orange-300" />
            <div><strong>{copy.signal}</strong><span>{copy.signalText}</span></div>
          </div>

          <div className="vendor-floating-stat vendor-floating-stat-dark vendor-floating-stat-right vendor-float-down hidden xl:flex">
            <UsersRound className="h-4 w-4 text-emerald-300" />
            <div><strong>{copy.context}</strong><span>{copy.contextText}</span></div>
          </div>

          <div className="vendor-hero-signal-chip vendor-signal-drift pointer-events-none absolute left-5 top-[42%] hidden items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.13em] text-orange-200 backdrop-blur-xl 2xl:flex">
            <Zap className="h-3.5 w-3.5" />
            TAD · next best action
          </div>

          <div className="vendor-hero-flow vendor-flow-enter absolute -bottom-6 left-5 right-5 hidden items-center justify-between rounded-2xl px-4 py-3 text-[11px] font-semibold text-slate-300 md:flex xl:left-8 xl:right-8">
            {["Sinal", "Prospector", "CRM", "SDR", "Closer", "Venda", "Pós-venda"].map((step, index) => (
              <span key={step} className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-orange-400/20 bg-orange-400/10 text-[10px] font-bold text-orange-300">{index + 1}</span>
                <span className="hidden xl:inline">{step}</span>
                {index < 6 ? <ArrowRight className="h-3 w-3 shrink-0 text-slate-600" /> : null}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
