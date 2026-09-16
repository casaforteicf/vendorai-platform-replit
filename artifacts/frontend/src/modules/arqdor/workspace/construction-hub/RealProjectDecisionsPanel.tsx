import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceProject } from "../WorkspaceContext";

type Props = { arqState?: any; onNavigate?: (module: string) => void };
type DecisionStatus = "pending" | "approved" | "rejected" | "cancelled";
type DecisionType = "client" | "technical" | "commercial" | "scope_change";
type Priority = "low" | "medium" | "high" | "critical";

type Attachment = { url: string; name?: string; mimeType?: string; uploadedAt?: string };
type Decision = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  decisionType: DecisionType;
  status: DecisionStatus;
  priority: Priority;
  responsible?: string | null;
  dueDate?: string | null;
  financialImpact: number;
  scheduleImpactDays: number;
  requiresBudgetRevision: boolean;
  budgetRevisionStatus: "not-required" | "pending" | "applied";
  source: string;
  options: string[];
  selectedOption?: string | null;
  decisionComment?: string | null;
  etapaId?: string | null;
  etapaNome?: string | null;
  requestedByName?: string | null;
  decidedByName?: string | null;
  decidedAt?: string | null;
  attachments: Attachment[];
};
type Stage = { id: string; nome: string };
type Budget = { id: string; title?: string | null; grand_total?: string | number | null; status?: string | null } | null;

function token() { return localStorage.getItem("vendorai_token") ?? ""; }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any)?.error ?? `Erro ${response.status}`);
  return data as T;
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function projectMeta(arqState: any, projectCtx: any) {
  const project = arqState?.currentProject ?? arqState?.selectedProject ?? arqState?.project ?? {};
  return {
    id: String(projectCtx?.id || arqState?.projectId || project?.id || ""),
    name: String(projectCtx?.name || project?.titulo || project?.title || project?.name || "Projeto ARQDOR"),
    clientName: project?.clienteNome || project?.clientName || null,
    budget: project?.orcamentoTotal || null,
    status: project?.status || null,
  };
}

function normalize(raw: any): Decision {
  let selected: string | null = null;
  if (typeof raw?.selected_option === "string") selected = raw.selected_option;
  else if (raw?.selected_option != null) selected = String(raw.selected_option);
  return {
    id: String(raw?.id ?? ""),
    title: String(raw?.title ?? "Decisão"),
    description: raw?.description ?? null,
    category: raw?.category ?? null,
    decisionType: String(raw?.decision_type ?? "client") as DecisionType,
    status: String(raw?.status ?? "pending") as DecisionStatus,
    priority: String(raw?.priority ?? "medium") as Priority,
    responsible: raw?.responsible ?? null,
    dueDate: raw?.due_date ?? null,
    financialImpact: n(raw?.financial_impact),
    scheduleImpactDays: n(raw?.schedule_impact_days),
    requiresBudgetRevision: Boolean(raw?.requires_budget_revision),
    budgetRevisionStatus: String(raw?.budget_revision_status ?? "not-required") as Decision["budgetRevisionStatus"],
    source: String(raw?.source ?? "manual"),
    options: Array.isArray(raw?.options) ? raw.options.map(String) : [],
    selectedOption: selected,
    decisionComment: raw?.decision_comment ?? null,
    etapaId: raw?.etapa_id ?? null,
    etapaNome: raw?.etapa_nome ?? null,
    requestedByName: raw?.requested_by_name ?? null,
    decidedByName: raw?.decided_by_name ?? null,
    decidedAt: raw?.decided_at ?? null,
    attachments: Array.isArray(raw?.attachments) ? raw.attachments : [],
  };
}

function statusLabel(status: DecisionStatus) {
  return status === "approved" ? "Aprovada" : status === "rejected" ? "Reprovada" : status === "cancelled" ? "Cancelada" : "Pendente";
}

function statusClass(status: DecisionStatus) {
  if (status === "approved") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-rose-100 text-rose-800";
  if (status === "cancelled") return "bg-slate-100 text-slate-500";
  return "bg-amber-50 text-amber-800";
}

function priorityClass(priority: Priority) {
  if (priority === "critical") return "bg-rose-600 text-white";
  if (priority === "high") return "bg-rose-100 text-rose-800";
  if (priority === "medium") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

function typeLabel(type: DecisionType) {
  return type === "technical" ? "Técnica" : type === "commercial" ? "Comercial" : type === "scope_change" ? "Alteração de escopo" : "Cliente";
}

function Metric({ label, value, hint, danger }: { label: string; value: string; hint: string; danger?: boolean }) {
  return <div className={`rounded-[26px] border bg-white p-4 shadow-sm ${danger ? "border-rose-200" : "border-slate-100"}`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className={`mt-2 text-2xl font-semibold ${danger ? "text-rose-700" : "text-slate-950"}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>;
}

export default function RealProjectDecisionsPanel({ arqState, onNavigate }: Props) {
  const { projectCtx, setProjectCtx } = useWorkspaceProject();
  const meta = useMemo(() => projectMeta(arqState, projectCtx), [arqState, projectCtx]);
  const [obraId, setObraId] = useState("");
  const [obraNome, setObraNome] = useState(meta.name);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [budget, setBudget] = useState<Budget>(null);
  const [filter, setFilter] = useState<"all" | DecisionStatus>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState({
    title: "", description: "", category: "", decisionType: "client" as DecisionType,
    priority: "medium" as Priority, responsible: "", dueDate: "", etapaId: "",
    financialImpact: "0", scheduleImpactDays: "0", requiresBudgetRevision: false,
    source: "manual", optionsText: "",
  });

  const load = useCallback(async () => {
    if (!meta.id) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const ensured = await api<{ obra: any }>("/api/arch/construction/ensure", {
        method: "POST",
        body: JSON.stringify({ projectId: meta.id, name: meta.name, clientName: meta.clientName, budget: meta.budget, status: meta.status }),
      });
      const id = String(ensured.obra?.id ?? "");
      if (!id) throw new Error("Não foi possível vincular o projeto à obra.");
      setObraId(id);
      setObraNome(String(ensured.obra?.nome ?? meta.name));
      if ((projectCtx as any)?.obraId !== id) setProjectCtx({ ...(projectCtx as any), id: meta.id, name: meta.name, obraId: id } as any);
      const data = await api<any>(`/api/arch/construction/${id}/decisions?projectId=${encodeURIComponent(meta.id)}`);
      setDecisions((data.decisions ?? []).map(normalize));
      setStages((data.stages ?? []).map((stage: any) => ({ id: String(stage.id), nome: String(stage.nome ?? "Etapa") })));
      setBudget(data.budget ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar Decisões da Obra.");
    } finally { setLoading(false); }
  }, [meta.budget, meta.clientName, meta.id, meta.name, meta.status, projectCtx, setProjectCtx]);

  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => {
    const pending = decisions.filter((d) => d.status === "pending").length;
    const overdue = decisions.filter((d) => d.status === "pending" && d.dueDate && new Date(`${d.dueDate}T23:59:59`) < new Date()).length;
    const pendingBudget = decisions.filter((d) => d.status === "approved" && d.requiresBudgetRevision && d.budgetRevisionStatus === "pending").length;
    const approvedImpact = decisions.filter((d) => d.status === "approved").reduce((sum, d) => sum + d.financialImpact, 0);
    const scheduleDays = decisions.filter((d) => d.status === "approved").reduce((sum, d) => sum + d.scheduleImpactDays, 0);
    return { pending, overdue, pendingBudget, approvedImpact, scheduleDays };
  }, [decisions]);

  const visible = filter === "all" ? decisions : decisions.filter((d) => d.status === filter);

  async function createDecision() {
    if (!obraId || !draft.title.trim()) return;
    setBusy("create"); setError(null);
    try {
      const options = draft.optionsText.split("\n").map((item) => item.trim()).filter(Boolean);
      await api(`/api/arch/construction/${obraId}/decisions`, {
        method: "POST",
        body: JSON.stringify({
          projectId: meta.id,
          etapaId: draft.etapaId || null,
          budgetId: budget?.id ?? null,
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          category: draft.category.trim() || null,
          decisionType: draft.decisionType,
          priority: draft.priority,
          responsible: draft.responsible.trim() || null,
          dueDate: draft.dueDate || null,
          financialImpact: n(draft.financialImpact),
          scheduleImpactDays: Math.trunc(n(draft.scheduleImpactDays)),
          requiresBudgetRevision: draft.requiresBudgetRevision,
          source: draft.source,
          options,
        }),
      });
      setDraft({ title: "", description: "", category: "", decisionType: "client", priority: "medium", responsible: "", dueDate: "", etapaId: "", financialImpact: "0", scheduleImpactDays: "0", requiresBudgetRevision: false, source: "manual", optionsText: "" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao criar decisão."); }
    finally { setBusy(null); }
  }

  async function decide(item: Decision, status: DecisionStatus) {
    if (!obraId) return;
    setBusy(item.id); setError(null);
    try {
      const selectedOption = selectedOptions[item.id] || item.selectedOption || null;
      await api(`/api/arch/construction/${obraId}/decisions/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, selectedOption }),
      });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao registrar decisão."); }
    finally { setBusy(null); }
  }

  async function markBudgetApplied(item: Decision) {
    if (!obraId) return;
    setBusy(item.id); setError(null);
    try {
      await api(`/api/arch/construction/${obraId}/decisions/${item.id}`, { method: "PATCH", body: JSON.stringify({ budgetRevisionStatus: "applied" }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao atualizar revisão do orçamento."); }
    finally { setBusy(null); }
  }

  async function uploadAttachment(item: Decision, files: FileList | null) {
    if (!obraId || !files?.length) return;
    setBusy(item.id); setError(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append("attachments", file));
      await api(`/api/arch/construction/${obraId}/decisions/${item.id}/attachments`, { method: "POST", body: form });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao anexar evidência."); }
    finally { setBusy(null); }
  }

  async function removeDecision(item: Decision) {
    if (!obraId || !window.confirm("Excluir esta decisão do histórico?")) return;
    setBusy(item.id); setError(null);
    try {
      await api(`/api/arch/construction/${obraId}/decisions/${item.id}`, { method: "DELETE" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao excluir decisão."); }
    finally { setBusy(null); }
  }

  if (!meta.id) return <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-slate-500">Selecione um projeto antes de abrir Decisões.</div>;
  if (loading) return <div className="p-8 text-sm text-slate-500">Carregando decisões da obra…</div>;

  return (
    <div className="space-y-5">
      <header className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-violet-600">ARQDOR • Decisões da Obra</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{obraNome}</h1><p className="mt-1 text-sm text-slate-500">Escolhas, alterações e aprovações deixam de ficar perdidas em conversas e passam a ter responsável, prazo e impacto.</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Atualizar</button><button onClick={() => onNavigate?.("real-budget")} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Abrir orçamento</button></div>
        </div>
        {budget ? <p className="mt-3 text-xs text-slate-500">Orçamento vinculado: <b>{budget.title || budget.id}</b> · {money(n(budget.grand_total))}</p> : null}
      </header>

      {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Pendentes" value={String(metrics.pending)} hint="aguardando decisão" />
        <Metric label="Vencidas" value={String(metrics.overdue)} hint="prazo ultrapassado" danger={metrics.overdue > 0} />
        <Metric label="Revisões do orçamento" value={String(metrics.pendingBudget)} hint="aprovadas e não aplicadas" danger={metrics.pendingBudget > 0} />
        <Metric label="Impacto aprovado" value={money(metrics.approvedImpact)} hint="aumento/redução previstos" />
        <Metric label="Impacto de prazo" value={`${metrics.scheduleDays} dias`} hint="saldo das decisões aprovadas" />
      </section>

      <section className="grid gap-5 2xl:grid-cols-[420px_1fr]">
        <div className="self-start rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Nova decisão</h2><p className="mt-1 text-xs text-slate-500">Registre a dúvida ou alteração antes de executar.</p>
          <div className="mt-4 space-y-3">
            <input value={draft.title} onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))} placeholder="Ex.: escolher revestimento da piscina" className="w-full rounded-xl border px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2"><select value={draft.decisionType} onChange={(e) => setDraft((v) => ({ ...v, decisionType: e.target.value as DecisionType }))} className="rounded-xl border px-3 py-2 text-sm"><option value="client">Cliente</option><option value="technical">Técnica</option><option value="commercial">Comercial</option><option value="scope_change">Alteração de escopo</option></select><select value={draft.priority} onChange={(e) => setDraft((v) => ({ ...v, priority: e.target.value as Priority }))} className="rounded-xl border px-3 py-2 text-sm"><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="critical">Crítica</option></select></div>
            <div className="grid grid-cols-2 gap-2"><select value={draft.etapaId} onChange={(e) => setDraft((v) => ({ ...v, etapaId: e.target.value }))} className="rounded-xl border px-3 py-2 text-sm"><option value="">Sem etapa</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.nome}</option>)}</select><input value={draft.category} onChange={(e) => setDraft((v) => ({ ...v, category: e.target.value }))} placeholder="Categoria" className="rounded-xl border px-3 py-2 text-sm" /></div>
            <input value={draft.responsible} onChange={(e) => setDraft((v) => ({ ...v, responsible: e.target.value }))} placeholder="Quem precisa decidir?" className="w-full rounded-xl border px-3 py-2 text-sm" />
            <label className="block text-[11px] text-slate-500">Prazo da decisão<input type="date" value={draft.dueDate} onChange={(e) => setDraft((v) => ({ ...v, dueDate: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" /></label>
            <textarea rows={3} value={draft.description} onChange={(e) => setDraft((v) => ({ ...v, description: e.target.value }))} placeholder="Contexto, motivo e restrições" className="w-full rounded-xl border px-3 py-2 text-sm" />
            <textarea rows={3} value={draft.optionsText} onChange={(e) => setDraft((v) => ({ ...v, optionsText: e.target.value }))} placeholder={'Alternativas, uma por linha\nEx.: Porcelanato cinza\nPedra natural'} className="w-full rounded-xl border px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2"><label className="text-[11px] text-slate-500">Impacto R$<input type="number" step="0.01" value={draft.financialImpact} onChange={(e) => setDraft((v) => ({ ...v, financialImpact: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" /></label><label className="text-[11px] text-slate-500">Impacto em dias<input type="number" value={draft.scheduleImpactDays} onChange={(e) => setDraft((v) => ({ ...v, scheduleImpactDays: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" /></label></div>
            <div className="grid grid-cols-2 gap-2"><select value={draft.source} onChange={(e) => setDraft((v) => ({ ...v, source: e.target.value }))} className="rounded-xl border px-3 py-2 text-sm"><option value="manual">Manual</option><option value="whatsapp">WhatsApp</option><option value="meeting">Reunião</option><option value="client_portal">Portal do cliente</option><option value="site">Obra/campo</option></select><label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"><input type="checkbox" checked={draft.requiresBudgetRevision} onChange={(e) => setDraft((v) => ({ ...v, requiresBudgetRevision: e.target.checked }))} /> Exige revisar orçamento</label></div>
            <button disabled={!draft.title.trim() || busy === "create"} onClick={() => void createDecision()} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy === "create" ? "Salvando…" : "Registrar decisão"}</button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Histórico de decisões</h2><p className="text-xs text-slate-500">{decisions.length} registro(s) auditáveis.</p></div><div className="flex flex-wrap gap-2">{([['all','Todas'],['pending','Pendentes'],['approved','Aprovadas'],['rejected','Reprovadas']] as const).map(([id,label]) => <button key={id} onClick={() => setFilter(id)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${filter === id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600"}`}>{label}</button>)}</div></div></div>

          {visible.length ? visible.map((item) => (
            <article key={item.id} className={`rounded-[28px] border bg-white p-5 shadow-sm ${item.status === "pending" && item.priority === "critical" ? "border-rose-300" : "border-slate-100"}`}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass(item.status)}`}>{statusLabel(item.status)}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${priorityClass(item.priority)}`}>{item.priority}</span><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase text-violet-700">{typeLabel(item.decisionType)}</span>{item.requiresBudgetRevision ? <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${item.budgetRevisionStatus === "applied" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>Orçamento: {item.budgetRevisionStatus === "applied" ? "aplicado" : "revisar"}</span> : null}</div><h3 className="mt-2 text-lg font-semibold">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.etapaNome || "Sem etapa"}{item.responsible ? ` · decisão: ${item.responsible}` : ""}{item.dueDate ? ` · prazo ${new Date(`${item.dueDate}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</p>{item.description ? <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p> : null}<div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500"><span>Impacto: <b>{money(item.financialImpact)}</b></span><span>Prazo: <b>{item.scheduleImpactDays} dias</b></span><span>Origem: <b>{item.source}</b></span></div>{item.options.length ? <div className="mt-4"><p className="text-xs font-semibold text-slate-700">Alternativas</p><select value={selectedOptions[item.id] ?? item.selectedOption ?? ""} onChange={(e) => setSelectedOptions((v) => ({ ...v, [item.id]: e.target.value }))} disabled={item.status !== "pending"} className="mt-2 w-full max-w-xl rounded-xl border px-3 py-2 text-sm"><option value="">Selecione a opção decidida</option>{item.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></div> : null}{item.decidedAt ? <p className="mt-3 text-xs text-slate-400">Decidido em {new Date(item.decidedAt).toLocaleString("pt-BR")}{item.decidedByName ? ` por ${item.decidedByName}` : ""}</p> : null}</div>
                <div className="flex flex-wrap justify-end gap-2">{item.status === "pending" ? <><button disabled={busy === item.id} onClick={() => void decide(item, "approved")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprovar</button><button disabled={busy === item.id} onClick={() => void decide(item, "rejected")} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">Reprovar</button></> : <button disabled={busy === item.id} onClick={() => void decide(item, "pending")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">Reabrir</button>}{item.status === "approved" && item.requiresBudgetRevision && item.budgetRevisionStatus === "pending" ? <><button onClick={() => onNavigate?.("real-budget")} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">Abrir orçamento</button><button disabled={busy === item.id} onClick={() => void markBudgetApplied(item)} className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700">Revisão aplicada</button></> : null}<label className="cursor-pointer rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">+ Anexo<input type="file" multiple accept="image/*,video/*,application/pdf" onChange={(e) => { void uploadAttachment(item, e.target.files); e.currentTarget.value = ""; }} className="hidden" /></label><button disabled={busy === item.id} onClick={() => void removeDecision(item)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">Excluir</button></div>
              </div>
              {item.attachments.length ? <div className="mt-4 flex flex-wrap gap-2">{item.attachments.map((file, index) => <a key={`${file.url}-${index}`} href={file.url} target="_blank" rel="noreferrer" className="max-w-[220px] truncate rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 underline decoration-slate-300">{file.name || "Anexo"}</a>)}</div> : null}
            </article>
          )) : <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">Nenhuma decisão neste filtro.</div>}
        </div>
      </section>
    </div>
  );
}
