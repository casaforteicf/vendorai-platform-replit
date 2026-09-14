import { Link } from "wouter";
import {
  ArrowRight,
  BarChart3,
  Bot,
  MessageCircle,
  Radar,
  RefreshCcw,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  UsersRound,
  Zap,
} from "lucide-react";

const stages = [
  { icon: Search, title: "Encontrar", text: "Revenue Scout, prospecção e Visitor Intelligence ajudam a localizar novas oportunidades e sinais de interesse." },
  { icon: Radar, title: "Atrair", text: "Conteúdo, social, SEO, sites, landing pages e campanhas trabalham ligados ao contexto comercial." },
  { icon: Target, title: "Converter", text: "CRM, atendimento, SDR IA, agenda e pipeline organizam a passagem do interesse para a oportunidade." },
  { icon: RefreshCcw, title: "Recuperar", text: "Follow-up, reativação e remarketing ajudam a retomar leads, clientes e oportunidades que esfriaram." },
  { icon: UsersRound, title: "Reter", text: "Pós-venda, suporte e inteligência do cliente mantêm o relacionamento depois do fechamento." },
  { icon: TrendingUp, title: "Escalar", text: "Resultados de conteúdo, campanhas, pipeline e receita alimentam as próximas decisões e testes." },
];

const disconnected = [
  "Marketing mede clique, mas não sabe se virou venda.",
  "O CRM recebe lead, mas não sabe qual ação fazer em seguida.",
  "WhatsApp conversa, mas o histórico comercial fica espalhado.",
  "Follow-up depende da memória da equipe.",
  "Relatórios mostram atividade, mas não conectam execução ao resultado.",
];

const connected = [
  "A origem acompanha o lead até a oportunidade e o resultado comercial.",
  "A IA usa o contexto do negócio para sugerir e preparar a próxima ação.",
  "Conversas, pipeline, tarefas e histórico ficam no mesmo fluxo.",
  "Follow-up e reativação entram como rotinas acompanháveis.",
  "Marketing e vendas passam a trabalhar sobre a mesma informação.",
];

export default function ConnectedToolsLp() {
  return (
    <main className="bg-white text-slate-950">
      <section className="relative overflow-hidden border-b border-slate-200 bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(249,115,22,.2),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,.16),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-orange-300">
              <Zap className="h-4 w-4" /> Uma operação conectada para crescer
            </div>
            <h1 className="text-4xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Pare de montar seu negócio com ferramentas que não conversam.
            </h1>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-slate-300 sm:text-xl">
              O VendorAI conecta marketing, prospecção, atendimento, CRM, follow-up, pós-venda e inteligência para que cada sinal gere uma próxima ação — e cada ação possa ser acompanhada até o resultado.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-orange-500 px-7 font-semibold text-white hover:bg-orange-400">
                Ver funcionando no meu negócio <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/produtos" className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/20 bg-white/5 px-7 font-semibold text-white hover:bg-white/10">
                Explorar as ferramentas
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-orange-600">O problema não é falta de software</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">Ferramenta isolada gera tarefa. Operação conectada gera contexto.</h2>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">Quando marketing, atendimento e vendas trabalham em sistemas diferentes, a empresa precisa de pessoas para transportar informação de uma tela para outra. O VendorAI foi construído para reduzir essa ruptura.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-red-100 bg-red-50/60 p-6">
              <p className="font-semibold text-red-900">Operação fragmentada</p>
              <div className="mt-4 space-y-3">{disconnected.map((item) => <p key={item} className="text-sm leading-6 text-red-900/70">• {item}</p>)}</div>
            </div>
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-6">
              <p className="font-semibold text-emerald-900">Com VendorAI</p>
              <div className="mt-4 space-y-3">{connected.map((item) => <p key={item} className="text-sm leading-6 text-emerald-900/75">• {item}</p>)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-orange-600">Motor de Crescimento VendorAI</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">Encontrar → Atrair → Converter → Recuperar → Reter → Escalar</h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">Não é uma metodologia vendida como curso. São ferramentas executáveis dentro do sistema, trabalhando sobre o mesmo contexto.</p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stages.map(({ icon: Icon, title, text }, index) => (
              <div key={title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Icon className="h-5 w-5" /></div>
                  <span className="text-xs font-bold text-slate-300">0{index + 1}</span>
                </div>
                <h3 className="mt-5 text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 p-7">
            <MessageCircle className="h-6 w-6 text-orange-600" />
            <h3 className="mt-5 text-2xl font-semibold">Do contato à próxima ação</h3>
            <p className="mt-3 leading-7 text-slate-600">Conversas, CRM, tarefas, agenda e pipeline compartilham o contexto para evitar que a oportunidade dependa apenas da memória de alguém.</p>
          </div>
          <div className="rounded-3xl border border-slate-200 p-7">
            <Bot className="h-6 w-6 text-orange-600" />
            <h3 className="mt-5 text-2xl font-semibold">IA dentro da operação</h3>
            <p className="mt-3 leading-7 text-slate-600">Agentes de IA ajudam em atendimento, qualificação, follow-up e outras rotinas usando dados e regras do próprio negócio.</p>
          </div>
          <div className="rounded-3xl border border-slate-200 p-7">
            <BarChart3 className="h-6 w-6 text-orange-600" />
            <h3 className="mt-5 text-2xl font-semibold">Da atividade ao resultado</h3>
            <p className="mt-3 leading-7 text-slate-600">Campanhas, leads, oportunidades e indicadores deixam de ser relatórios separados e passam a compor uma leitura operacional única.</p>
          </div>
        </div>
      </section>

      <section className="bg-orange-500 text-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-orange-100"><ShieldCheck className="h-4 w-4" /> Ferramenta, não promessa vazia</div>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Não é mais conteúdo dizendo o que fazer. É software ajudando a fazer.</h2>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-orange-50">Teste o VendorAI com a sua própria operação e veja onde as ferramentas conectadas realmente fazem sentido para o seu negócio.</p>
            </div>
            <Link href="/demo" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-7 font-semibold text-orange-700 hover:bg-orange-50">
              Testar 5 dias grátis <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
