import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  MessageCircle,
  Play,
  Radar,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const flow = [
  [MessageCircle, "Captura", "WhatsApp, Instagram, site e campanhas"],
  [Bot, "IA responde", "Atendimento e qualificação em tempo real"],
  [Target, "Oportunidade", "Lead qualificado entra no pipeline"],
  [TrendingUp, "Follow-up", "Próxima ação sem depender da memória"],
  [Radar, "Revenue Scout", "A IA encontra onde existe receita"],
] as const;

export default function ModernHomepageHero() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-orange-100 bg-[radial-gradient(circle_at_82%_18%,rgba(249,115,22,.13),transparent_28%),linear-gradient(180deg,#fffaf6_0%,#ffffff_68%)]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,.03)_1px,transparent_1px)] bg-[size:34px_34px] [mask-image:linear-gradient(to_bottom,black,transparent_78%)]" />
        <div className="container relative mx-auto grid min-h-[720px] items-center gap-14 px-4 py-16 lg:grid-cols-[.9fr_1.1fr] lg:py-20">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/90 px-4 py-2 text-sm font-semibold text-orange-600 shadow-sm">
              <Sparkles className="h-4 w-4" /> IA que gera receita
            </div>
            <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-[.98] tracking-[-.055em] text-slate-950 sm:text-6xl lg:text-7xl xl:text-[76px]">
              Pare de perder leads.
              <span className="block text-orange-500">Venda com IA.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">
              A VendorAI captura, qualifica e transforma conversas em oportunidades reais de negócio — com atendimento, CRM, follow-up, marketing e Revenue Scout trabalhando juntos.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-14 rounded-2xl bg-orange-500 px-7 text-base font-semibold text-white shadow-[0_20px_60px_rgba(249,115,22,.28)] hover:bg-orange-600">
                <Link href="/demo">Testar 5 dias grátis <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 rounded-2xl border-slate-300 bg-white/80 px-7 text-base text-slate-800 shadow-sm hover:bg-white">
                <Link href="/funcionalidades"><Play className="mr-2 h-4 w-4" /> Ver como funciona</Link>
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-500">
              {["Sem cobrança no teste", "Ativação guiada", "Suporte em português"].map((item) => (
                <span key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> {item}</span>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .65, delay: .08 }} className="relative">
            <div className="absolute -inset-10 rounded-[56px] bg-orange-300/20 blur-3xl" />
            <div className="relative rounded-[30px] border border-slate-200 bg-[#0a0f18] p-3 shadow-[0_38px_110px_rgba(15,23,42,.22)]">
              <div className="rounded-[24px] border border-white/10 bg-[#101722] p-5 text-white">
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div>
                    <p className="text-sm font-semibold">Panorama do seu negócio</p>
                    <p className="mt-1 text-xs text-slate-400">Dados em tempo real. Mais oportunidades, mais receita.</p>
                  </div>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">Em operação</span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  {[
                    ["Leads", "842", "+32%"],
                    ["Oportunidades", "312", "+26%"],
                    ["Vendas", "118", "+40%"],
                    ["Receita", "R$ 284 mil", "+67%"],
                  ].map(([label, value, trend]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
                      <p className="text-[11px] uppercase tracking-[.12em] text-slate-500">{label}</p>
                      <p className="mt-2 text-xl font-semibold">{value}</p>
                      <p className="mt-1 text-xs text-emerald-400">{trend}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
                  <div className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
                    <div className="flex items-center justify-between"><p className="text-sm font-medium">Evolução de oportunidades</p><BarChart3 className="h-4 w-4 text-orange-400" /></div>
                    <div className="mt-7 flex h-36 items-end gap-2">
                      {[18,26,22,34,40,36,51,57,49,68,76,92].map((h, i) => <span key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-orange-600 to-orange-300" style={{ height: `${h}%` }} />)}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[.06] p-4"><p className="text-xs text-emerald-300">Lead qualificado</p><p className="mt-1 text-sm font-medium">Alta intenção de compra</p></div>
                    <div className="rounded-2xl border border-orange-400/15 bg-orange-400/[.07] p-4"><p className="text-xs text-orange-300">Revenue Scout</p><p className="mt-1 text-sm font-medium">Nova oportunidade detectada</p></div>
                    <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><p className="text-xs text-slate-400">Próxima ação</p><p className="mt-1 text-sm font-medium">Follow-up agendado pela IA</p></div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-orange-500">Do primeiro contato à próxima venda</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-.035em] text-slate-950 md:text-4xl">A operação inteira trabalhando em uma só jornada.</h2>
          </div>
          <div className="mx-auto mt-10 grid max-w-6xl gap-3 md:grid-cols-5">
            {flow.map(([Icon, title, description], index) => (
              <motion.div key={title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * .05 }} className="relative rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,23,42,.05)]">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-500"><Icon className="h-5 w-5" /></div>
                <p className="mt-4 font-semibold text-slate-950">{title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
                {index < flow.length - 1 && <ArrowRight className="absolute -right-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-orange-300 md:block" />}
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
