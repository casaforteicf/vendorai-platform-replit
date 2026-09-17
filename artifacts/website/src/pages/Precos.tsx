import { Link } from "wouter";
import { ArrowRight, Check, Layers3, Sparkles, UserRound } from "lucide-react";

const accessCards = [
  {
    icon: UserRound,
    eyebrow: "Entrada",
    title: "Vendor CRM Free",
    description: "Comece com o CRM para organizar leads, contatos, pipeline, tarefas e histórico comercial.",
    items: ["1 usuário", "CRM completo", "Dados preservados para evoluir depois", "Acesso permanente ao CRM Free"],
    cta: "Começar com o CRM",
    href: "/demo",
  },
  {
    icon: Layers3,
    eyebrow: "Expansão",
    title: "Produtos por necessidade",
    description: "Ative somente as capacidades que fizerem sentido para sua operação, sem transformar cada tela técnica em um produto separado.",
    items: ["Prospector", "Omnichannel", "Agentes de IA", "Marketing e conteúdo", "Gestão, inteligência e automações"],
    cta: "Conhecer os produtos",
    href: "/produtos",
  },
  {
    icon: Sparkles,
    eyebrow: "Ecossistema completo",
    title: "VendorAI Growth",
    description: "Use o ecossistema VendorAI completo para o seu segmento, com usuários ilimitados e franquias claras para operações de custo variável.",
    items: ["Usuários ilimitados", "Produtos aplicáveis ao segmento", "Franquias de IA e automação", "Capacidade extra quando necessário"],
    cta: "Conhecer a experiência Growth",
    href: "/demo",
  },
] as const;

export default function Precos() {
  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-950">
      <section className="bg-[#070b14] px-4 py-20 text-center text-white md:py-24">
        <p className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-orange-300">Formas de acesso</p>
        <h1 className="mx-auto max-w-4xl text-4xl font-semibold tracking-[-0.045em] md:text-6xl">Comece pelo CRM. Evolua conforme sua operação pedir.</h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300 md:text-xl">
          O site institucional mostra como o VendorAI pode ser usado. As condições comerciais de cada campanha são apresentadas na landing page correspondente e preservadas quando você inicia a experiência.
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
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">{card.title}</h2>
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
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">A condição comercial acompanha a origem do cliente.</h2>
              <p className="mt-4 max-w-2xl leading-7 text-slate-600">
                Se você chegar por uma campanha ou landing page específica, o VendorAI registra aquela origem e a condição apresentada nela. O site geral e as telas genéricas da plataforma não funcionam como tabela pública de preços.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-6 text-sm leading-7 text-slate-600">
              <strong className="block text-slate-900">Fluxo comercial</strong>
              Campanha / LP → condição da oferta → cadastro → trial → proposta aceita → cobrança conforme a oferta registrada.
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
