import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { CheckCircle2, XCircle, Zap } from "lucide-react";

const PLANS = [
  {
    slug: "growth",
    name: "Growth",
    desc: "Para PMEs com time comercial em estruturação.",
    monthlyPrice: "R$ 1.490",
    annualPrice: "R$ 1.190",
    setupFee: "R$ 4.900",
    maxUsers: "até 8 usuários",
    extraUser: "R$ 89/usuário extra",
    popular: false,
    color: "border-slate-200",
    badge: null,
    features: [
      { text: "WhatsApp + Instagram unificados", ok: true },
      { text: "4 agentes de IA (SDR, Closer, Followup, Reactivation)", ok: true },
      { text: "CRM completo (pipeline, leads, negócios, orçamentos)", ok: true },
      { text: "Gerador de Sites com IA", ok: true },
      { text: "Inteligência do Cliente — básica", ok: true },
      { text: "Painel do gestor", ok: true },
      { text: "Suporte via e-mail", ok: true },
      { text: "Scheduler, Service, Onboarding", ok: false },
      { text: "Prospector Alpha", ok: false },
      { text: "Google Calendar", ok: false },
    ],
    cta: "Começar com Growth",
  },
  {
    slug: "pme_plus",
    name: "PME+",
    desc: "Para operações que precisam de automação completa.",
    monthlyPrice: "R$ 1.890",
    annualPrice: "R$ 1.490",
    setupFee: "R$ 6.900",
    maxUsers: "até 15 usuários",
    extraUser: "R$ 84/usuário extra",
    popular: true,
    color: "border-primary",
    badge: "⭐ Mais popular",
    features: [
      { text: "Tudo do Growth", ok: true },
      { text: "7 agentes de IA (+ Scheduler, Service, Onboarding)", ok: true },
      { text: "Prospector Alpha incluso no anual", ok: true },
      { text: "Inteligência do Cliente completa (7 motores)", ok: true },
      { text: "Google Calendar integrado", ok: true },
      { text: "Suporte via WhatsApp", ok: true },
      { text: "Google Sheets", ok: false },
      { text: "Base de conhecimento (PDF/DOCX)", ok: false },
      { text: "BYOK (chave de IA própria)", ok: false },
    ],
    cta: "Escolher PME+",
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    desc: "Para PMEs com operações complexas e time acima de 10 vendedores.",
    monthlyPrice: "R$ 2.490",
    annualPrice: "R$ 1.990",
    setupFee: "R$ 8.900",
    maxUsers: "até 20 usuários",
    extraUser: "R$ 79/usuário extra",
    popular: false,
    color: "border-violet-300",
    badge: null,
    features: [
      { text: "Tudo do PME+", ok: true },
      { text: "Google Sheets (importação/exportação)", ok: true },
      { text: "Base de conhecimento por upload (PDF/DOCX)", ok: true },
      { text: "BYOK — chave de IA própria opcional", ok: true },
      { text: "Portal de parceiros/revendedores", ok: true },
      { text: "Relatório executivo mensal automatizado", ok: true },
      { text: "SLA dedicado + implantação acompanhada", ok: true },
      { text: "Consultoria de setup 1h com o time Vendor.ai", ok: true },
    ],
    cta: "Falar com consultor",
  },
];

const ANNUAL_BENEFITS = [
  "Onboarding prioritário (fila dedicada)",
  "Suporte WhatsApp direto (inclusive no plano Growth)",
  "Prospector Alpha incluso em PME+ e Enterprise",
  "Consultoria de setup 1h com o time Vendor.ai",
];

export default function Precos() {
  const [cycle, setCycle] = useState<"monthly" | "annual">("annual");

  return (
    <div className="pb-24 bg-slate-50 min-h-screen">
      <div className="pt-20 pb-16 px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
          Planos para PME com time comercial
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-8">
          Faturamento entre R$2M–R$20M/ano · 5 a 20 vendedores · IA que trabalha por você
        </p>

        {/* Cycle toggle */}
        <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-full p-1 shadow-sm">
          <button
            onClick={() => setCycle("annual")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
              cycle === "annual"
                ? "bg-primary text-white shadow"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Anual <span className="ml-1 text-xs opacity-80">— save 20%</span>
          </button>
          <button
            onClick={() => setCycle("monthly")}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
              cycle === "monthly"
                ? "bg-primary text-white shadow"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Mensal
          </button>
        </div>
      </div>

      <div className="container mx-auto px-4">
        {/* Annual benefits banner */}
        {cycle === "annual" && (
          <div className="max-w-5xl mx-auto mb-8 rounded-2xl bg-primary/5 border border-primary/20 p-5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-primary font-semibold shrink-0">
              <Zap className="h-4 w-4" /> Benefícios exclusivos do plano anual:
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-1">
              {ANNUAL_BENEFITS.map((b, i) => (
                <li key={i} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" /> {b}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
          {PLANS.map((plan) => (
            <div
              key={plan.slug}
              className={`relative rounded-3xl bg-white p-8 border-2 ${plan.color} ${
                plan.popular ? "shadow-xl scale-[1.03] z-10" : "shadow-sm"
              }`}
            >
              {plan.badge && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-bold shadow-md">
                  {plan.badge}
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-2xl font-bold text-slate-900 mb-1">{plan.name}</h3>
                <p className="text-slate-500 text-sm mb-5 min-h-[36px]">{plan.desc}</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-bold text-slate-900">
                    {cycle === "annual" ? plan.annualPrice : plan.monthlyPrice}
                  </span>
                  <span className="text-slate-500 font-medium">/mês</span>
                </div>
                <p className="text-xs text-slate-400">
                  + implantação {plan.setupFee} · {plan.maxUsers} · {plan.extraUser}
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feat, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    {feat.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
                    )}
                    <span className={feat.ok ? "text-slate-700" : "text-slate-400"}>
                      {feat.text}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                className="w-full h-12 text-base font-bold"
                variant={plan.popular ? "default" : "outline"}
                asChild
                data-testid={`btn-plan-${plan.slug}`}
              >
                <Link href="/contato">{plan.cta}</Link>
              </Button>
            </div>
          ))}
        </div>

        {/* Demo banner */}
        <div className="max-w-5xl mx-auto mt-10 rounded-2xl bg-emerald-50 border border-emerald-200 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-bold text-slate-900 text-lg">Experimente grátis por 5 dias</p>
            <p className="text-slate-600 text-sm mt-1">
              Acesso completo com dados de exemplo. Todos os 7 agentes de IA, WhatsApp + Instagram.
            </p>
          </div>
          <Button className="shrink-0 bg-emerald-600 hover:bg-emerald-700 h-12 px-8 font-bold" asChild>
            <Link href="/demo">Criar conta demo</Link>
          </Button>
        </div>

        {/* FAQ */}
        <div className="mt-24 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-10">Perguntas frequentes</h2>
          <div className="space-y-5">
            {[
              {
                q: "O que é a taxa de implantação?",
                a: "É um investimento único que cobre a configuração da conta, integração dos canais (WhatsApp/Instagram), treinamento dos agentes de IA para o seu negócio e onboarding da equipe. O valor varia por plano.",
              },
              {
                q: "Como funciona o usuário adicional?",
                a: "Se o seu time crescer além do limite do plano, cada usuário extra é cobrado mensalmente (R$89 no Growth, R$84 no PME+, R$79 no Enterprise) sem bloquear o cadastro.",
              },
              {
                q: "Qual a diferença entre mensal e anual?",
                a: "No anual você economiza ~20% por mês e ganha benefícios extras: onboarding prioritário, suporte WhatsApp (inclusive no Growth), Prospector Alpha incluso no PME+ e Enterprise, e 1h de consultoria de setup.",
              },
              {
                q: "O que é BYOK (Enterprise)?",
                a: "Bring Your Own Key — você usa sua própria chave da OpenAI. Ideal para empresas que já possuem contrato corporativo com a OpenAI e querem controle total dos custos de IA.",
              },
              {
                q: "Posso cancelar a qualquer momento?",
                a: "Sim, sem fidelidade no plano mensal. No anual, o valor já foi pago antecipadamente mas você pode pausar o uso a qualquer momento.",
              },
            ].map((faq, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200">
                <h4 className="text-base font-bold text-slate-900 mb-2">{faq.q}</h4>
                <p className="text-slate-600 text-sm">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
