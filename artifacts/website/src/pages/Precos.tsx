import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { CheckCircle2 } from "lucide-react";

export default function Precos() {
  const plans = [
    {
      name: "Starter",
      price: "R$ 297",
      period: "/mês",
      desc: "Perfeito para equipes pequenas iniciando a estruturação.",
      features: [
        "Até 3 usuários",
        "2.000 contatos",
        "3 agentes de IA",
        "WhatsApp + Email",
        "CRM completo",
        "Suporte por chat"
      ],
      popular: false,
      cta: "Começar com Starter"
    },
    {
      name: "Growth",
      price: "R$ 697",
      period: "/mês",
      desc: "A escolha ideal para operações em escala acelerada.",
      features: [
        "Até 10 usuários",
        "15.000 contatos",
        "Todos os 7 agentes de IA",
        "Omnichannel completo",
        "Customer Intelligence",
        "App mobile",
        "Faturamento integrado",
        "Suporte prioritário"
      ],
      popular: true,
      cta: "Escolher Growth"
    },
    {
      name: "Enterprise",
      price: "Sob consulta",
      period: "",
      desc: "Operações complexas que exigem alto nível de customização.",
      features: [
        "Usuários ilimitados",
        "Contatos ilimitados",
        "White-label",
        "Integrações customizadas",
        "SLA garantido",
        "Gerente de sucesso dedicado",
        "Onboarding premium"
      ],
      popular: false,
      cta: "Falar com consultor"
    }
  ];

  return (
    <div className="pb-24 bg-slate-50 min-h-screen">
      <div className="pt-20 pb-16 px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
          Planos simples e transparentes
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto">
          Pagamento via PIX, boleto ou cartão. Sem fidelidade. Cancele quando quiser.
        </p>
      </div>

      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
          {plans.map((plan) => (
            <div 
              key={plan.name}
              className={`relative rounded-3xl bg-white p-8 border ${
                plan.popular ? 'border-primary shadow-xl scale-105 z-10' : 'border-slate-200 shadow-sm'
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-bold shadow-md">
                  ⭐ Mais popular
                </div>
              )}
              
              <div className="mb-8">
                <h3 className="text-2xl font-bold text-slate-900 mb-2">{plan.name}</h3>
                <p className="text-slate-500 text-sm mb-6 h-10">{plan.desc}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-slate-900">{plan.price}</span>
                  <span className="text-slate-500 font-medium">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feat, i) => (
                  <li key={i} className="flex items-start gap-3 text-slate-700">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <Button 
                className="w-full h-12 text-base font-bold" 
                variant={plan.popular ? 'default' : 'outline'}
                asChild
                data-testid={`btn-plan-${plan.name.toLowerCase()}`}
              >
                <Link href="/contato">{plan.cta}</Link>
              </Button>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="mt-32 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-slate-900 mb-12">Perguntas frequentes</h2>
          <div className="space-y-6">
            {[
              { q: "Posso cancelar a qualquer momento?", a: "Sim, nossos planos não possuem fidelidade. Você pode cancelar sua assinatura quando desejar, sem multas." },
              { q: "Como funciona a implantação?", a: "Nossa equipe ajuda você a importar seus dados atuais e configurar os primeiros funis e agentes de IA, para que você já comece gerando valor." },
              { q: "Os pagamentos via PIX são automáticos?", a: "Sim! Se você faturar seus clientes via VendorAI, o sistema identifica o pagamento via PIX e atualiza o status automaticamente." },
            ].map((faq, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200">
                <h4 className="text-lg font-bold text-slate-900 mb-2">{faq.q}</h4>
                <p className="text-slate-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
