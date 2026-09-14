import { Link } from "wouter";
import { ArrowRight, Bot, Clock3, DollarSign, MessageCircle, RefreshCcw, Search, Target, TrendingUp } from "lucide-react";

const losses = [
  { icon: Clock3, title: "Lead sem próxima ação", text: "Contato entrou, houve conversa, mas ninguém definiu o que acontece depois." },
  { icon: MessageCircle, title: "Conversa abandonada", text: "O cliente demonstrou interesse e a oportunidade esfriou no WhatsApp ou no atendimento." },
  { icon: Target, title: "Proposta parada", text: "A negociação existe, mas não há acompanhamento estruturado até a decisão." },
  { icon: RefreshCcw, title: "Cliente inativo", text: "A empresa já conquistou o cliente, mas não trabalha recompra, retorno ou reativação." },
];

const flow = [
  ["01", "Encontrar", "O VendorAI organiza leads, oportunidades e sinais que precisam de atenção."],
  ["02", "Priorizar", "IA e regras do negócio ajudam a separar o que merece ação primeiro."],
  ["03", "Preparar ação", "Follow-up, tarefa, campanha ou abordagem entram no fluxo com contexto."],
  ["04", "Acompanhar", "A oportunidade continua visível no CRM, pipeline e histórico."],
  ["05", "Medir", "A empresa acompanha avanço comercial e resultado sem depender só de relatório de atividade."],
];

export default function RecoverSalesLp() {
  return (
    <main className="bg-white text-slate-950">
      <section className="relative overflow-hidden border-b border-slate-200 bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(249,115,22,.22),transparent_35%),radial-gradient(circle_at_80%_15%,rgba(16,185,129,.13),transparent_31%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-orange-300">
              <Search className="h-4 w-4" /> Missão: Recuperar Vendas
            </div>
            <h1 className="text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Seu próximo faturamento pode já estar dentro da sua empresa.
            </h1>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-slate-300 sm:text-xl">
              Antes de pagar por mais leads, encontre contatos esquecidos, oportunidades paradas, propostas sem acompanhamento e clientes que podem voltar a comprar.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-orange-500 px-7 font-semibold text-white hover:bg-orange-400">
                Encontrar oportunidades no meu negócio <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/lp/ferramentas-conectadas" className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-7 font-semibold text-white hover:bg-white/10">
                Ver a operação conectada
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-orange-600">Onde a receita escapa</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">Muitas empresas não perdem vendas por falta de lead. Perdem no meio da jornada.</h2>
          <p className="mt-5 text-lg leading-8 text-slate-600">A missão Recuperar Vendas organiza sinais que já existem na operação e transforma cada um em uma próxima ação acompanhável.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {losses.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Icon className="h-5 w-5" /></div>
              <h3 className="mt-5 text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-orange-600">Não é uma lista de leads</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">É um fluxo para transformar oportunidade parada em trabalho executável.</h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">CRM, follow-up, Revenue Scout, campanhas e agentes de IA usam o mesmo contexto. O objetivo é reduzir oportunidades esquecidas e dar visibilidade à próxima ação.</p>
            </div>
            <div className="space-y-3">
              {flow.map(([n, title, text]) => (
                <div key={n} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-[48px_150px_1fr] sm:items-center">
                  <span className="text-xs font-bold text-orange-600">{n}</span>
                  <strong>{title}</strong>
                  <span className="text-sm leading-6 text-slate-600">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 p-7">
            <Bot className="h-6 w-6 text-orange-600" />
            <h3 className="mt-5 text-2xl font-semibold">IA com contexto comercial</h3>
            <p className="mt-3 leading-7 text-slate-600">A recomendação parte do histórico, estágio da oportunidade e informações da empresa — não de uma mensagem genérica.</p>
          </div>
          <div className="rounded-3xl border border-slate-200 p-7">
            <TrendingUp className="h-6 w-6 text-orange-600" />
            <h3 className="mt-5 text-2xl font-semibold">Prioridade por oportunidade</h3>
            <p className="mt-3 leading-7 text-slate-600">A equipe consegue enxergar o que está parado e onde concentrar esforço antes de simplesmente buscar mais volume.</p>
          </div>
          <div className="rounded-3xl border border-slate-200 p-7">
            <DollarSign className="h-6 w-6 text-orange-600" />
            <h3 className="mt-5 text-2xl font-semibold">Da ação ao resultado</h3>
            <p className="mt-3 leading-7 text-slate-600">O acompanhamento continua no pipeline e nos indicadores para que atividade e resultado comercial não fiquem separados.</p>
          </div>
        </div>
      </section>

      <section className="bg-orange-500 text-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-4xl">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-orange-100">Comece pela demanda que você já conquistou</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Antes de comprar mais atenção, descubra onde sua operação está deixando venda escapar.</h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-orange-50">Use o VendorAI para organizar oportunidades, preparar próximas ações e acompanhar o que acontece depois.</p>
            </div>
            <Link href="/demo" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-7 font-semibold text-orange-700 hover:bg-orange-50">
              Executar diagnóstico <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
