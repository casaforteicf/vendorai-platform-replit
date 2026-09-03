import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Check, CheckCircle2, RefreshCcw, TrendingUp } from "lucide-react";

export default function Precos() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <section className="bg-[#070b14] px-4 py-20 text-center text-white md:py-24">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-blue-300">Vendor.ai completo</p>
        <h1 className="text-4xl font-semibold tracking-[-0.045em] md:text-6xl">Um plano só. Toda a tecnologia.</h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">
          Sem níveis, sem funcionalidade travada por plano. Comece com 5 dias grátis e continue no ritmo que fizer
          sentido pra sua empresa.
        </p>
      </section>

      <main className="container mx-auto max-w-5xl px-4 py-16">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          <article className="relative rounded-[28px] border border-blue-400 bg-white p-8 shadow-sm ring-4 ring-blue-100">
            <span className="absolute right-6 top-6 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
              Recomendado
            </span>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <p className="mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">Assinatura</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">Comece grátis, siga crescendo</h2>
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-500">5 primeiros dias</span>
                <span className="font-semibold text-emerald-600">Grátis</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-500">Próximos 60 dias</span>
                <span className="font-semibold text-slate-900">R$ 497/mês</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-500">6 meses seguintes</span>
                <span className="font-semibold text-slate-900">R$ 990/mês</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-100 pt-2">
                <span className="text-sm text-slate-500">Depois disso</span>
                <span className="font-semibold text-slate-900">R$ 1.490/mês</span>
              </div>
            </div>
            <ul className="mt-6 space-y-3 border-t border-slate-100 pt-6">
              {["Sem contrato de fidelidade", "Cancele quando quiser", "Preço sobe só com o tempo de uso, não por decisão manual"].map((f) => (
                <li key={f} className="flex gap-3 text-sm font-medium text-slate-700">
                  <Check className="h-5 w-5 shrink-0 text-emerald-500" /> {f}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-7 w-full rounded-xl" size="lg">
              <Link href="/demo">Começar meus 5 dias grátis <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </article>

          <article className="relative rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
              <RefreshCcw className="h-6 w-6" />
            </div>
            <p className="mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">Uso avulso</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">R$ 399,99 <span className="text-lg font-medium text-slate-500">/ 5 dias</span></h2>
            <p className="mt-4 min-h-[72px] leading-7 text-slate-600">
              Sem assinatura, sem mensalidade. Ative 5 dias de acesso completo quando precisar, e ative de novo depois
              — pague só quando usar.
            </p>
            <ul className="mt-6 space-y-3 border-t border-slate-100 pt-6">
              {["Mesma experiência completa", "Pagamento único por PIX ou cartão", "Compre quantas vezes quiser"].map((f) => (
                <li key={f} className="flex gap-3 text-sm font-medium text-slate-700">
                  <Check className="h-5 w-5 shrink-0 text-emerald-500" /> {f}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-7 w-full rounded-xl" size="lg">
              <Link href="/demo">Ativar 5 dias por R$ 399,99</Link>
            </Button>
          </article>
        </div>

        <section className="mt-10 rounded-[28px] border border-slate-200 bg-white p-8 md:p-10">
          <div className="flex flex-col gap-7 md:flex-row md:items-center md:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                <h2 className="text-2xl font-semibold text-slate-950">Seus dados não desaparecem quando o período termina</h2>
              </div>
              <p className="mt-4 leading-7 text-slate-600">
                Mesmo sem um período ativo, você continua consultando leads, conversas, propostas, relatórios e
                informações já registradas. Novas automações e envios ficam pausados até a próxima ativação.
              </p>
            </div>
            <Button size="lg" className="h-14 shrink-0 rounded-xl px-8" asChild>
              <Link href="/demo">
                Começar agora
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
                q: "Qual a diferença entre assinatura e uso avulso?",
                a: "A assinatura é contínua: você entra na régua 497→990→1.490/mês e o acesso nunca para. O avulso é sob demanda: você compra blocos de 5 dias (R$399,99 cada) só quando for usar — sem cobrança recorrente.",
              },
              {
                q: "Depois dos 5 dias grátis sou obrigado a contratar?",
                a: "Não. Você pode aguardar, comprar um bloco avulso de 5 dias, ou seguir com a assinatura começando em R$497/mês.",
              },
              {
                q: "Vou perder acesso aos meus dados?",
                a: "Não. As informações permanecem disponíveis para consulta. O sistema apenas pausa novas automações enquanto não houver um período ativo.",
              },
              {
                q: "Existem versões com menos funcionalidades?",
                a: "Não. A experiência é completa nas duas modalidades; o que muda é só a forma de pagar pelo tempo de uso.",
              },
              {
                q: "R$1.490/mês é o teto do preço?",
                a: "Sim, esse é o preço normal vigente após a régua promocional dos primeiros 8 meses — não sobe além disso por tempo de casa.",
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
