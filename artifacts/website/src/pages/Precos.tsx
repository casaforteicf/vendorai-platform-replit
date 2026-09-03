import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Check, CheckCircle2, Sparkles } from "lucide-react";

const plans = [
  {
    key: "growth",
    name: "Growth",
    monthly: 1490,
    annualMonthly: 1190,
    setup: 4900,
    tagline: "Para quem está estruturando a operação comercial",
    features: ["Até 8 usuários", "5 agentes de IA", "WhatsApp + Instagram"],
  },
  {
    key: "pmemais",
    name: "PME+",
    monthly: 1890,
    annualMonthly: 1490,
    setup: 6900,
    tagline: "Para operações que já têm volume e precisam de mais alcance",
    features: ["Até 15 usuários", "7 agentes de IA", "Prospector Alpha", "Google Calendar"],
    featured: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    monthly: 2490,
    annualMonthly: 1990,
    setup: 8900,
    tagline: "Para empresas com múltiplos times e necessidade de SLA",
    features: ["Até 20 usuários", "16 módulos", "BYOK", "Portal de parceiros", "SLA dedicado"],
  },
];

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

export default function Precos() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <section className="bg-[#070b14] px-4 py-20 text-center text-white md:py-24">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-blue-300">Planos Vendor.ai</p>
        <h1 className="text-4xl font-semibold tracking-[-0.045em] md:text-6xl">Preço claro. Sem letra miúda.</h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">
          Comece com 5 dias grátis. Se continuar, entra automaticamente no plano Growth com condição de entrada — sem
          decisão de compra no meio do teste.
        </p>
        <div className="mx-auto mt-8 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200">
          <Sparkles className="h-4 w-4" />
          R$ 497/mês nos primeiros 60 dias → R$ 990/mês por mais 6 meses → depois, preço normal do plano
        </div>
      </section>

      <main className="container mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.key}
              className={`relative rounded-[28px] border bg-white p-8 shadow-sm ${plan.featured ? "border-blue-400 ring-4 ring-blue-100" : "border-slate-200"}`}
            >
              {plan.featured && (
                <span className="absolute right-6 top-6 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                  Mais escolhido
                </span>
              )}
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{plan.name}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-[-0.04em] text-slate-950">{money(plan.monthly)}</span>
                <span className="text-sm text-slate-500">/mês</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                ou {money(plan.annualMonthly)}/mês no plano anual (12x) · implantação {money(plan.setup)}
              </p>
              <p className="mt-4 min-h-[48px] text-sm leading-6 text-slate-600">{plan.tagline}</p>
              <ul className="mt-6 space-y-3 border-t border-slate-100 pt-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm font-medium text-slate-700">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-7 w-full rounded-xl" variant={plan.featured ? "default" : "outline"}>
                <Link href="/demo">
                  Testar 5 dias grátis <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </article>
          ))}
        </div>

        <section className="mt-10 rounded-[28px] border border-slate-200 bg-white p-8 md:p-10">
          <div className="flex flex-col gap-7 md:flex-row md:items-center md:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                <h2 className="text-2xl font-semibold text-slate-950">Seus dados não desaparecem se você pausar</h2>
              </div>
              <p className="mt-4 leading-7 text-slate-600">
                Mesmo fora de um período ativo, você continua consultando leads, conversas, propostas, relatórios e
                informações já registradas. Novas automações e envios ficam pausados até reativar.
              </p>
            </div>
            <Button size="lg" className="h-14 shrink-0 rounded-xl px-8" asChild>
              <Link href="/demo">
                Começar meus 5 dias grátis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-4xl">
          <h2 className="text-center text-3xl font-semibold tracking-[-0.035em] text-slate-950">Perguntas importantes</h2>
          <div className="mt-8 space-y-4">
            {[
              {
                q: "Depois dos 5 dias sou obrigado a contratar?",
                a: "Não. Ao final do teste você decide se continua. Se continuar, começa em R$497/mês nos primeiros 60 dias — não no preço cheio.",
              },
              {
                q: "Vou perder acesso aos meus dados se não continuar?",
                a: "Não. As informações permanecem disponíveis para consulta. O sistema apenas pausa novas automações enquanto não houver um plano ativo.",
              },
              {
                q: "Existem planos com menos funcionalidades?",
                a: "Não. A experiência é completa em todos os planos; o que muda é o volume de usuários, agentes e módulos incluídos.",
              },
              {
                q: "Anual sai mais barato que mensal?",
                a: "Sim — o plano anual reduz a mensalidade em relação ao mensal (ex: Growth cai de R$1.490 para R$1.190/mês), pago em 12x.",
              },
              {
                q: "O que é a implantação?",
                a: "Uma configuração inicial única (canais conectados, agentes ajustados ao seu negócio e treinamento da equipe), cobrada separado da mensalidade.",
              },
            ].map((faq) => (
              <article key={faq.q} className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="font-semibold text-slate-950">{faq.q}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{faq.a}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
