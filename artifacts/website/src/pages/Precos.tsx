import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Check, CheckCircle2, Clock3, FileSignature, RefreshCcw } from "lucide-react";

const options = [
  {
    icon: Clock3,
    title: "Ativação mensal gratuita",
    price: "5 dias grátis",
    detail: "A cada mês, o cliente pode ativar cinco dias corridos para usar a experiência completa do VendorAI.",
    features: ["Todos os módulos disponíveis", "Cinco dias corridos após a ativação", "Sem cobrança na ativação gratuita"],
  },
  {
    icon: RefreshCcw,
    title: "Nova ativação pré-paga",
    price: "R$ 399",
    detail: "Quando os dias ativos terminarem, compre mais cinco dias de uso diretamente pelo sistema.",
    features: ["Mais cinco dias corridos", "Pagamento por PIX ou cartão", "Ativação após confirmação do pagamento"],
    featured: true,
  },
  {
    icon: FileSignature,
    title: "Licença oficial",
    price: "Contrato anual",
    detail: "Para empresas que precisam do VendorAI funcionando continuamente, com contratação formal por doze meses.",
    features: ["Uso contínuo durante a vigência", "Renovação mensal da licença", "Contrato eletrônico com condições definidas"],
  },
];

export default function Precos() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <section className="bg-[#070b14] px-4 py-20 text-center text-white md:py-24">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-blue-300">Uma única experiência completa</p>
        <h1 className="text-4xl font-semibold tracking-[-0.045em] md:text-6xl">Você escolhe o tempo de uso, não as funções.</h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">
          Não existem versões reduzidas do VendorAI. Ative cinco dias gratuitos por mês, compre novos períodos quando precisar ou contrate a licença oficial anual.
        </p>
      </section>

      <main className="container mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <article
                key={option.title}
                className={`relative rounded-[28px] border bg-white p-8 shadow-sm ${option.featured ? "border-blue-400 ring-4 ring-blue-100" : "border-slate-200"}`}
              >
                {option.featured && (
                  <span className="absolute right-6 top-6 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                    Use quando precisar
                  </span>
                )}
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Icon className="h-6 w-6" />
                </div>
                <p className="mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">{option.title}</p>
                <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-slate-950">{option.price}</h2>
                <p className="mt-4 min-h-[84px] leading-7 text-slate-600">{option.detail}</p>
                <ul className="mt-7 space-y-3 border-t border-slate-100 pt-6">
                  {option.features.map((feature) => (
                    <li key={feature} className="flex gap-3 text-sm font-medium text-slate-700">
                      <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <section className="mt-10 rounded-[28px] border border-slate-200 bg-white p-8 md:p-10">
          <div className="flex flex-col gap-7 md:flex-row md:items-center md:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                <h2 className="text-2xl font-semibold text-slate-950">Seus dados não desaparecem quando os dias terminam</h2>
              </div>
              <p className="mt-4 leading-7 text-slate-600">
                Sem um período ativo, você continua consultando leads, conversas, propostas, relatórios e informações já registradas. Novas gerações, envios, automações e demais atividades ficam pausados até uma nova ativação ou contratação da licença oficial.
              </p>
            </div>
            <Button size="lg" className="h-14 shrink-0 rounded-xl px-8" asChild>
              <Link href="/demo">
                Ativar meus 5 dias
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
                q: "Os cinco dias gratuitos renovam?",
                a: "Sim. Em cada novo mês existe uma nova ativação gratuita de cinco dias corridos, contados a partir da ativação.",
              },
              {
                q: "Depois dos cinco dias sou obrigado a contratar?",
                a: "Não. Você pode aguardar o próximo mês, comprar mais cinco dias por R$ 399 ou escolher a licença oficial.",
              },
              {
                q: "Vou perder acesso aos meus dados?",
                a: "Não. As informações permanecem disponíveis para consulta. O sistema apenas impede novas atividades enquanto não houver dias ativos.",
              },
              {
                q: "Existem planos com menos funcionalidades?",
                a: "Não. A experiência é completa em todas as modalidades; o que muda é o período em que as funções de ação permanecem habilitadas.",
              },
              {
                q: "Como funciona a licença oficial?",
                a: "A licença mantém o uso contínuo e é formalizada por contrato eletrônico com vigência de doze meses e condições comerciais apresentadas antes do aceite.",
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
