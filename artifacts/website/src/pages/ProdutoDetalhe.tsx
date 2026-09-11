import { useEffect } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleDot, PlugZap, Sparkles } from "lucide-react";
import { getProduct } from "@/data/products";

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

  return (
    <div className="bg-[#070b14] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_18%_10%,rgba(249,115,22,0.18),transparent_30%),radial-gradient(circle_at_82%_20%,rgba(37,99,235,0.14),transparent_28%)]">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <Link href="/produtos" className="mb-8 inline-flex items-center text-sm font-medium text-slate-400 transition hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" /> Todos os produtos
          </Link>
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
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
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 md:p-8">
              <div className="flex items-center gap-3 text-lg font-semibold"><Sparkles className="h-5 w-5 text-orange-300" /> O que você ganha</div>
              <div className="mt-6 space-y-4">
                {product.benefits.map((benefit) => (
                  <div key={benefit} className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/10 p-4 text-slate-200">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-[-0.03em]">Recursos principais</h2>
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
            <h2 className="text-3xl font-bold tracking-[-0.03em]">Onde usar</h2>
            <div className="mt-7 space-y-3">
              {product.useCases.map((useCase) => (
                <div key={useCase} className="flex items-start gap-3 border-b border-white/10 pb-3 text-slate-300">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                  <span>{useCase}</span>
                </div>
              ))}
            </div>
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

      <section className="container mx-auto px-4 py-16 text-center md:py-20">
        <h2 className="text-3xl font-bold tracking-[-0.03em] md:text-4xl">Veja o {product.name} funcionando dentro do VendorAI</h2>
        <p className="mx-auto mt-4 max-w-2xl text-slate-400">Teste a plataforma e entenda como este produto pode se conectar aos seus processos atuais.</p>
        <Link href="/demo" className="mt-8 inline-flex h-12 items-center rounded-xl bg-orange-500 px-6 font-semibold transition hover:bg-orange-400">
          Começar teste grátis <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
