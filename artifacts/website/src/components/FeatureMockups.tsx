import { Check, CheckCircle2, Circle, Search, ThumbsUp } from "lucide-react";

// ── ChatMockup: usado nas páginas de agente — simula troca de mensagens ──────
export function ChatMockup({ agentName, messages }: { agentName: string; messages: { from: "lead" | "agent"; text: string }[] }) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1423]/95 shadow-[0_40px_120px_rgba(0,0,0,0.48)]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-white">{agentName}</p>
          <p className="text-xs text-slate-500">Conversa real via WhatsApp</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Online
        </div>
      </div>
      <div className="space-y-3 p-5">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === "agent" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${m.from === "agent" ? "bg-blue-500 text-white" : "bg-white/[0.06] text-slate-200"}`}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BrowserMockup: usado em gerador-de-sites e lps-por-vertical ─────────────
export function BrowserMockup({ url, heading, sub, accent = "#3B82F6" }: { url: string; heading: string; sub: string; accent?: string }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-[0_40px_120px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-3">
        <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div>
        <div className="ml-2 flex-1 rounded-md bg-white px-3 py-1 text-xs text-slate-500">{url}</div>
      </div>
      <div style={{ background: `linear-gradient(135deg, ${accent}15, transparent)` }} className="p-8">
        <div className="h-2 w-24 rounded-full" style={{ background: accent }} />
        <p className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{heading}</p>
        <p className="mt-2 text-sm text-slate-500">{sub}</p>
        <div className="mt-6 flex gap-2">
          <div className="h-9 w-28 rounded-lg" style={{ background: accent }} />
          <div className="h-9 w-28 rounded-lg border border-slate-200" />
        </div>
        <div className="mt-8 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-slate-100" />)}
        </div>
      </div>
    </div>
  );
}

// ── ReportMockup: usado em analise-de-site ───────────────────────────────────
export function ReportMockup({ score, items }: { score: number; items: { label: string; ok: boolean }[] }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1423]/95 p-6 shadow-[0_40px_120px_rgba(0,0,0,0.48)]">
      <div className="flex items-center gap-4">
        <Search className="h-5 w-5 text-blue-300" />
        <p className="text-sm font-semibold text-white">Diagnóstico do site</p>
      </div>
      <div className="mt-5 flex items-end gap-3">
        <span className="text-5xl font-bold text-white">{score}</span>
        <span className="mb-1 text-sm text-slate-400">/ 100</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${score}%` }} />
      </div>
      <div className="mt-6 space-y-2.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2.5 text-sm">
            {item.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <Circle className="h-4 w-4 shrink-0 text-amber-400" />}
            <span className={item.ok ? "text-slate-300" : "text-amber-200"}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ArticleMockup: usado em content-autopilot ────────────────────────────────
export function ArticleMockup({ title, tags }: { title: string; tags: string[] }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1423]/95 shadow-[0_40px_120px_rgba(0,0,0,0.48)]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <p className="text-sm font-semibold text-white">Artigo publicado automaticamente</p>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">SEO 94/100</span>
      </div>
      <div className="p-6">
        <p className="text-lg font-semibold leading-7 text-white">{title}</p>
        <div className="mt-4 space-y-2">
          <div className="h-2.5 w-full rounded-full bg-white/[0.08]" />
          <div className="h-2.5 w-[92%] rounded-full bg-white/[0.08]" />
          <div className="h-2.5 w-[78%] rounded-full bg-white/[0.08]" />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {tags.map((tag) => <span key={tag} className="rounded-full bg-blue-400/10 px-3 py-1 text-xs text-blue-300">{tag}</span>)}
        </div>
      </div>
    </div>
  );
}

// ── BudgetMockup: usado em plano-de-midia ────────────────────────────────────
export function BudgetMockup({ channels }: { channels: { name: string; pct: number; priority: "alta" | "media" | "baixa" }[] }) {
  const colors = { alta: "#3B82F6", media: "#F59E0B", baixa: "#64748B" };
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1423]/95 p-6 shadow-[0_40px_120px_rgba(0,0,0,0.48)]">
      <div className="flex items-center gap-3">
        <ThumbsUp className="h-5 w-5 text-blue-300" />
        <p className="text-sm font-semibold text-white">Plano de mídia gerado</p>
      </div>
      <div className="mt-6 space-y-4">
        {channels.map((c) => (
          <div key={c.name}>
            <div className="flex items-center justify-between text-sm"><span className="font-medium text-slate-200">{c.name}</span><span className="text-slate-400">{c.pct}% do orçamento</span></div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: colors[c.priority] }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
