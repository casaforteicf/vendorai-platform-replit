import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "wouter";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  MessageSquareText,
  Radar,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { usePublicCountry } from "@/lib/publicCountry";

const MEDIA = "/media/vendorai-official";

type Stage = {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  stat: string;
  statLabel: string;
  agent: string;
  outcome: string;
  href: string;
  video?: string;
  poster: string;
  alt: string;
};

const PT: { kicker: string; title: string; description: string; live: string; open: string; stages: Stage[] } = {
  kicker: "VendorAI ao vivo",
  title: "Veja a operação inteira acontecer dentro do sistema.",
  description:
    "Nada de mockup genérico. Esta experiência usa telas e vídeos reais do VendorAI para mostrar como um sinal vira conversa, oportunidade, venda e nova receita.",
  live: "Operação conectada",
  open: "Abrir esta função",
  stages: [
    {
      id: "descobrir",
      label: "01 · Descobrir",
      eyebrow: "Prospector IA",
      title: "A IA encontra oportunidades antes de você esperar o próximo lead.",
      description:
        "O Prospector pesquisa o perfil definido, organiza sinais, enriquece o contexto e entrega uma fila priorizada para abordagem.",
      bullets: ["Busca por perfil e região", "Enriquecimento do contexto", "Priorização para abordagem"],
      stat: "24/7",
      statLabel: "radar comercial",
      agent: "Prospector",
      outcome: "Nova oportunidade identificada",
      href: "/produtos/prospeccao",
      video: `${MEDIA}/videos/prospector-short.webm`,
      poster: `${MEDIA}/prospector/desktop-1440.webp`,
      alt: "Tela real do Prospector IA do VendorAI",
    },
    {
      id: "conversar",
      label: "02 · Conversar",
      eyebrow: "Omnichannel",
      title: "A conversa chega com histórico e contexto, não como uma mensagem solta.",
      description:
        "WhatsApp, Instagram e outros canais entram na mesma operação para que pessoas e agentes mantenham continuidade no atendimento.",
      bullets: ["Caixa de entrada unificada", "Histórico do contato", "Continuidade entre agentes e equipe"],
      stat: "1",
      statLabel: "histórico compartilhado",
      agent: "SDR",
      outcome: "Lead qualificado com contexto",
      href: "/produtos/omnichannel",
      poster: `${MEDIA}/omnichannel/desktop-1440.webp`,
      alt: "Tela real do Omnichannel do VendorAI",
    },
    {
      id: "converter",
      label: "03 · Converter",
      eyebrow: "CRM + agentes",
      title: "Oportunidade, responsável, estágio e próxima ação ficam no mesmo lugar.",
      description:
        "O CRM preserva o contexto e permite que SDR, Closer, vendedor e TAD trabalhem sobre a mesma informação sem quebrar a jornada.",
      bullets: ["Pipeline visual", "Próxima ação organizada", "Histórico disponível para os agentes"],
      stat: "100%",
      statLabel: "contexto no pipeline",
      agent: "Closer",
      outcome: "Proposta em andamento",
      href: "/produtos/crm",
      video: `${MEDIA}/videos/crm-short.webm`,
      poster: `${MEDIA}/crm-pipeline/desktop-1440.webp`,
      alt: "Tela real do CRM Pipeline do VendorAI",
    },
    {
      id: "acompanhar",
      label: "04 · Acompanhar",
      eyebrow: "Follow-up inteligente",
      title: "O sistema acompanha o que precisa acontecer depois do primeiro contato.",
      description:
        "Tarefas, retornos, agenda e próximos passos ficam ligados ao lead para reduzir oportunidades esquecidas e dependência de memória.",
      bullets: ["Follow-up por contexto", "Agenda conectada ao lead", "Responsável e prazo visíveis"],
      stat: "0",
      statLabel: "lead sem próxima ação",
      agent: "Follow-up",
      outcome: "Próxima ação programada",
      href: "/produtos/agenda-inteligente",
      poster: `${MEDIA}/agenda/desktop-1440.webp`,
      alt: "Tela real da Agenda Inteligente do VendorAI",
    },
    {
      id: "expandir",
      label: "05 · Expandir",
      eyebrow: "Revenue Scout",
      title: "A próxima venda pode estar na carteira que você já conquistou.",
      description:
        "O Revenue Scout observa sinais, histórico e regras para encontrar recompra, cross-sell, reativação e oportunidades de expansão.",
      bullets: ["Sinais de recompra", "Cross-sell e expansão", "Próxima melhor ação sugerida"],
      stat: "+",
      statLabel: "receita encontrada",
      agent: "Revenue Scout",
      outcome: "Nova oportunidade na base",
      href: "/produtos/revenue-scout",
      video: `${MEDIA}/videos/revenue-scout-short.webm`,
      poster: `${MEDIA}/revenue-scout/desktop-1440.webp`,
      alt: "Tela real do Revenue Scout do VendorAI",
    },
  ],
};

const ES: typeof PT = {
  kicker: "VendorAI en vivo",
  title: "Mira toda la operación suceder dentro del sistema.",
  description:
    "Sin mockups genéricos. Esta experiencia usa pantallas y videos reales de VendorAI para mostrar cómo una señal se convierte en conversación, oportunidad, venta y nuevo ingreso.",
  live: "Operación conectada",
  open: "Abrir esta función",
  stages: [
    {
      id: "descubrir",
      label: "01 · Descubrir",
      eyebrow: "Prospector IA",
      title: "La IA encuentra oportunidades antes de esperar el próximo lead.",
      description:
        "Prospector investiga el perfil definido, organiza señales, enriquece el contexto y entrega una fila priorizada para contacto.",
      bullets: ["Búsqueda por perfil y región", "Enriquecimiento del contexto", "Priorización para contacto"],
      stat: "24/7",
      statLabel: "radar comercial",
      agent: "Prospector",
      outcome: "Nueva oportunidad identificada",
      href: "/produtos/prospeccao",
      video: `${MEDIA}/videos/prospector-short.webm`,
      poster: `${MEDIA}/prospector/desktop-1440.webp`,
      alt: "Pantalla real del Prospector IA de VendorAI",
    },
    {
      id: "conversar",
      label: "02 · Conversar",
      eyebrow: "Omnichannel",
      title: "La conversación llega con historial y contexto, no como un mensaje aislado.",
      description:
        "WhatsApp, Instagram y otros canales entran en la misma operación para que personas y agentes mantengan continuidad.",
      bullets: ["Bandeja unificada", "Historial del contacto", "Continuidad entre agentes y equipo"],
      stat: "1",
      statLabel: "historial compartido",
      agent: "SDR",
      outcome: "Lead calificado con contexto",
      href: "/produtos/omnichannel",
      poster: `${MEDIA}/omnichannel/desktop-1440.webp`,
      alt: "Pantalla real del Omnichannel de VendorAI",
    },
    {
      id: "convertir",
      label: "03 · Convertir",
      eyebrow: "CRM + agentes",
      title: "Oportunidad, responsable, etapa y próxima acción quedan en el mismo lugar.",
      description:
        "El CRM preserva el contexto y permite que SDR, Closer, vendedor y TAD trabajen sobre la misma información.",
      bullets: ["Pipeline visual", "Próxima acción organizada", "Historial disponible para agentes"],
      stat: "100%",
      statLabel: "contexto en el pipeline",
      agent: "Closer",
      outcome: "Propuesta en progreso",
      href: "/produtos/crm",
      video: `${MEDIA}/videos/crm-short.webm`,
      poster: `${MEDIA}/crm-pipeline/desktop-1440.webp`,
      alt: "Pantalla real del CRM Pipeline de VendorAI",
    },
    {
      id: "acompanar",
      label: "04 · Acompañar",
      eyebrow: "Seguimiento inteligente",
      title: "El sistema acompaña lo que necesita suceder después del primer contacto.",
      description:
        "Tareas, retornos, agenda y próximos pasos quedan vinculados al lead para reducir oportunidades olvidadas.",
      bullets: ["Seguimiento por contexto", "Agenda conectada al lead", "Responsable y plazo visibles"],
      stat: "0",
      statLabel: "lead sin próxima acción",
      agent: "Follow-up",
      outcome: "Próxima acción programada",
      href: "/produtos/agenda-inteligente",
      poster: `${MEDIA}/agenda/desktop-1440.webp`,
      alt: "Pantalla real de la Agenda Inteligente de VendorAI",
    },
    {
      id: "expandir",
      label: "05 · Expandir",
      eyebrow: "Revenue Scout",
      title: "La próxima venta puede estar en la cartera que ya conquistaste.",
      description:
        "Revenue Scout observa señales, historial y reglas para encontrar recompra, cross-sell, reactivación y expansión.",
      bullets: ["Señales de recompra", "Cross-sell y expansión", "Próxima mejor acción sugerida"],
      stat: "+",
      statLabel: "ingreso encontrado",
      agent: "Revenue Scout",
      outcome: "Nueva oportunidad en la base",
      href: "/produtos/revenue-scout",
      video: `${MEDIA}/videos/revenue-scout-short.webm`,
      poster: `${MEDIA}/revenue-scout/desktop-1440.webp`,
      alt: "Pantalla real del Revenue Scout de VendorAI",
    },
  ],
};

export default function InteractiveOperatingSystem() {
  const { isSpanish } = usePublicCountry();
  const copy = isSpanish ? ES : PT;
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = copy.stages[activeIndex] ?? copy.stages[0];

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % copy.stages.length);
    }, 6800);
    return () => window.clearInterval(timer);
  }, [copy.stages.length, reduceMotion]);

  const progress = useMemo(
    () => ((activeIndex + 1) / copy.stages.length) * 100,
    [activeIndex, copy.stages.length],
  );

  return (
    <section className="vendor-live-stage relative overflow-hidden border-b border-white/10 text-white">
      <div className="vendor-live-glow vendor-live-glow-orange" aria-hidden="true" />
      <div className="vendor-live-glow vendor-live-glow-blue" aria-hidden="true" />

      <div className="relative mx-auto max-w-[1480px] px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end lg:gap-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-300">
              <Sparkles className="h-4 w-4" />
              {copy.kicker}
            </div>
            <h2 className="vendor-display mt-6 max-w-3xl text-4xl font-semibold leading-[0.98] tracking-[-0.05em] sm:text-5xl lg:text-6xl">
              {copy.title}
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8 lg:pb-1">
            {copy.description}
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-[30px] border border-white/10 bg-[#0a0f19]/90 shadow-[0_40px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:mt-14 lg:rounded-[38px]">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-7">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
              </div>
              <span className="hidden text-xs font-semibold text-slate-400 sm:inline">appvendorai.com · live operation</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-300">
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                animate={reduceMotion ? undefined : { opacity: [0.35, 1, 0.35], scale: [0.9, 1.15, 0.9] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
              {copy.live}
            </div>
          </div>

          <div className="grid lg:grid-cols-[310px_minmax(0,1fr)]">
            <nav className="border-b border-white/10 bg-white/[0.025] p-3 sm:p-4 lg:border-b-0 lg:border-r" aria-label={copy.kicker}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-1">
                {copy.stages.map((stage, index) => {
                  const selected = index === activeIndex;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setActiveIndex(index)}
                      className={`group rounded-2xl border px-3 py-3 text-left transition sm:px-4 lg:py-4 ${
                        selected
                          ? "border-orange-400/30 bg-orange-400/10"
                          : "border-transparent bg-white/[0.025] hover:border-white/10 hover:bg-white/[0.045]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${selected ? "text-orange-300" : "text-slate-500"}`}>
                          {stage.label}
                        </span>
                        <span className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-orange-400" : "bg-slate-700"}`} />
                      </div>
                      <p className={`mt-1.5 hidden text-sm font-semibold lg:block ${selected ? "text-white" : "text-slate-300"}`}>
                        {stage.eyebrow}
                      </p>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 hidden h-1 overflow-hidden rounded-full bg-white/5 lg:block">
                <motion.div className="h-full rounded-full bg-orange-500" animate={{ width: `${progress}%` }} transition={{ duration: 0.35 }} />
              </div>
            </nav>

            <div className="min-w-0 p-4 sm:p-6 lg:p-8">
              <div className="grid min-w-0 gap-8 xl:grid-cols-[0.78fr_1.22fr] xl:items-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active.id + "-copy"}
                    initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                    transition={{ duration: 0.28 }}
                  >
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">{active.eyebrow}</p>
                    <h3 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                      {active.title}
                    </h3>
                    <p className="mt-5 text-sm leading-7 text-slate-300 sm:text-base">{active.description}</p>

                    <div className="mt-6 space-y-3">
                      {active.bullets.map((bullet) => (
                        <div key={bullet} className="flex items-start gap-3 text-sm text-slate-200">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                          <span>{bullet}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-7 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                        <p className="text-2xl font-semibold text-white">{active.stat}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{active.statLabel}</p>
                      </div>
                      <div className="rounded-2xl border border-orange-400/15 bg-orange-400/[0.06] p-4">
                        <p className="text-sm font-semibold text-orange-200">{active.agent}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{active.outcome}</p>
                      </div>
                    </div>

                    <Link href={active.href} className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-orange-300 transition hover:text-orange-200">
                      {copy.open} <ArrowRight className="h-4 w-4" />
                    </Link>
                  </motion.div>
                </AnimatePresence>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={active.id + "-visual"}
                    className="relative min-w-0"
                    initial={reduceMotion ? false : { opacity: 0, x: 24, scale: 0.985 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={reduceMotion ? undefined : { opacity: 0, x: -18, scale: 0.99 }}
                    transition={{ duration: 0.38, ease: "easeOut" }}
                  >
                    <div className="vendor-live-screen overflow-hidden rounded-[22px] border border-white/10 bg-slate-950">
                      <div className="flex items-center justify-between border-b border-white/10 bg-black/20 px-4 py-3">
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                          <Bot className="h-3.5 w-3.5 text-orange-300" />
                          {active.agent}
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-emerald-300">sync</span>
                      </div>

                      <div className="relative aspect-[16/10] overflow-hidden bg-[#070b12]">
                        {active.video ? (
                          <video
                            key={active.video}
                            autoPlay={!reduceMotion}
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            poster={active.poster}
                            className="h-full w-full object-cover object-top"
                            aria-label={active.alt}
                          >
                            <source src={active.video} type="video/webm" />
                          </video>
                        ) : (
                          <img
                            src={active.poster}
                            alt={active.alt}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover object-top"
                          />
                        )}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#070b12]/80 to-transparent" />
                      </div>
                    </div>

                    <motion.div
                      className="vendor-live-chip vendor-live-chip-left hidden sm:flex"
                      animate={reduceMotion ? undefined : { y: [0, -7, 0] }}
                      transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Radar className="h-4 w-4 text-orange-300" />
                      <div><strong>Sinal detectado</strong><span>contexto atualizado</span></div>
                    </motion.div>

                    <motion.div
                      className="vendor-live-chip vendor-live-chip-right hidden lg:flex"
                      animate={reduceMotion ? undefined : { y: [0, 8, 0] }}
                      transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                    >
                      <Zap className="h-4 w-4 text-emerald-300" />
                      <div><strong>{active.agent}</strong><span>{active.outcome}</span></div>
                    </motion.div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-2 border-t border-white/10 pt-5 sm:gap-3">
                {[
                  [MessageSquareText, isSpanish ? "Canales" : "Canais", isSpanish ? "contexto continuo" : "contexto contínuo"],
                  [Target, "CRM", isSpanish ? "próxima acción" : "próxima ação"],
                  [TrendingUp, "Revenue", isSpanish ? "expansión activa" : "expansão ativa"],
                ].map(([Icon, label, detail]) => {
                  const StageIcon = Icon as typeof MessageSquareText;
                  return (
                    <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.025] p-3 sm:p-4">
                      <StageIcon className="h-4 w-4 text-orange-300" />
                      <p className="mt-3 text-xs font-semibold text-white sm:text-sm">{String(label)}</p>
                      <p className="mt-1 hidden text-[11px] text-slate-500 sm:block">{String(detail)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
