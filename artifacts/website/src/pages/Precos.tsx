import { Link } from "wouter";
import { ArrowRight, Check, Layers3, Sparkles, UserRound } from "lucide-react";

const accessCards = [
  {
    icon: UserRound,
    eyebrow: "Experimente",
    title: "5 dias grátis",
    price: "R$ 0",
    description: "Entre com sua operação real e veja os agentes trabalhando antes de decidir.",
    items: ["5 dias corridos de uso", "CRM + agentes principais", "Contexto do seu segmento", "Sem cobrança durante o teste"],
    cta: "Começar grátis",
    href: "/demo",
  },
  {
    icon: Layers3,
    eyebrow: "Uso flexível",
    title: "+5 dias de operação",
    price: "R$ 399",
    description: "Compre novos blocos de uso quando precisar, sem perder dados, histórico ou configuração.",
    items: ["Mais 5 dias corridos", "Continua de onde parou", "Pix ou cartão", "Consulta preservada sem dias ativos"],
    cta: "Usar por créditos",
    href: "/demo",
  },
  {
    icon: Sparkles,
    eyebrow: "Operação contínua",
    title: "VendorAI Anual",
    price: "Plano anual",
    description: "Para empresas que querem manter a equipe de IA trabalhando continuamente na operação comercial.",
    items: ["TAD + equipe de agentes", "Vendor CRM", "Integrações e automações", "Inteligência, marketing e pós-venda"],
    cta: "Falar sobre o anual",
    href: "/contato",
  },
] as const;

export default function Precos() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-950">
      <section className="bg-[#070b14] px-4 py-20 text-center text-white md:py-24">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-orange-300">Formas de acesso</p>
        <h1 className="mx-auto max-w-4xl text-4xl font-semibold tracking-[-0.045em] md:text-6xl">Comece em 5 dias. Continue no ritmo da sua operação.</h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">
          Teste a operação completa com contexto real. Depois escolha entre novos blocos de 5 dias ou operação contínua no plano anual.
        </p>
      </section>

      <main className="container mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          {accessCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.title} className="flex rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
                <div className="flex w-full flex-col">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Icon className="h-6 w-6" /></div>
                  <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-orange-600">{card.eyebrow}</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">{card.title}</h2>\n                  <p className="mt-3 text-2xl font-semibold text-orange-600">{card.price}</p>
                  <p className="mt-4 min-h-[110px] leading-7 text-slate-600">{card.description}</p>
                  <ul className="mt-6 flex-1 space-y-3 border-t border-slate-100 pt-6">
                    {card.items.map((item) => (
                      <li key={item} className="flex gap-3 text-sm font-medium text-slate-700"><Check className="h-5 w-5 shrink-0 text-emerald-500" />{item}</li>
                    ))}
                  </ul>
                  <Link href={card.href} className="mt-8 inline-flex h-12 items-center justify-center rounded-xl bg-orange-500 px-5 font-semibold text-white transition hover:bg-orange-600">
                    {card.cta}<ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-8 md:p-10">
          <div className="grid gap-8 md:grid-cols-[1.2fr_.8fr] md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Oferta contextual</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Sem créditos ativos, seus dados continuam disponíveis.</h2>
              <p className="mt-4 max-w-2xl leading-7 text-slate-600">
                Quando um bloco de uso termina, o VendorAI preserva CRM, histórico e informações da operação. Você pode consultar os dados e reativar a execução comprando mais 5 dias ou migrando para o plano anual.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-6 text-sm leading-7 text-slate-600">
              <strong className="block text-slate-900">Fluxo comercial</strong>
              Cadastro → 5 dias grátis → mais 5 dias por R$ 399 quando precisar → ou plano anual para operação contínua.
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
