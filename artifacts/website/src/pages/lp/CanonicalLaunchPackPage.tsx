import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { getCanonicalLaunchPack } from "./launchPackData";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function trackConfirmedLead(slug: string) {
  try {
    const w = window as unknown as { gtag?: (...args: unknown[]) => void };
    w.gtag?.("event", "conversion", {
      event_category: "lead",
      event_label: `lp_${slug}`,
      value: 1,
      currency: "BRL",
    });
  } catch {
    // External telemetry must never block lead capture.
  }
}

export default function CanonicalLaunchPackPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const pack = getCanonicalLaunchPack(slug);
  const [form, setForm] = useState({ nome: "", email: "", telefone: "", empresa: "", mensagem: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pack) document.title = `VendorAI para ${pack.vertical} — Demonstração`;
  }, [pack]);

  if (!pack) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/site/contato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          vertical: pack.vertical,
          origem: `lp_${pack.slug}`,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Não foi possível enviar agora.");
      setSuccess(true);
      trackConfirmedLead(pack.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar agora.");
    } finally {
      setLoading(false);
    }
  };

  const scrollToForm = () => document.getElementById("demo-form")?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="min-h-screen bg-[#08070F] text-white">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#08070F]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <a href="/" className="font-bold tracking-tight">VendorAI</a>
          <button onClick={scrollToForm} className="text-sm font-medium text-cyan-300 hover:text-white">Agendar demonstração</button>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-4 py-24 text-center">
          <div className="absolute inset-0 bg-gradient-to-b from-violet-950/60 via-[#100d2a] to-[#08070F]" />
          <div className="relative mx-auto max-w-4xl">
            <div className="mb-6 inline-flex rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-violet-200">
              {pack.emoji} &nbsp; Para {pack.audience}
            </div>
            <h1 className="text-4xl font-extrabold leading-tight sm:text-6xl">{pack.headline}</h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">{pack.subheadline}</p>
            <button onClick={scrollToForm} className="mt-9 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-8 py-4 font-bold shadow-lg shadow-violet-500/20 transition hover:scale-[1.02]">
              Testar o VendorAI por 5 dias <ArrowRight className="h-5 w-5" />
            </button>
            <p className="mt-3 text-xs text-slate-500">Sem cartão de crédito para iniciar o trial.</p>
          </div>
        </section>

        <section className="px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-violet-400">Problemas que o fluxo resolve</p>
            <h2 className="mx-auto mt-3 max-w-3xl text-center text-3xl font-bold">Um comercial que mantém contexto de ponta a ponta</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {pack.pains.map((pain) => (
                <article key={pain.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <h3 className="font-semibold">{pain.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{pain.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white/[0.02] px-4 py-20">
          <div className="mx-auto max-w-6xl">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-cyan-400">Resultado operacional</p>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {pack.outcomes.map((outcome) => (
                <article key={outcome.title} className="rounded-2xl border border-cyan-500/10 bg-cyan-500/[0.03] p-6">
                  <CheckCircle2 className="h-5 w-5 text-cyan-400" />
                  <h3 className="mt-4 font-semibold">{outcome.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{outcome.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-3xl font-bold">Agentes e automações para {pack.vertical}</h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {pack.agents.map((agent) => (
                <article key={agent.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                  <h3 className="font-semibold text-violet-200">{agent.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{agent.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="demo-form" className="px-4 pb-28 pt-10">
          <div className="mx-auto max-w-xl rounded-3xl border border-violet-500/20 bg-gradient-to-b from-violet-950/40 to-white/[0.03] p-7 sm:p-9">
            {success ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
                <h2 className="mt-5 text-2xl font-bold">Contato recebido</h2>
                <p className="mt-3 text-sm text-slate-400">Seu interesse em VendorAI para {pack.vertical} foi registrado. A jornada comercial seguirá pelo mesmo CRM.</p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">Demonstração + trial de 5 dias</p>
                <h2 className="mt-2 text-2xl font-bold">Veja o fluxo aplicado à sua operação</h2>
                <p className="mt-2 text-sm text-slate-400">Preencha os dados comerciais. A origem desta LP é preservada para atribuição da campanha.</p>
                <div className="mt-7 grid gap-4">
                  <input required placeholder="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" />
                  <input required type="email" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" />
                  <input required placeholder="WhatsApp / telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" />
                  <input placeholder="Empresa" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" />
                  <textarea rows={3} placeholder="O que você quer automatizar primeiro?" value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 outline-none focus:border-violet-400" />
                </div>
                {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
                <button disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 py-4 font-bold disabled:opacity-60">
                  {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Enviando</> : <>Quero ver o VendorAI em ação <ArrowRight className="h-5 w-5" /></>}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
