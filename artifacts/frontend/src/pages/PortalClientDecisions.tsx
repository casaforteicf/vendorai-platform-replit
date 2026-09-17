import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MessageSquare, XCircle } from "lucide-react";

type Decision = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: string | null;
  due_date?: string | null;
  options?: string[] | null;
  financial_impact?: string | number | null;
  schedule_impact_days?: number | null;
};

type Props = {
  token: string;
  decisions: Decision[];
  onResolved: (decisionId: string) => void;
};

function money(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n === 0) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function priorityLabel(priority?: string | null) {
  if (priority === "critical") return "Crítica";
  if (priority === "high") return "Alta";
  if (priority === "low") return "Baixa";
  return "Normal";
}

export default function PortalClientDecisions({ token, decisions, onResolved }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [commentById, setCommentById] = useState<Record<string, string>>({});
  const [optionById, setOptionById] = useState<Record<string, string>>({});
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  const sorted = useMemo(() => decisions ?? [], [decisions]);
  if (sorted.length === 0) return null;

  async function respond(decision: Decision, action: "approve" | "reject") {
    const comment = (commentById[decision.id] ?? "").trim();
    const selectedOption = optionById[decision.id] ?? "";
    if (action === "reject" && !comment) {
      setErrorById((prev) => ({ ...prev, [decision.id]: "Informe o motivo da rejeição." }));
      return;
    }
    setBusyId(decision.id);
    setErrorById((prev) => ({ ...prev, [decision.id]: "" }));
    try {
      const response = await fetch(`/api/portal/obra/${token}/decisions/${decision.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment: comment || undefined, selectedOption: selectedOption || undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível registrar sua decisão.");
      onResolved(decision.id);
    } catch (error) {
      setErrorById((prev) => ({ ...prev, [decision.id]: error instanceof Error ? error.message : "Falha ao responder." }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-xl bg-indigo-600 p-2 text-white"><MessageSquare className="h-5 w-5" /></div>
        <div>
          <h2 className="font-semibold text-indigo-950">Aprovações pendentes</h2>
          <p className="mt-1 text-sm text-indigo-800">Estas decisões aguardam sua manifestação para a obra continuar sem atraso.</p>
        </div>
      </div>

      <div className="space-y-4">
        {sorted.map((decision) => {
          const impact = money(decision.financial_impact);
          const options = Array.isArray(decision.options) ? decision.options.filter(Boolean) : [];
          const busy = busyId === decision.id;
          return (
            <article key={decision.id} className="rounded-2xl border border-indigo-100 bg-white p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{decision.title}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{priorityLabel(decision.priority)}</span>
                  </div>
                  {decision.description ? <p className="mt-2 text-sm leading-relaxed text-slate-600">{decision.description}</p> : null}
                </div>
                {decision.due_date ? <span className="text-xs font-medium text-slate-500">Prazo: {new Date(`${decision.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</span> : null}
              </div>

              {(impact || Number(decision.schedule_impact_days ?? 0) !== 0) ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {impact ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">Impacto financeiro: {impact}</span> : null}
                  {Number(decision.schedule_impact_days ?? 0) !== 0 ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">Impacto no prazo: {decision.schedule_impact_days} dia(s)</span> : null}
                </div>
              ) : null}

              {options.length > 0 ? (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Escolha uma opção</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {options.map((option) => (
                      <label key={option} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm ${optionById[decision.id] === option ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "border-slate-200 text-slate-700"}`}>
                        <input type="radio" className="mr-2" name={`decision-${decision.id}`} value={option} checked={optionById[decision.id] === option} onChange={() => setOptionById((prev) => ({ ...prev, [decision.id]: option }))} />
                        {option}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4">
                <label className="mb-1 block text-xs font-semibold text-slate-500">Comentário {"(opcional ao aprovar)"}</label>
                <textarea value={commentById[decision.id] ?? ""} onChange={(e) => setCommentById((prev) => ({ ...prev, [decision.id]: e.target.value }))} rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" placeholder="Escreva uma observação para a equipe..." />
              </div>

              {errorById[decision.id] ? <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700"><AlertTriangle className="h-4 w-4" />{errorById[decision.id]}</div> : null}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" disabled={busy} onClick={() => void respond(decision, "reject")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Rejeitar
                </button>
                <button type="button" disabled={busy} onClick={() => void respond(decision, "approve")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aprovar
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
