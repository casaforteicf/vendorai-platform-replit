import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceProject } from "../WorkspaceContext";

type Props = { arqState?: any };

type Launch = {
  id: string;
  tipo: string;
  fornecedor?: string | null;
  numero?: string | null;
  valor: number;
  dataEmissao?: string | null;
  dataVencimento?: string | null;
  descricao?: string | null;
  status: string;
  etapaId?: string | null;
  observacoes?: string | null;
};

type Dre = {
  orcamentoTotal: number;
  totalGasto: number;
  totalPago: number;
  totalPendente: number;
  saldo: number;
  porTipo: Array<{ tipo: string; total: number }>;
  etapas: Array<{ id: string; nome: string; totalGasto: number }>;
  semEtapa: number;
};

type ProcurementRequest = {
  id: string;
  descricao: string;
  valor_total?: string | number | null;
  status?: string | null;
  cotacao_selecionada_id?: string | null;
  lancamento_financeiro_id?: string | null;
};

type Stage = { id: string; nome: string };

function token() {
  return localStorage.getItem("vendorai_token") ?? "";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
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

function normalizeLaunch(raw: any): Launch {
  return {
    id: String(raw?.id ?? ""),
    tipo: String(raw?.tipo ?? "outros"),
    fornecedor: raw?.fornecedor ?? null,
    numero: raw?.numero ?? null,
    valor: n(raw?.valor),
    dataEmissao: raw?.dataEmissao ?? raw?.data_emissao ?? null,
    dataVencimento: raw?.dataVencimento ?? raw?.data_vencimento ?? null,
    descricao: raw?.descricao ?? null,
    status: String(raw?.status ?? "pendente"),
    etapaId: raw?.etapaId ?? raw?.etapa_id ?? null,
    observacoes: raw?.observacoes ?? null,
  };
}

function statusClass(status: string) {
  if (status === "pago") return "bg-emerald-100 text-emerald-800";
  if (status === "cancelado") return "bg-rose-50 text-rose-700";
  if (status === "vencido") return "bg-rose-100 text-rose-800";
  return "bg-amber-50 text-amber-800";
}

function Metric({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className={`rounded-[26px] border bg-white p-4 shadow-sm ${danger ? "border-rose-200" : "border-slate-100"}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${danger ? "text-rose-700" : "text-slate-950"}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function RealConstructionFinancePanel({ arqState }: Props) {
  const { user } = useAuth();
  const { projectCtx, setProjectCtx } = useWorkspaceProject();
  const meta = useMemo(() => projectMeta(arqState, projectCtx), [arqState, projectCtx]);
  const tenantId = user?.tenantId ?? "";

  const [obraId, setObraId] = useState("");
  const [obraNome, setObraNome] = useState(meta.name);
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [dre, setDre] = useState<Dre | null>(null);
  const [procurement, setProcurement] = useState<ProcurementRequest[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"todos" | "pendente" | "pago" | "cancelado">("todos");
  const [draft, setDraft] = useState({ tipo: "material", fornecedor: "", valor: "", dataEmissao: new Date().toISOString().slice(0, 10), dataVencimento: "", descricao: "", etapaId: "", status: "pendente", observacoes: "" });

  const load = useCallback(async () => {
    if (!meta.id || !tenantId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
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

      const [launchRaw, dreRaw, procurementRaw] = await Promise.all([
        api<any[]>(`/api/tenants/${tenantId}/obras/${id}/lancamentos`),
        api<Dre>(`/api/tenants/${tenantId}/obras/${id}/financeiro/dre`),
        api<any>(`/api/arch/procurement/${id}`),
      ]);
      setLaunches((launchRaw ?? []).map(normalizeLaunch));
      setDre(dreRaw);
      setProcurement(procurementRaw?.requests ?? []);
      setStages((procurementRaw?.stages ?? []).map((stage: any) => ({ id: String(stage.id), nome: String(stage.nome ?? "Etapa") })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar o financeiro da obra.");
    } finally {
      setLoading(false);
    }
  }, [meta.budget, meta.clientName, meta.id, meta.name, meta.status, projectCtx, setProjectCtx, tenantId]);

  useEffect(() => { void load(); }, [load]);

  const purchaseCommitment = procurement
    .filter((item) => item.cotacao_selecionada_id && !item.lancamento_financeiro_id && item.status !== "cancelado")
    .reduce((sum, item) => sum + n(item.valor_total), 0);
  const launched = n(dre?.totalGasto);
  const paid = n(dre?.totalPago);
  const pending = n(dre?.totalPendente);
  const budget = n(dre?.orcamentoTotal);
  const forecastCost = launched + purchaseCommitment;
  const projectedBalance = budget - forecastCost;
  const filteredLaunches = filter === "todos" ? launches : launches.filter((item) => item.status === filter);

  async function createLaunch() {
    if (!obraId || !tenantId || !draft.valor) return;
    setBusy("create"); setError(null);
    try {
      await api(`/api/tenants/${tenantId}/obras/${obraId}/lancamentos`, {
        method: "POST",
        body: JSON.stringify({
          tipo: draft.tipo,
          fornecedor: draft.fornecedor.trim() || null,
          valor: n(draft.valor),
          dataEmissao: draft.dataEmissao || null,
          dataVencimento: draft.dataVencimento || null,
          descricao: draft.descricao.trim() || null,
          etapaId: draft.etapaId || null,
          status: draft.status,
          observacoes: draft.observacoes.trim() || null,
        }),
      });
      setDraft({ tipo: "material", fornecedor: "", valor: "", dataEmissao: new Date().toISOString().slice(0, 10), dataVencimento: "", descricao: "", etapaId: "", status: "pendente", observacoes: "" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao criar lançamento."); }
    finally { setBusy(null); }
  }

  async function changeStatus(item: Launch, status: "pendente" | "pago" | "cancelado") {
    if (!obraId || !tenantId) return;
    setBusy(item.id); setError(null);
    try {
      await api(`/api/tenants/${tenantId}/obras/${obraId}/lancamentos/${item.id}`, { method: "PUT", body: JSON.stringify({ status }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao atualizar lançamento."); }
    finally { setBusy(null); }
  }

  async function removeLaunch(item: Launch) {
    if (!obraId || !tenantId || !window.confirm("Excluir este lançamento financeiro?")) return;
    setBusy(item.id); setError(null);
    try {
      await api(`/api/tenants/${tenantId}/obras/${obraId}/lancamentos/${item.id}`, { method: "DELETE" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao excluir lançamento."); }
    finally { setBusy(null); }
  }

  async function downloadDre() {
    if (!obraId || !tenantId) return;
    setBusy("pdf"); setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/financeiro/dre/pdf`, {
        method: "POST",
        headers: { ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
      });
      if (!response.ok) throw new Error("Não foi possível gerar o DRE em PDF.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `dre-${obraNome.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao gerar PDF."); }
    finally { setBusy(null); }
  }

  if (!meta.id) return <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-slate-500">Selecione um projeto antes de abrir o Financeiro.</div>;
  if (!tenantId) return <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-slate-500">Tenant ativo não identificado.</div>;
  if (loading) return <div className="p-8 text-sm text-slate-500">Consolidando financeiro da obra…</div>;

  return (
    <div className="space-y-5">
      <header className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">ARQDOR • Financeiro da Obra</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{obraNome}</h1>
            <p className="mt-1 text-sm text-slate-500">Orçamento, compras comprometidas, contas a pagar e realizado no mesmo contexto da obra.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Atualizar</button>
            <button type="button" onClick={() => void downloadDre()} disabled={busy === "pdf"} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">DRE em PDF</button>
          </div>
        </div>
      </header>

      {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Orçamento" value={money(budget)} hint="base aprovada" />
        <Metric label="Compras comprometidas" value={money(purchaseCommitment)} hint="aprovadas, ainda fora do financeiro" />
        <Metric label="Lançado" value={money(launched)} hint="não cancelado" />
        <Metric label="Pago" value={money(paid)} hint="realizado financeiro" />
        <Metric label="Pendente" value={money(pending)} hint="contas a pagar" />
        <Metric label="Saldo projetado" value={money(projectedBalance)} hint={`custo previsto ${money(forecastCost)}`} danger={projectedBalance < 0} />
      </section>

      <section className="grid gap-5 2xl:grid-cols-[420px_1fr]">
        <div className="self-start rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Novo lançamento</h2>
          <p className="mt-1 text-xs text-slate-500">Use para despesas que não nasceram automaticamente em Compras.</p>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select value={draft.tipo} onChange={(e) => setDraft((v) => ({ ...v, tipo: e.target.value }))} className="rounded-xl border px-3 py-2 text-sm"><option value="material">Material</option><option value="mao_de_obra">Mão de obra</option><option value="servico">Serviço</option><option value="equipamento">Equipamento</option><option value="frete">Frete</option><option value="taxa">Taxa</option><option value="outros">Outros</option></select>
              <select value={draft.status} onChange={(e) => setDraft((v) => ({ ...v, status: e.target.value }))} className="rounded-xl border px-3 py-2 text-sm"><option value="pendente">Pendente</option><option value="pago">Pago</option></select>
            </div>
            <input value={draft.fornecedor} onChange={(e) => setDraft((v) => ({ ...v, fornecedor: e.target.value }))} placeholder="Fornecedor / favorecido" className="w-full rounded-xl border px-3 py-2 text-sm" />
            <input type="number" min="0" step="0.01" value={draft.valor} onChange={(e) => setDraft((v) => ({ ...v, valor: e.target.value }))} placeholder="Valor" className="w-full rounded-xl border px-3 py-2 text-sm" />
            <select value={draft.etapaId} onChange={(e) => setDraft((v) => ({ ...v, etapaId: e.target.value }))} className="w-full rounded-xl border px-3 py-2 text-sm"><option value="">Sem etapa vinculada</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.nome}</option>)}</select>
            <div className="grid grid-cols-2 gap-2"><label className="text-[11px] text-slate-500">Emissão<input type="date" value={draft.dataEmissao} onChange={(e) => setDraft((v) => ({ ...v, dataEmissao: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" /></label><label className="text-[11px] text-slate-500">Vencimento<input type="date" value={draft.dataVencimento} onChange={(e) => setDraft((v) => ({ ...v, dataVencimento: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" /></label></div>
            <input value={draft.descricao} onChange={(e) => setDraft((v) => ({ ...v, descricao: e.target.value }))} placeholder="Descrição" className="w-full rounded-xl border px-3 py-2 text-sm" />
            <textarea rows={2} value={draft.observacoes} onChange={(e) => setDraft((v) => ({ ...v, observacoes: e.target.value }))} placeholder="Observações" className="w-full rounded-xl border px-3 py-2 text-sm" />
            <button type="button" onClick={() => void createLaunch()} disabled={!draft.valor || busy === "create"} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy === "create" ? "Salvando…" : "Adicionar lançamento"}</button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-semibold">Movimentações financeiras</h2><p className="text-xs text-slate-500">{launches.length} lançamento(s) registrados.</p></div>
              <div className="flex flex-wrap gap-2">{(["todos", "pendente", "pago", "cancelado"] as const).map((id) => <button key={id} onClick={() => setFilter(id)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${filter === id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600"}`}>{id === "todos" ? "Todos" : id[0]!.toUpperCase() + id.slice(1)}</button>)}</div>
            </div>
          </div>

          {filteredLaunches.length ? filteredLaunches.map((item) => (
            <article key={item.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass(item.status)}`}>{item.status}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">{item.tipo.replaceAll("_", " ")}</span></div>
                  <h3 className="mt-2 font-semibold">{item.fornecedor || item.descricao || "Lançamento da obra"}</h3>
                  <p className="mt-1 text-xs text-slate-500">{item.descricao || "Sem descrição"}{item.dataVencimento ? ` · vence ${new Date(`${item.dataVencimento}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</p>
                </div>
                <div className="text-right"><p className="text-xl font-semibold">{money(item.valor)}</p><div className="mt-2 flex flex-wrap justify-end gap-2">{item.status !== "pago" && item.status !== "cancelado" ? <button disabled={busy === item.id} onClick={() => void changeStatus(item, "pago")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Marcar pago</button> : null}{item.status === "pago" ? <button disabled={busy === item.id} onClick={() => void changeStatus(item, "pendente")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">Reabrir</button> : null}{item.status !== "cancelado" ? <button disabled={busy === item.id} onClick={() => void changeStatus(item, "cancelado")} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-600">Cancelar</button> : null}<button disabled={busy === item.id} onClick={() => void removeLaunch(item)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">Excluir</button></div></div>
              </div>
            </article>
          )) : <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">Nenhum lançamento neste filtro.</div>}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Despesas por tipo</h2>
          <div className="mt-4 space-y-3">{dre?.porTipo?.length ? [...dre.porTipo].sort((a, b) => b.total - a.total).map((item) => <div key={item.tipo}><div className="flex justify-between text-sm"><span>{item.tipo.replaceAll("_", " ")}</span><b>{money(item.total)}</b></div><div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-violet-600" style={{ width: `${launched > 0 ? Math.min(100, (item.total / launched) * 100) : 0}%` }} /></div></div>) : <p className="text-sm text-slate-500">Sem dados por tipo.</p>}</div>
        </div>
        <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Custo por etapa</h2>
          <div className="mt-4 space-y-3">{dre?.etapas?.length ? [...dre.etapas].sort((a, b) => b.totalGasto - a.totalGasto).map((item) => <div key={item.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm"><span>{item.nome}</span><b>{money(item.totalGasto)}</b></div>) : <p className="text-sm text-slate-500">Sem etapas com custo.</p>}{dre && dre.semEtapa > 0 ? <div className="mt-3 flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><span>Sem etapa vinculada</span><b>{money(dre.semEtapa)}</b></div> : null}</div>
        </div>
      </section>
    </div>
  );
}
