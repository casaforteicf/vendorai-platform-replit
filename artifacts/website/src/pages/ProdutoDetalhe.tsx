import { useEffect } from "react";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Gauge,
  Layers3,
  MousePointerClick,
  PlugZap,
  Sparkles,
  Workflow,
} from "lucide-react";
import { getProduct } from "@/data/products";

function ProductPreview({ name, features }: { name: string; features: string[] }) {
  const previewItems = features.slice(0, 4);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b1220] shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.035] px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">VendorAI</span>
      </div>
      <div className="grid min-h-[360px] grid-cols-[88px_1fr] sm:grid-cols-[120px_1fr]">
        <aside className="border-r border-white/10 bg-black/15 p-3 sm:p-4">
          <div className="mb-5 flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 font-bold text-white">V</div>
          <div className="space-y-2">
            {["Visão geral", "Operação", "Automação", "Relatórios"].map((item, index) => (
              <div key={item} className={`rounded-lg px-2 py-2 text-[10px] sm:text-xs ${index === 1 ? "bg-orange-500/15 text-orange-200" : "text-slate-500"}`}>
                {item}
              </div>
            ))}
          </div>
        </aside>
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Produto</p>
              <h3 className="mt-2 text-lg font-bold text-white sm:text-xl">{name}</h3>
            </div>
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold text-emerald-300">ATIVO</div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {previewItems.map((item, index) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-300">
                    {index % 2 === 0 ? <Workflow className="h-4 w-4" /> : <Gauge className="h-4 w-4" />}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Ao vivo</span>
                </div>
                <p className="mt-4 text-sm font-medium leading-5 text-slate-200">{item}</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-orange-400/70" style={{ width: `${58 + index * 9}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(249,115,22,0.12),transparent_30%)]" />
    </div>
  );
}

export default function ProdutoDetalhe() {
  const [, params] = useRoute("/produtos/:slug");
  const product = getProduct(params?.slug ?? "");

  useEffect(() => {
    if (!product) return;
    const previousTitle = document.title;
    document.title = `${product.name} | VendorAI`;
    let meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute("content") ?? "";
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", product.summary);
    return () => {
      document.title = previousTitle;
      meta?.setAttribute("content", previousDescription);
    };
  }, [product]);

  if (!product) {
    return (
      <div className="bg-[#070b14] px-4 py-24 text-center text-white">
        <h1 className="text-3xl font-bold">Produto não encontrado</h1>
        <Link href="/produtos" className="mt-6 inline-flex items-center text-orange-300">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Produtos
        </Link>
      </div>
    );
  }

  const steps = [
    {
      icon: Layers3,
      number: "01",
      title: "Configure para sua operação",
      description: `Defina regras, usuários, dados e integrações para que o ${product.name} trabalhe de acordo com o seu processo real.`,
    },
    {
      icon: Workflow,
      number: "02",
      title: "Coloque o fluxo em funcionamento",
      description: `Use recursos como ${product.features.slice(0, 2).join(" e ").toLowerCase()} para executar a rotina dentro do mesmo ambiente.`,
    },
    {
      icon: Gauge,
      number: "03",
      title: "Acompanhe e evolua",
      description: "Monitore resultados, identifique gargalos e ajuste regras, automações e prioridades conforme a operação aprende.",
    },
  ];

  return (
    <div className="bg-[#070b14] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_18%_10%,rgba(249,115,22,0.18),transparent_30%),radial-gradient(circle_at_82%_20%,rgba(37,99,235,0.14),transparent_28%)]">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <Link href="/produtos" className="mb-8 inline-flex items-center text-sm font-medium text-slate-400 transition hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" /> Todos os produtos
          </Link>
          <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_.98fr]">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-300">{product.eyebrow}</div>
              <h1 className="mt-4 text-4xl font-bold tracking-[-0.045em] md:text-6xl">{product.name}</h1>
              <p className="mt-6 max-w-3xl text-xl leading-8 text-slate-300">{product.summary}</p>
              <p className="mt-5 max-w-3xl leading-7 text-slate-400">{product.description}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/demo" className="inline-flex h-12 items-center rounded-xl bg-orange-500 px-6 font-semibold transition hover:bg-orange-400">
                  Testar 5 dias grátis <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link href="/contato" className="inline-flex h-12 items-center rounded-xl border border-white/10 bg-white/[0.04] px-6 font-semibold text-slate-200 transition hover:bg-white/[0.08]">
                  Falar com vendas
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Integrado ao ecossistema VendorAI</span>
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Implantação orientada</span>
              </div>
            </div>
            <ProductPreview name={product.name} features={product.features} />
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-300">Fluxo simples</p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em] md:text-4xl">Como funciona em 3 etapas</h2>
          <p className="mt-4 text-slate-400">O produto entra na operação sem virar uma ferramenta isolada. Ele usa o contexto do VendorAI e se conecta aos demais módulos.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-orange-400/30 hover:bg-white/[0.05]">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-300"><Icon className="h-5 w-5" /></span>
                  <span className="text-sm font-bold tracking-[0.16em] text-slate-700">{step.number}</span>
                </div>
                <h3 className="mt-6 text-xl font-semibold">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">{step.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.018]">
        <div className="container mx-auto grid gap-12 px-4 py-16 md:py-20 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-[-0.03em]">Recursos principais</h2>
            <p className="mt-3 max-w-xl text-slate-400">Os recursos centrais do {product.name} foram organizados para apoiar o fluxo completo, não apenas uma etapa isolada.</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {product.features.map((feature) => (
                <div key={feature} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                  <span className="text-sm text-slate-300">{feature}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-[-0.03em]">Resultados esperados</h2>
            <div className="mt-7 space-y-3">
              {product.benefits.map((benefit) => (
                <div key={benefit} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/10 p-4 text-slate-200">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="grid items-start gap-10 lg:grid-cols-[.85fr_1.15fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-300">Aplicações práticas</p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em]">Onde usar no dia a dia</h2>
            <p className="mt-4 text-slate-400">Use o produto em processos reais da sua equipe e mantenha o contexto conectado ao restante da operação.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {product.useCases.map((useCase) => (
              <div key={useCase} className="flex min-h-28 items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-slate-300">
                <MousePointerClick className="mt-0.5 h-5 w-5 shrink-0 text-orange-300" />
                <span className="leading-6">{useCase}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025]">
        <div className="container mx-auto px-4 py-16 md:py-20">
          <div className="flex items-center gap-3"><PlugZap className="h-6 w-6 text-orange-300" /><h2 className="text-3xl font-bold tracking-[-0.03em]">Conecta com o restante da operação</h2></div>
          <p className="mt-4 max-w-3xl text-slate-400">Os produtos do VendorAI não funcionam como ilhas. Dados, contexto e ações podem seguir de um módulo para outro.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {product.integrations.map((integration) => (
              <span key={integration} className="rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-sm font-medium text-slate-200">{integration}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="overflow-hidden rounded-[2rem] border border-orange-400/20 bg-[radial-gradient(circle_at_20%_20%,rgba(249,115,22,0.16),transparent_35%),linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] px-6 py-12 text-center md:px-10 md:py-16">
          <Sparkles className="mx-auto h-7 w-7 text-orange-300" />
          <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-bold tracking-[-0.03em] md:text-4xl">Veja o {product.name} funcionando dentro do VendorAI</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-400">Teste a plataforma e entenda como este produto pode se conectar aos seus processos atuais sem criar mais uma ferramenta separada.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/demo" className="inline-flex h-12 items-center rounded-xl bg-orange-500 px-6 font-semibold transition hover:bg-orange-400">
              Começar teste grátis <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link href="/contato" className="inline-flex h-12 items-center rounded-xl border border-white/10 bg-white/[0.04] px-6 font-semibold text-slate-200 transition hover:bg-white/[0.08]">
              Agendar demonstração
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
