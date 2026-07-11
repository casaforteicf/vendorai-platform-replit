import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { getLpConfig, type LpConfig } from "./lpData";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2, ArrowRight, ChevronRight, ShieldCheck } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ─── Google Ads conversion tracking (placeholder) ────────────────────────────
function trackConversion(label: string) {
  try {
    const w = window as unknown as { gtag?: (...args: unknown[]) => void };
    if (typeof w.gtag === "function") {
      w.gtag("event", "conversion", {
        send_to: `AW-PLACEHOLDER_ID/${label}`,
        value: 1.0,
        currency: "BRL",
        event_category: "lead",
        event_label: label,
      });
    }
  } catch {
    // gtag not loaded — fine in dev
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────
export default function LpRouter() {
  const params = useParams<{ slug: string }>();
  const config = getLpConfig(params.slug ?? "");

  if (!config) {
    return (
      <div className="min-h-screen bg-[#08070F] flex items-center justify-center text-white flex-col gap-6 px-4 text-center">
        <p className="text-5xl">🔍</p>
        <h1 className="text-3xl font-bold">Página não encontrada</h1>
        <a href="/" className="text-indigo-400 hover:underline text-sm">← Voltar ao site</a>
      </div>
    );
  }

  return <LandingPage config={config} />;
}

// ─── Main Landing Page template ───────────────────────────────────────────────
function LandingPage({ config }: { config: LpConfig }) {
  const [modalOpen, setModalOpen] = useState(false);

  const openModal = () => {
    trackConversion(config.gtagConversionLabel);
    setModalOpen(true);
  };

  // Update document title per vertical
  useEffect(() => {
    document.title = `VendorAI para ${config.vertical} — Agendar demonstração`;
  }, [config.vertical]);

  return (
    <div className="min-h-screen bg-[#08070F] text-white font-sans antialiased">
      {/* ── Minimal header ── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#08070F]/90 backdrop-blur">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center font-bold text-base text-white shadow-lg shadow-violet-500/20">
              V
            </div>
            <span className="font-bold text-white text-lg tracking-tight">VendorAI</span>
          </a>
          <button
            onClick={openModal}
            className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-cyan-400 hover:text-white transition-colors"
          >
            Agendar demonstração
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ══ SITUATION — Hero ══════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden pt-20 pb-28 px-4">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1B1438] via-[#100d2a] to-[#08070F] pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-violet-600/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-20 right-0 w-[400px] h-[300px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="container mx-auto max-w-4xl relative z-10 text-center">
          {/* Tag */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium mb-8 tracking-wide uppercase">
            <span className="text-base leading-none">{config.emoji}</span>
            {config.situation.tag}
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight mb-6 tracking-tight">
            {config.situation.headline.split("\n").map((line, i) => (
              <span key={i} className={i > 0 ? "block bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent" : "block"}>
                {line}
              </span>
            ))}
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            {config.situation.subheadline}
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={openModal}
              className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base text-white bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 shadow-lg shadow-violet-500/30 transition-all duration-200 hover:shadow-violet-500/50 hover:scale-[1.02]"
            >
              Agendar demonstração gratuita
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <p className="text-xs text-slate-500">Sem cartão de crédito · Sem compromisso</p>
          </div>

          {/* Trust bar */}
          <div className="mt-14 grid grid-cols-3 gap-4 max-w-lg mx-auto">
            {[
              { v: "+500", l: "empresas atendidas" },
              { v: "24/7", l: "disponibilidade" },
              { v: "<60s", l: "tempo de resposta" },
            ].map((item) => (
              <div key={item.l} className="flex flex-col items-center">
                <span className="font-bold text-xl text-white">{item.v}</span>
                <span className="text-xs text-slate-500 mt-0.5">{item.l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PROBLEM ══════════════════════════════════════════════════════════ */}
      <section className="py-20 px-4 relative">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-3">Situação</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{config.problem.title}</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">{config.problem.subtitle}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {config.problem.points.map((point, i) => (
              <div
                key={i}
                className="group p-6 rounded-2xl border border-white/5 bg-white/[0.03] hover:border-violet-500/20 hover:bg-white/[0.06] transition-all duration-200"
              >
                <div className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mb-4">
                  <span className="text-xs font-bold text-violet-400">{i + 1}</span>
                </div>
                <h3 className="font-semibold text-white mb-2 leading-snug">{point.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{point.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ IMPLICATION — Stats ═══════════════════════════════════════════════ */}
      <section className="py-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-violet-950/30 to-cyan-950/20 pointer-events-none" />
        <div className="container mx-auto max-w-5xl relative z-10">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-cyan-400 uppercase tracking-widest mb-3">Implicação</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">{config.implication.title}</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {config.implication.stats.map((stat, i) => (
              <div
                key={i}
                className="p-8 rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-transparent text-center"
              >
                <p className="text-5xl font-extrabold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent mb-3">
                  {stat.value}
                </p>
                <p className="font-semibold text-white text-sm leading-snug mb-3">{stat.label}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{stat.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ NEED-PAYOFF — Agents ═════════════════════════════════════════════ */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-3">Solução</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{config.needPayoff.title}</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">{config.needPayoff.subtitle}</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {config.needPayoff.agents.map((agent, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl border border-white/5 bg-white/[0.03] hover:border-cyan-500/20 hover:bg-white/[0.06] transition-all duration-200"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-5 rounded-full bg-gradient-to-b from-violet-400 to-cyan-400" />
                  <h3 className="font-bold text-white">{agent.name}</h3>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">{agent.desc}</p>
              </div>
            ))}
          </div>

          {/* Inline CTA below agents */}
          <div className="mt-14 text-center">
            <button
              onClick={openModal}
              className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base text-white bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 shadow-lg shadow-violet-500/30 transition-all duration-200 hover:shadow-violet-500/50 hover:scale-[1.02]"
            >
              Ver esses agentes em ação para {config.vertical}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </section>

      {/* ══ OBRAS HUB — conditional, construcao-civil only ═══════════════════ */}
      {config.obrasHub && (
        <section className="py-20 px-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#08070F] via-[#0d1a12] to-[#08070F] pointer-events-none" />
          <div className="absolute top-0 left-1/4 w-[500px] h-[400px] bg-emerald-600/8 blur-[120px] rounded-full pointer-events-none" />

          <div className="container mx-auto max-w-5xl relative z-10">
            {/* Header */}
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-semibold mb-6 tracking-wide uppercase">
                {config.obrasHub.badge}
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 max-w-3xl mx-auto leading-tight">
                {config.obrasHub.title}
              </h2>
              <p className="text-slate-400 max-w-2xl mx-auto leading-relaxed">
                {config.obrasHub.subtitle}
              </p>
            </div>

            {/* Feature cards — 3-col grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
              {config.obrasHub.features.map((feat, i) => (
                <div
                  key={i}
                  className="group p-6 rounded-2xl border border-white/5 bg-white/[0.03] hover:border-emerald-500/20 hover:bg-white/[0.05] transition-all duration-200 flex flex-col gap-4"
                >
                  {feat.badge && (
                    <span className="self-start text-xs font-semibold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      {feat.badge}
                    </span>
                  )}

                  <h3 className="font-bold text-white leading-snug">{feat.title}</h3>

                  {/* Problem */}
                  <div className="text-xs text-slate-500 leading-relaxed border-l-2 border-slate-700 pl-3">
                    {feat.problem}
                  </div>

                  {/* Solution */}
                  <div className="text-xs text-emerald-300/80 leading-relaxed border-l-2 border-emerald-700/50 pl-3">
                    {feat.solution}
                  </div>
                </div>
              ))}
            </div>

            {/* vs. callout */}
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-8 flex flex-col sm:flex-row gap-6 items-start">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h4 className="font-bold text-white text-lg mb-2">{config.obrasHub.vsCallout.title}</h4>
                <p className="text-sm text-slate-400 leading-relaxed">{config.obrasHub.vsCallout.desc}</p>
              </div>
            </div>

            {/* Inline CTA */}
            <div className="mt-12 text-center">
              <button
                onClick={openModal}
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base text-white bg-gradient-to-r from-emerald-600 to-cyan-500 hover:from-emerald-500 hover:to-cyan-400 shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:scale-[1.02]"
              >
                Ver o Obras Hub em ação
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ══ Final CTA ═════════════════════════════════════════════════════════ */}
      <section className="py-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#08070F] via-[#1B1438] to-[#08070F] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-violet-600/20 blur-[100px] rounded-full pointer-events-none" />

        <div className="container mx-auto max-w-3xl relative z-10 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{config.cta.headline}</h2>
          <p className="text-slate-400 mb-10">{config.cta.sub}</p>

          <button
            onClick={openModal}
            className="group inline-flex items-center gap-2 px-10 py-5 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 shadow-xl shadow-violet-500/30 transition-all duration-200 hover:shadow-violet-500/50 hover:scale-[1.02]"
          >
            Agendar demonstração gratuita
            <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <p className="text-xs text-slate-600 mt-4">Sem cartão de crédito · Resposta em até 2 horas úteis</p>
        </div>
      </section>

      {/* ── Minimal footer ── */}
      <footer className="border-t border-white/5 py-6 px-4 text-center text-xs text-slate-600">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <span>&copy; 2026 VendorAI. Todos os direitos reservados.</span>
          <span className="hidden sm:inline">·</span>
          <a href="/privacy" className="hover:text-slate-400 transition-colors">Privacidade</a>
          <span>·</span>
          <a href="/terms" className="hover:text-slate-400 transition-colors">Termos</a>
        </div>
        <p className="mt-1 text-slate-700">Windoor Serviços de Gerenciamento de Obras Ltda · CNPJ 59.623.589/0001-27</p>
      </footer>

      {/* ── Contact modal ── */}
      <LpModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        config={config}
      />
    </div>
  );
}

// ─── Contact Modal ─────────────────────────────────────────────────────────
interface LpModalProps {
  open: boolean;
  onClose: () => void;
  config: LpConfig;
}

function LpModal({ open, onClose, config }: LpModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    empresa: "",
    mensagem: `Quero uma demonstração do VendorAI para ${config.vertical}`,
  });

  useEffect(() => {
    if (open) {
      setSent(false);
      setForm((f) => ({
        ...f,
        mensagem: `Quero uma demonstração do VendorAI para ${config.vertical}`,
      }));
    }
  }, [open, config.vertical]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/site/contato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, origem: `lp_${config.slug}` }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Erro ao enviar",
          description: data.details?.join(", ") ?? data.error ?? "Tente novamente.",
          variant: "destructive",
        });
        return;
      }
      setSent(true);
    } catch {
      toast({
        title: "Erro de conexão",
        description: "Verifique sua internet e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {sent
              ? "Solicitação recebida!"
              : `Demonstração para ${config.vertical}`}
          </DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <p className="font-semibold text-slate-800 text-lg">Perfeito! Recebemos sua solicitação.</p>
            <p className="text-slate-500 text-sm max-w-xs">
              Nossa equipe especializada em {config.vertical} vai entrar em contato em até 2 horas úteis.
            </p>
            <Button onClick={onClose} className="mt-2">Fechar</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="lp-nome">Nome *</Label>
                <Input id="lp-nome" name="nome" value={form.nome} onChange={handleChange} placeholder="João Silva" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lp-empresa">Empresa</Label>
                <Input id="lp-empresa" name="empresa" value={form.empresa} onChange={handleChange} placeholder="Sua Empresa" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="lp-email">E-mail *</Label>
                <Input id="lp-email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="joao@empresa.com" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lp-telefone">WhatsApp *</Label>
                <Input id="lp-telefone" name="telefone" value={form.telefone} onChange={handleChange} placeholder="(11) 99999-9999" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-mensagem">Mensagem</Label>
              <Textarea id="lp-mensagem" name="mensagem" value={form.mensagem} onChange={handleChange} className="min-h-[80px]" />
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 border-0" disabled={loading}>
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando...</>
              ) : (
                <>Agendar demonstração <ArrowRight className="w-4 h-4 ml-1" /></>
              )}
            </Button>
            <p className="text-center text-xs text-slate-400">Sem compromisso · Resposta em até 2 horas úteis</p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
