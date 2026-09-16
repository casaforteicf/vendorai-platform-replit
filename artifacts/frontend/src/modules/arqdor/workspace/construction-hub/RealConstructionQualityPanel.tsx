import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceProject } from "../WorkspaceContext";

type Props = { arqState?: any };
type Kind = "checklist" | "inspection" | "non_conformity";
type Status = "pending" | "in_progress" | "passed" | "failed" | "resolved" | "cancelled";

type Evidence = { url: string; name?: string; mimeType?: string; caption?: string; uploadedAt?: string };
type QualityItem = {
  id: string;
  kind: Kind;
  title: string;
  category?: string | null;
  description?: string | null;
  severity: string;
  status: Status;
  responsible?: string | null;
  dueDate?: string | null;
  correctiveAction?: string | null;
  notes?: string | null;
  etapaId?: string | null;
  etapaNome?: string | null;
  evidence: Evidence[];
  createdAt?: string | null;
  resolvedAt?: string | null;
};
type Stage = { id: string; nome: string };

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

function normalize(raw: any): QualityItem {
  return {
    id: String(raw?.id ?? ""),
    kind: String(raw?.kind ?? "checklist") as Kind,
    title: String(raw?.title ?? "Item de qualidade"),
    category: raw?.category ?? null,
    description: raw?.description ?? null,
    severity: String(raw?.severity ?? "media"),
    status: String(raw?.status ?? "pending") as Status,
    responsible: raw?.responsible ?? null,
    dueDate: raw?.due_date ?? null,
    correctiveAction: raw?.corrective_action ?? null,
    notes: raw?.notes ?? null,
    etapaId: raw?.etapa_id ?? null,
    etapaNome: raw?.etapa_nome ?? null,
    evidence: Array.isArray(raw?.evidence) ? raw.evidence : [],
    createdAt: raw?.created_at ?? null,
    resolvedAt: raw?.resolved_at ?? null,
  };
}

function statusLabel(status: Status) {
  const labels: Record<Status, string> = {
    pending: "Pendente",
    in_progress: "Em andamento",
    passed: "Conforme",
    failed: "Não conforme",
    resolved: "Resolvido",
    cancelled: "Cancelado",
  };
  return labels[status];
}

function statusClass(status: Status) {
  if (["passed", "resolved"].includes(status)) return "bg-emerald-100 text-emerald-800";
  if (status === "failed") return "bg-rose-100 text-rose-800";
  if (status === "in_progress") return "bg-blue-50 text-blue-700";
  if (status === "cancelled") return "bg-slate-100 text-slate-500";
  return "bg-amber-50 text-amber-800";
}

function severityClass(severity: string) {
  if (severity === "critica") return "bg-rose-600 text-white";
  if (severity === "alta") return "bg-rose-100 text-rose-800";
  if (severity === "media") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>;
}

export default function RealConstructionQualityPanel({ arqState }: Props) {
  const { projectCtx, setProjectCtx } = useWorkspaceProject();
  const meta = useMemo(() => projectMeta(arqState, projectCtx), [arqState, projectCtx]);
  const [obraId, setObraId] = useState("");
  const [obraNome, setObraNome] = useState(meta.name);
  const [items, setItems] = useState<QualityItem[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [mode, setMode] = useState<"all" | "checklist" | "non_conformity">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ kind: "checklist" as Kind, title: "", category: "", description: "", severity: "media", responsible: "", dueDate: "", correctiveAction: "", etapaId: "" });

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
      const data = await api<any>(`/api/arch/construction/${id}/quality?projectId=${encodeURIComponent(meta.id)}`);
      setItems((data.quality ?? []).map(normalize));
      setStages((data.stages ?? []).map((stage: any) => ({ id: String(stage.id), nome: String(stage.nome ?? "Etapa") })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar Qualidade da obra.");
    } finally { setLoading(false); }
  }, [meta.budget, meta.clientName, meta.id, meta.name, meta.status, projectCtx, setProjectCtx]);

  useEffect(() => { void load(); }, [load]);

  const visible = items.filter((item) => mode === "all" ? true : item.kind === mode);
  const metrics = useMemo(() => {
    const open = items.filter((item) => ["pending", "in_progress", "failed"].includes(item.status)).length;
    const ncOpen = items.filter((item) => item.kind === "non_conformity" && !["resolved", "cancelled"].includes(item.status)).length;
    const critical = items.filter((item) => item.kind === "non_conformity" && item.severity === "critica" && !["resolved", "cancelled"].includes(item.status)).length;
    const overdue = items.filter((item) => item.dueDate && !["passed", "resolved", "cancelled"].includes(item.status) && new Date(`${item.dueDate}T23:59:59`) < new Date()).length;
    const resolved = items.filter((item) => ["passed", "resolved"].includes(item.status)).length;
    return { open, ncOpen, critical, overdue, resolved };
  }, [items]);

  async function createItem() {
    if (!obraId || !draft.title.trim()) return;
    setBusy("create"); setError(null);
    try {
      await api(`/api/arch/construction/${obraId}/quality`, {
        method: "POST",
        body: JSON.stringify({
          projectId: meta.id,
          etapaId: draft.etapaId || null,
          kind: draft.kind,
          title: draft.title.trim(),
          category: draft.category.trim() || null,
          description: draft.description.trim() || null,
          severity: draft.severity,
          responsible: draft.responsible.trim() || null,
          dueDate: draft.dueDate || null,
          correctiveAction: draft.correctiveAction.trim() || null,
        }),
      });
      setDraft({ kind: "checklist", title: "", category: "", description: "", severity: "media", responsible: "", dueDate: "", correctiveAction: "", etapaId: "" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao criar item de qualidade."); }
    finally { setBusy(null); }
  }

  async function changeStatus(item: QualityItem, status: Status) {
    if (!obraId) return;
    setBusy(item.id); setError(null);
    try {
      await api(`/api/arch/construction/${obraId}/quality/${item.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao atualizar item."); }
    finally { setBusy(null); }
  }

  async function removeItem(item: QualityItem) {
    if (!obraId || !window.confirm("Excluir este registro de qualidade?")) return;
    setBusy(item.id); setError(null);
    try {
      await api(`/api/arch/construction/${obraId}/quality/${item.id}`, { method: "DELETE" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao excluir item."); }
    finally { setBusy(null); }
  }

  async function uploadEvidence(item: QualityItem, files: FileList | null) {
    if (!obraId || !files?.length) return;
    setBusy(item.id); setError(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append("evidence", file));
      await api(`/api/arch/construction/${obraId}/quality/${item.id}/evidence`, { method: "POST", body: form });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao anexar evidência."); }
    finally { setBusy(null); }
  }

  if (!meta.id) return <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-slate-500">Selecione um projeto antes de abrir Qualidade.</div>;
  if (loading) return <div className="p-8 text-sm text-slate-500">Carregando controle de qualidade…</div>;

  return (
    <div className="space-y-5">
      <header className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-violet-600">ARQDOR • Qualidade da Obra</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{obraNome}</h1><p className="mt-1 text-sm text-slate-500">Checklist, inspeções, não conformidades, ação corretiva e evidências no mesmo histórico.</p></div>
          <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Atualizar</button>
        </div>
      </header>

      {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Abertos" value={String(metrics.open)} hint="itens que exigem ação" />
        <Metric label="NC abertas" value={String(metrics.ncOpen)} hint="não conformidades" />
        <Metric label="Críticas" value={String(metrics.critical)} hint="prioridade imediata" />
        <Metric label="Vencidos" value={String(metrics.overdue)} hint="prazo ultrapassado" />
        <Metric label="Resolvidos" value={String(metrics.resolved)} hint="conformes / encerrados" />
      </section>

      <section className="grid gap-5 2xl:grid-cols-[420px_1fr]">
        <div className="self-start rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Novo controle</h2><p className="mt-1 text-xs text-slate-500">Para o campo: escolha o tipo, descreva o ponto e vincule à etapa.</p>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2"><select value={draft.kind} onChange={(e) => setDraft((v) => ({ ...v, kind: e.target.value as Kind }))} className="rounded-xl border px-3 py-2 text-sm"><option value="checklist">Checklist</option><option value="inspection">Inspeção</option><option value="non_conformity">Não conformidade</option></select><select value={draft.severity} onChange={(e) => setDraft((v) => ({ ...v, severity: e.target.value }))} className="rounded-xl border px-3 py-2 text-sm"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></div>
            <input value={draft.title} onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))} placeholder="O que precisa ser verificado/corrigido?" className="w-full rounded-xl border px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2"><select value={draft.etapaId} onChange={(e) => setDraft((v) => ({ ...v, etapaId: e.target.value }))} className="rounded-xl border px-3 py-2 text-sm"><option value="">Sem etapa</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.nome}</option>)}</select><input value={draft.category} onChange={(e) => setDraft((v) => ({ ...v, category: e.target.value }))} placeholder="Categoria" className="rounded-xl border px-3 py-2 text-sm" /></div>
            <input value={draft.responsible} onChange={(e) => setDraft((v) => ({ ...v, responsible: e.target.value }))} placeholder="Responsável" className="w-full rounded-xl border px-3 py-2 text-sm" />
            <label className="block text-[11px] text-slate-500">Prazo<input type="date" value={draft.dueDate} onChange={(e) => setDraft((v) => ({ ...v, dueDate: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" /></label>
            <textarea rows={3} value={draft.description} onChange={(e) => setDraft((v) => ({ ...v, description: e.target.value }))} placeholder="Descrição / critério de verificação" className="w-full rounded-xl border px-3 py-2 text-sm" />
            {draft.kind === "non_conformity" ? <textarea rows={3} value={draft.correctiveAction} onChange={(e) => setDraft((v) => ({ ...v, correctiveAction: e.target.value }))} placeholder="Ação corretiva proposta" className="w-full rounded-xl border px-3 py-2 text-sm" /> : null}
            <button disabled={!draft.title.trim() || busy === "create"} onClick={() => void createItem()} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy === "create" ? "Salvando…" : "Criar controle"}</button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Controles da obra</h2><p className="text-xs text-slate-500">{items.length} registro(s) no histórico.</p></div><div className="flex gap-2">{([['all','Todos'],['checklist','Checklists'],['non_conformity','Não conformidades']] as const).map(([id,label]) => <button key={id} onClick={() => setMode(id)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${mode === id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600"}`}>{label}</button>)}</div></div></div>

          {visible.length ? visible.map((item) => (
            <article key={item.id} className={`rounded-[28px] border bg-white p-5 shadow-sm ${item.kind === "non_conformity" && !["resolved","cancelled"].includes(item.status) ? "border-rose-200" : "border-slate-100"}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass(item.status)}`}>{statusLabel(item.status)}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${severityClass(item.severity)}`}>{item.severity}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">{item.kind === "non_conformity" ? "NC" : item.kind === "inspection" ? "Inspeção" : "Checklist"}</span></div><h3 className="mt-2 text-lg font-semibold">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.etapaNome || "Sem etapa"}{item.responsible ? ` · ${item.responsible}` : ""}{item.dueDate ? ` · prazo ${new Date(`${item.dueDate}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</p>{item.description ? <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p> : null}{item.correctiveAction ? <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900"><b>Ação corretiva:</b> {item.correctiveAction}</div> : null}</div>
                <div className="flex flex-wrap justify-end gap-2">{item.kind === "non_conformity" ? <>{!["resolved","cancelled"].includes(item.status) ? <button disabled={busy === item.id} onClick={() => void changeStatus(item, "resolved")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Resolver</button> : null}</> : <>{!["passed","cancelled"].includes(item.status) ? <button disabled={busy === item.id} onClick={() => void changeStatus(item, "passed")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Conforme</button> : null}{!["failed","cancelled"].includes(item.status) ? <button disabled={busy === item.id} onClick={() => void changeStatus(item, "failed")} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">Não conforme</button> : null}</>}<label className="cursor-pointer rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">+ Evidência<input type="file" multiple accept="image/*,video/*,application/pdf" onChange={(e) => { void uploadEvidence(item, e.target.files); e.currentTarget.value = ""; }} className="hidden" /></label><button disabled={busy === item.id} onClick={() => void removeItem(item)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">Excluir</button></div>
              </div>
              {item.evidence.length ? <div className="mt-4 flex flex-wrap gap-2">{item.evidence.map((ev, index) => <a key={`${ev.url}-${index}`} href={ev.url} target="_blank" rel="noreferrer" className="max-w-[220px] truncate rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 underline decoration-slate-300">{ev.name || ev.caption || "Evidência"}</a>)}</div> : null}
            </article>
          )) : <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">Nenhum controle neste filtro.</div>}
        </div>
      </section>
    </div>
  );
}
