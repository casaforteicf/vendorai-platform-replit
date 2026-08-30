import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const phases = [
  { period: "Primeiros 5 dias", price: "Grátis", detail: "Acesso completo para testar na sua operação." },
  { period: "Próximos 60 dias", price: "R$ 497/mês", detail: "Condição especial de entrada." },
  { period: "6 meses seguintes", price: "R$ 990/mês", detail: "Condição promocional de continuidade." },
];

export default function Precos() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <section className="pt-20 pb-12 px-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">Uma única licença</p>
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">Teste primeiro. Decida com resultado.</h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto">
          O VendorAI acompanha seus leads para você parar de perder oportunidades por falta de follow-up.
        </p>
      </section>

      <div className="container mx-auto px-4 max-w-4xl">
        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-8 md:p-12">
          <div className="grid md:grid-cols-3 gap-5 mb-8">
            {phases.map((phase) => (
              <div key={phase.period} className="rounded-2xl border border-slate-200 p-6 text-center">
                <p className="text-sm text-slate-500 mb-2">{phase.period}</p>
                <p className="text-3xl font-bold text-slate-900 mb-3">{phase.price}</p>
                <p className="text-sm text-slate-600">{phase.detail}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-slate-50 p-6 mb-8">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-slate-900">Depois do período promocional</p>
                <p className="text-slate-600 mt-1">A assinatura segue pelo preço normal vigente.</p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Button size="lg" className="h-14 px-8 text-lg font-bold" asChild data-testid="btn-start-trial">
              <Link href="/demo">Começar meus 5 dias grátis <ArrowRight className="ml-2 w-5 h-5" /></Link>
            </Button>
            <p className="text-sm text-slate-500 mt-4">Sem cobrança durante os 5 dias de teste.</p>
          </div>
        </div>

        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-8">Perguntas rápidas</h2>
          <div className="space-y-4">
            {[
              {
                q: "O teste é realmente grátis?",
                a: "Sim. Os primeiros 5 dias são gratuitos e sem cobrança durante o período de teste.",
              },
              {
                q: "O que acontece depois dos 5 dias?",
                a: "Se você decidir continuar, entra na condição especial da campanha: R$ 497/mês pelos próximos 60 dias.",
              },
              {
                q: "E depois da promoção?",
                a: "Após os 60 dias, a condição passa para R$ 990/mês pelos 6 meses seguintes. Depois disso, a assinatura segue pelo preço normal vigente.",
              },
              {
                q: "É uma versão limitada?",
                a: "Não. A proposta é permitir que você teste o VendorAI completo e avalie o impacto real na sua operação.",
              },
            ].map((faq) => (
              <div key={faq.q} className="bg-white p-6 rounded-2xl border border-slate-200">
                <h3 className="font-bold text-slate-900 mb-2">{faq.q}</h3>
                <p className="text-slate-600 text-sm">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
