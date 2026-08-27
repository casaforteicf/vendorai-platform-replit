import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, MessageSquare, RefreshCcw, Target } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <section className="relative pt-24 pb-28 md:pt-32 md:pb-36 overflow-hidden bg-slate-50">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
              <span className="flex h-2 w-2 rounded-full bg-primary" />
              5 dias grátis · acesso completo
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 mb-6 leading-tight">
              Pare de perder os leads que você já conquistou.
            </h1>

            <p className="text-lg md:text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
              O VendorAI acompanha cada oportunidade automaticamente, faz follow-up e mantém o cliente em movimento até ele comprar ou dizer não.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
              <Button size="lg" className="w-full sm:w-auto text-base h-12 px-8" asChild data-testid="hero-btn-primary">
                <Link href="/demo">Começar meus 5 dias grátis <ArrowRight className="ml-2 w-5 h-5" /></Link>
              </Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-12 px-8 bg-white" asChild>
                <Link href="/precos">Ver condição especial</Link>
              </Button>
            </div>

            <p className="text-sm text-slate-500">Sem cobrança durante o teste. Continue apenas se fizer sentido para sua operação.</p>
          </motion.div>
        </div>
      </section>

      <section className="py-20 bg-white border-y border-border">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">A dor é simples</p>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Lead sem acompanhamento vira venda perdida.</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              O problema não é só gerar mais contatos. É garantir que ninguém seja esquecido depois que chega.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: <MessageSquare className="w-7 h-7 text-primary" />,
                title: "Responde",
                desc: "Organiza o contato e ajuda sua operação a agir mais rápido."
              },
              {
                icon: <RefreshCcw className="w-7 h-7 text-primary" />,
                title: "Acompanha",
                desc: "Mantém o follow-up acontecendo para o lead não esfriar."
              },
              {
                icon: <Target className="w-7 h-7 text-primary" />,
                title: "Conduz até a decisão",
                desc: "Mantém cada oportunidade ativa até comprar ou dizer não."
              }
            ].map((item, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-7">
                <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center mb-5">{item.icon}</div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-8 md:p-12">
            <div className="text-center mb-10">
              <p className="text-sm font-semibold uppercase tracking-wider text-primary mb-3">Oferta de lançamento</p>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Teste primeiro. Pague só depois.</h2>
              <p className="text-lg text-slate-600">Uma única licença completa, sem escolher entre vários planos.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-5 mb-8">
              {[
                ["Primeiros 5 dias", "Grátis"],
                ["Próximos 60 dias", "R$ 497/mês"],
                ["6 meses seguintes", "R$ 990/mês"],
              ].map(([period, price]) => (
                <div key={period} className="rounded-2xl border border-slate-200 p-6 text-center">
                  <p className="text-sm text-slate-500 mb-2">{period}</p>
                  <p className="text-2xl font-bold text-slate-900">{price}</p>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-3 bg-slate-50 rounded-2xl p-5 mb-8">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-slate-700">
                Depois do período promocional, a assinatura segue pelo <strong>preço normal vigente</strong>.
              </p>
            </div>

            <div className="text-center">
              <Button size="lg" className="h-14 px-8 text-lg" asChild>
                <Link href="/demo">Começar meus 5 dias grátis <ArrowRight className="ml-2 w-5 h-5" /></Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-900">
        <div className="container mx-auto px-4 text-center max-w-3xl">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">Quantas vendas você pode estar perdendo por falta de follow-up?</h2>
          <p className="text-xl text-slate-300 mb-10">Descubra usando o VendorAI na sua operação por 5 dias.</p>
          <Button size="lg" className="h-14 px-8 text-lg" asChild>
            <Link href="/demo">Testar agora</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
