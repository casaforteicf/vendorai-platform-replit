import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  MessageCircle,
  MousePointerClick,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const journey = [
  {
    id: "chegou",
    label: "Lead chegou",
    kicker: "09:12",
    title: "Novo contato entrou pelo WhatsApp",
    text: "O VendorAI identifica a oportunidade, organiza os dados e deixa o próximo passo visível para a equipe.",
    badge: "Novo lead",
  },
  {
    id: "esfriando",
    label: "Lead esfriando",
    kicker: "+ 2h",
    title: "O cliente parou de responder",
    text: "Em vez de depender da memória do vendedor, o follow-up entra na rotina automaticamente e a oportunidade continua viva.",
    badge: "Follow-up pendente",
  },
  {
    id: "acao",
    label: "VendorAI age",
    kicker: "Automático",
    title: "A conversa volta a andar",
    text: "O sistema lembra, acompanha e mantém a oportunidade em movimento até o cliente comprar ou dizer não.",
    badge: "Oportunidade ativa",
  },
];

const painCards = [
  {
    icon: MessageCircle,
    title: "Responde rápido",
    text: "Centraliza o contato e reduz o tempo entre o interesse e a primeira ação comercial.",
  },
  {
    icon: RefreshCcw,
    title: "Não esquece o follow-up",
    text: "Mantém a cadência acontecendo para que o lead não desapareça no meio da rotina.",
  },
  {
    icon: Target,
    title: "Conduz até a decisão",
    text: "Cada oportunidade continua acompanhada até avançar, comprar ou encerrar de forma clara.",
  },
];

export default function Home() {
  const [activeJourney, setActiveJourney] = useState(0);

  return (
    <div className="flex min-h-screen flex-col bg-[#070b14] text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.22),transparent_34%),radial-gradient(circle_at_80%_25%,rgba(99,102,241,0.18),transparent_30%),linear-gradient(180deg,#090f1d_0%,#070b14_70%)]" />
        <motion.div
          className="absolute left-[10%] top-24 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl"
          animate={{ y: [0, 30, 0], x: [0, 18, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-[8%] top-40 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl"
          animate={{ y: [20, -20, 20], x: [0, -20, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="container relative mx-auto grid min-h-[760px] items-center gap-16 px-4 py-20 lg:grid-cols-[1.02fr_.98fr] lg:py-24">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-4 py-2 text-sm font-medium text-blue-200 shadow-[0_0_40px_rgba(59,130,246,0.08)]">
              <Sparkles className="h-4 w-4" />
              5 dias para provar na sua operação
            </div>

            <h1 className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl xl:text-[82px]">
              Você já pagou pelo lead.
              <span className="block bg-gradient-to-r from-blue-300 via-blue-400 to-indigo-300 bg-clip-text text-transparent">
                Não pague para perdê-lo.
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 md:text-xl">
              O VendorAI acompanha cada oportunidade, faz follow-up e mantém o cliente em movimento — sem depender da memória da equipe.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button
                size="lg"
                className="group h-14 rounded-xl bg-blue-500 px-7 text-base font-semibold text-white shadow-[0_14px_50px_rgba(37,99,235,0.30)] hover:bg-blue-400"
                asChild
              >
                <Link href="/demo">
                  Começar meus 5 dias grátis
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Link
                href="/precos"
                className="inline-flex h-14 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-7 text-base font-medium text-white transition hover:border-white/30 hover:bg-white/[0.08]"
              >
                Ver condição de lançamento
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400">
              {["Sem cobrança no teste", "Acesso completo", "Cancele antes da cobrança"].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400" /> {item}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 36, rotateY: -7 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="relative mx-auto w-full max-w-[610px] lg:mx-0"
          >
            <div className="absolute -inset-8 rounded-[48px] bg-blue-500/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1423]/95 shadow-[0_40px_120px_rgba(0,0,0,0.50)] backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500 text-sm font-bold shadow-lg shadow-blue-500/20">V</div>
                  <div>
                    <p className="text-sm font-semibold text-white">VendorAI · Operação comercial</p>
                    <p className="text-xs text-slate-500">Acompanhamento em tempo real</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Ativo
                </div>
              </div>

              <div className="grid gap-4 p-5 md:grid-cols-[.9fr_1.1fr]">
                <div className="space-y-3">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Pipeline</p>
                  {[
                    ["Novo lead", "4", "bg-blue-400"],
                    ["Em contato", "7", "bg-amber-400"],
                    ["Follow-up", "5", "bg-violet-400"],
                    ["Negociação", "3", "bg-emerald-400"],
                  ].map(([label, count, dot], index) => (
                    <motion.div
                      key={label}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.35 + index * 0.1 }}
                      whileHover={{ x: 4 }}
                      className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.035] px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                        <span className="text-sm text-slate-300">{label}</span>
                      </div>
                      <span className="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-semibold text-white">{count}</span>
                    </motion.div>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-[#090f1b] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-500">Oportunidade</p>
                      <p className="mt-1 text-sm font-semibold text-white">Cliente interessado em orçamento</p>
                    </div>
                    <Bot className="h-5 w-5 text-blue-300" />
                  </div>

                  <div className="space-y-3">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.55 }}
                      className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-blue-500 px-4 py-3 text-sm text-white"
                    >
                      Olá! Vi que você pediu informações. Quer que eu retome o orçamento com você agora?
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8 }}
                      className="max-w-[82%] rounded-2xl rounded-bl-md bg-white/[0.07] px-4 py-3 text-sm text-slate-300"
                    >
                      Sim, pode me mandar de novo. Eu estava sem tempo ontem.
                    </motion.div>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.05 }}
                    className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.07] p-3"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10">
                      <Zap className="h-4 w-4 text-emerald-300" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-emerald-200">Follow-up recuperado</p>
                      <p className="text-[11px] text-slate-500">Próxima ação já programada</p>
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>

            <motion.div
              animate={{ y: [0, -7, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-6 -left-5 hidden rounded-2xl border border-white/10 bg-[#11192a]/95 p-4 shadow-2xl backdrop-blur-xl sm:block"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15">
                  <Clock3 className="h-5 w-5 text-blue-300" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Próximo follow-up</p>
                  <p className="text-sm font-semibold text-white">Hoje · 15:30</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="bg-white py-24 text-slate-950 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-blue-600">A dor não é falta de lead</p>
            <h2 className="text-4xl font-semibold tracking-[-0.04em] md:text-5xl">É tudo o que acontece depois que ele chega.</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Quando o acompanhamento depende de memória, planilha e boa vontade, oportunidades somem. O VendorAI transforma isso em processo.
            </p>
          </div>

          <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-3">
            {painCards.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ delay: index * 0.08 }}
                  whileHover={{ y: -8 }}
                  className="group rounded-[26px] border border-slate-200 bg-slate-50 p-7 transition-shadow hover:shadow-[0_24px_70px_rgba(15,23,42,0.10)]"
                >
                  <div className="mb-8 flex h-13 w-13 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600 transition group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-semibold tracking-[-0.02em]">{item.title}</h3>
                  <p className="mt-3 leading-7 text-slate-600">{item.text}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#0b1120] py-24 md:py-28">
        <div className="container mx-auto grid items-center gap-12 px-4 lg:grid-cols-[.86fr_1.14fr]">
          <div>
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-blue-300">Veja o que muda</p>
            <h2 className="text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Um lead não deveria desaparecer por silêncio.</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-400">
              Clique nas etapas e veja como o VendorAI mantém a oportunidade viva sem transformar sua equipe em cobradora de lembretes.
            </p>

            <div className="mt-8 space-y-3">
              {journey.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => setActiveJourney(index)}
                  className={`w-full rounded-2xl border px-5 py-4 text-left transition ${
                    activeJourney === index
                      ? "border-blue-400/30 bg-blue-400/10 shadow-[0_10px_40px_rgba(37,99,235,0.10)]"
                      : "border-white/10 bg-white/[0.025] hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${activeJourney === index ? "bg-blue-500 text-white" : "bg-white/[0.06] text-slate-400"}`}>
                        {index + 1}
                      </span>
                      <span className="font-medium text-white">{item.label}</span>
                    </div>
                    <MousePointerClick className={`h-4 w-4 ${activeJourney === index ? "text-blue-300" : "text-slate-600"}`} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 rounded-[42px] bg-blue-500/10 blur-3xl" />
            <div className="relative min-h-[430px] overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.025] p-7 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Linha do tempo comercial</p>
                  <p className="mt-2 text-lg font-semibold">Oportunidade #VA-2048</p>
                </div>
                <ShieldCheck className="h-6 w-6 text-emerald-300" />
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={journey[activeJourney].id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                  className="pt-8"
                >
                  <div className="mb-8 flex items-center gap-3">
                    <span className="rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs font-medium text-blue-200">
                      {journey[activeJourney].kicker}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-400">
                      {journey[activeJourney].badge}
                    </span>
                  </div>
                  <h3 className="max-w-xl text-3xl font-semibold tracking-[-0.035em] md:text-4xl">{journey[activeJourney].title}</h3>
                  <p className="mt-5 max-w-xl text-lg leading-8 text-slate-400">{journey[activeJourney].text}</p>

                  <div className="mt-9 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-[#0b1120] p-4">
                      <p className="text-xs text-slate-500">Status</p>
                      <div className="mt-2 flex items-center gap-2 text-sm font-medium text-white">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" /> Oportunidade acompanhada
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[#0b1120] p-4">
                      <p className="text-xs text-slate-500">Próxima ação</p>
                      <p className="mt-2 text-sm font-medium text-white">Definida automaticamente</p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#f5f7fb] py-24 text-slate-950 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-[34px] bg-[#0a1020] shadow-[0_35px_100px_rgba(15,23,42,0.22)]">
            <div className="grid lg:grid-cols-[.9fr_1.1fr]">
              <div className="relative overflow-hidden p-8 md:p-12 lg:p-14">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.22),transparent_40%)]" />
                <div className="relative">
                  <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-blue-200">
                    Oferta de lançamento
                  </div>
                  <h2 className="text-4xl font-semibold tracking-[-0.045em] text-white md:text-5xl">Primeiro prove. Depois decida.</h2>
                  <p className="mt-5 max-w-lg text-lg leading-8 text-slate-400">
                    Use o VendorAI completo por 5 dias. Se fizer sentido, você entra na condição especial de lançamento.
                  </p>

                  <div className="mt-9 space-y-4 text-sm text-slate-300">
                    {["Uma única licença completa", "Sem cobrança durante o teste", "Sem preço normal fixado hoje"].map((item) => (
                      <div key={item} className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-300" /> {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white p-7 md:p-10 lg:p-12">
                <div className="relative">
                  <div className="absolute left-6 top-10 hidden h-[calc(100%-80px)] w-px bg-slate-200 sm:block" />
                  <div className="space-y-4">
                    {[
                      { n: "01", period: "Primeiros 5 dias", price: "Grátis", detail: "Acesso completo para testar na prática." },
                      { n: "02", period: "Próximos 60 dias", price: "R$ 497/mês", detail: "Condição especial de entrada." },
                      { n: "03", period: "6 meses seguintes", price: "R$ 990/mês", detail: "Período promocional de continuidade." },
                    ].map((phase) => (
                      <motion.div
                        key={phase.n}
                        whileHover={{ x: 6 }}
                        className="relative flex gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:items-center"
                      >
                        <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-sm font-bold text-white">{phase.n}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-500">{phase.period}</p>
                          <p className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-slate-950">{phase.price}</p>
                          <p className="mt-1 text-sm text-slate-500">{phase.detail}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-sm leading-6 text-slate-700">
                    Depois do período promocional, a assinatura segue pelo <strong>preço normal vigente</strong>.
                  </div>

                  <Button className="group mt-6 h-14 w-full rounded-xl bg-blue-600 text-base font-semibold hover:bg-blue-500" asChild>
                    <Link href="/demo">
                      Começar meus 5 dias grátis
                      <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#070b14] py-24 md:py-28">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(59,130,246,0.24),transparent_45%)]" />
        <div className="container relative mx-auto px-4 text-center">
          <div className="mx-auto max-w-4xl">
            <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-400/10">
              <Zap className="h-6 w-6 text-blue-300" />
            </div>
            <h2 className="text-4xl font-semibold tracking-[-0.045em] md:text-6xl">Quantas vendas estão paradas porque ninguém voltou a falar com o cliente?</h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-400">
              Não tente adivinhar. Coloque o VendorAI na sua operação por 5 dias e veja o que muda.
            </p>
            <Button size="lg" className="group mt-9 h-14 rounded-xl bg-white px-8 text-base font-semibold text-slate-950 hover:bg-slate-100" asChild>
              <Link href="/demo">
                Testar VendorAI agora
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
