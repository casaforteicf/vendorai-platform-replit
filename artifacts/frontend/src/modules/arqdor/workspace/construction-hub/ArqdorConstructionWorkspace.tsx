import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceProject } from "../WorkspaceContext";

type View = "overview" | "schedule" | "diary" | "measurements" | "purchases" | "financial";

type Obra = {
  id: string;
  nome: string;
  clienteNome?: string | null;
  endereco?: string | null;
  status?: string | null;
  orcamentoTotal?: string | null;
  custoRealizado?: string | null;
  percentualGeral?: number;
};

type Etapa = {
  id: string;
  nome: string;
  dataInicioPrevista?: string | null;
  dataFimPrevista?: string | null;
  status?: string | null;
  percentualExecutado?: string | null;
};

type Diario = {
  id: string;
  data: string;
  conteudo: string;
  responsavelNome?: string | null;
  status?: string | null;
  climaTempo?: string | null;
  maoDeObra?: number | null;
  fotos?: Array<{ url: string; caption?: string }> | null;
};

type Compra = {
  id: string;
  descricao: string;
  fornecedor?: string | null;
  quantidade?: string | null;
  valorUnitario?: string | null;
  valorTotal?: string | null;
  status?: string | null;
  dataPrevista?: string | null;
};

type Medicao = {
  id: string;
  etapaId: string;
  data: string;
  percentualAnterior?: string | null;
  percentualNovo: string;
  observacao?: string | null;
};

type Props = {
  arqState?: any;
  onNavigate?: (module: string) => void;
};

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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any)?.error ?? `Erro ${response.status}`);
  return data as T;
}

function currency(value?: string | number | null) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(value?: string | number | null) {
  return `${Math.max(0, Math.min(100, Number(value ?? 0))).toFixed(0)}%`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function projectMeta(arqState: any, projectCtx: any) {
  const candidate = arqState?.currentProject ?? arqState?.selectedProject ?? arqState?.project ?? {};
  return {
    id: String(projectCtx?.id || arqState?.projectId || candidate?.id || ""),
    name: String(projectCtx?.name || candidate?.titulo || candidate?.title || candidate?.name || "Projeto ARQDOR"),
    clientName: candidate?.clienteNome || candidate?.clientName || null,
    budget: candidate?.orcamentoTotal || null,
    status: candidate?.status || null,
  };
}

function normalizeObra(raw: any): Obra {
  return {
    id: String(raw?.id ?? ""),
    nome: String(raw?.nome ?? "Obra"),
    clienteNome: raw?.clienteNome ?? raw?.cliente_nome ?? null,
    endereco: raw?.endereco ?? null,
    status: raw?.status ?? null,
    orcamentoTotal: raw?.orcamentoTotal ?? raw?.orcamento_total ?? null,
    custoRealizado: raw?.custoRealizado ?? raw?.custo_realizado ?? null,
    percentualGeral: Number(raw?.percentualGeral ?? 0),
  };
}

function normalizeEtapa(raw: any): Etapa {
  return {
    id: String(raw?.id ?? ""),
    nome: String(raw?.nome ?? "Etapa"),
    dataInicioPrevista: raw?.dataInicioPrevista ?? raw?.data_inicio_prevista ?? null,
    dataFimPrevista: raw?.dataFimPrevista ?? raw?.data_fim_prevista ?? null,
    status: raw?.status ?? null,
    percentualExecutado: raw?.percentualExecutado ?? raw?.percentual_executado ?? "0",
  };
}

function normalizeDiario(raw: any): Diario {
  return {
    id: String(raw?.id ?? ""),
    data: String(raw?.data ?? ""),
    conteudo: String(raw?.conteudo ?? ""),
    responsavelNome: raw?.responsavelNome ?? raw?.responsavel_nome ?? null,
    status: raw?.status ?? null,
    climaTempo: raw?.climaTempo ?? raw?.clima_tempo ?? null,
    maoDeObra: raw?.maoDeObra ?? raw?.mao_de_obra ?? null,
    fotos: Array.isArray(raw?.fotos) ? raw.fotos : null,
  };
}

function normalizeCompra(raw: any): Compra {
  return {
    id: String(raw?.id ?? ""),
    descricao: String(raw?.descricao ?? "Compra"),
    fornecedor: raw?.fornecedor ?? null,
    quantidade: raw?.quantidade ?? null,
    valorUnitario: raw?.valorUnitario ?? raw?.valor_unitario ?? null,
    valorTotal: raw?.valorTotal ?? raw?.valor_total ?? null,
    status: raw?.status ?? null,
    dataPrevista: raw?.dataPrevista ?? raw?.data_prevista ?? null,
  };
}

function normalizeMedicao(raw: any): Medicao {
  return {
    id: String(raw?.id ?? ""),
    etapaId: String(raw?.etapaId ?? raw?.etapa_id ?? ""),
    data: String(raw?.data ?? ""),
    percentualAnterior: raw?.percentualAnterior ?? raw?.percentual_anterior ?? "0",
    percentualNovo: String(raw?.percentualNovo ?? raw?.percentual_novo ?? "0"),
    observacao: raw?.observacao ?? null,
  };
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export default function ArqdorConstructionWorkspace({ arqState, onNavigate }: Props) {
  const { user } = useAuth();
  const { projectCtx, setProjectCtx } = useWorkspaceProject();
  const meta = useMemo(() => projectMeta(arqState, projectCtx), [arqState, projectCtx]);
  const tenantKey = user?.tenantId || "tenant";

  const [view, setView] = useState<View>("overview");
  const [obra, setObra] = useState<Obra | null>(null);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [diario, setDiario] = useState<Diario[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [medicoes, setMedicoes] = useState<Record<string, Medicao[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newEtapa, setNewEtapa] = useState({ nome: "", dataInicioPrevista: "", dataFimPrevista: "" });
  const [newDiario, setNewDiario] = useState({ data: today(), conteudo: "", climaTempo: "", maoDeObra: "" });
  const [newCompra, setNewCompra] = useState({ descricao: "", fornecedor: "", quantidade: "1", valorUnitario: "0", dataPrevista: "" });
  const [measurementDraft, setMeasurementDraft] = useState<Record<string, string>>({});

  const rememberObra = useCallback((obraId: string) => {
    if (!meta.id) return;
    localStorage.setItem(`arqdor_obra:${tenantKey}:${meta.id}`, obraId);
    if ((projectCtx as any)?.obraId !== obraId) {
      setProjectCtx({ ...(projectCtx as any), id: meta.id, name: meta.name, obraId } as any);
    }
  }, [meta.id, meta.name, projectCtx, setProjectCtx, tenantKey]);

  const loadAll = useCallback(async () => {
    if (!meta.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const ensured = await api<{ obra: any }>("/api/arch/construction/ensure", {
        method: "POST",
        body: JSON.stringify({
          projectId: meta.id,
          name: meta.name,
          clientName: meta.clientName,
          budget: meta.budget,
          status: meta.status,
        }),
      });
      const obraId = String(ensured.obra?.id ?? "");
      if (!obraId) throw new Error("A obra vinculada não retornou um identificador.");
      rememberObra(obraId);

      const bundle = await api<{ obra: any; etapas: any[]; diario: any[]; compras: any[]; medicoes: any[] }>(`/api/arch/construction/${obraId}`);
      const normalizedObra = normalizeObra(bundle.obra);
      const normalizedEtapas = (bundle.etapas ?? []).map(normalizeEtapa);
      const normalizedMedicoes = (bundle.medicoes ?? []).map(normalizeMedicao);
      const byEtapa: Record<string, Medicao[]> = {};
      for (const medicao of normalizedMedicoes) {
        if (!byEtapa[medicao.etapaId]) byEtapa[medicao.etapaId] = [];
        byEtapa[medicao.etapaId]!.push(medicao);
      }

      setObra(normalizedObra);
      setEtapas(normalizedEtapas);
      setDiario((bundle.diario ?? []).map(normalizeDiario));
      setCompras((bundle.compras ?? []).map(normalizeCompra));
      setMedicoes(byEtapa);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar a obra vinculada ao projeto.");
    } finally {
      setLoading(false);
    }
  }, [meta.budget, meta.clientName, meta.id, meta.name, meta.status, rememberObra]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function createEtapa() {
    if (!obra || !newEtapa.nome.trim()) return;
    setSaving(true);
    try {
      await api(`/api/arch/construction/${obra.id}/etapas`, {
        method: "POST",
        body: JSON.stringify({ nome: newEtapa.nome.trim(), ordem: etapas.length, ...newEtapa }),
      });
      setNewEtapa({ nome: "", dataInicioPrevista: "", dataFimPrevista: "" });
      await loadAll();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao criar etapa."); }
    finally { setSaving(false); }
  }

  async function createDiario() {
    if (!obra || !newDiario.conteudo.trim()) return;
    setSaving(true);
    try {
      await api(`/api/arch/construction/${obra.id}/diario`, {
        method: "POST",
        body: JSON.stringify({ ...newDiario, maoDeObra: newDiario.maoDeObra ? Number(newDiario.maoDeObra) : undefined }),
      });
      setNewDiario({ data: today(), conteudo: "", climaTempo: "", maoDeObra: "" });
      await loadAll();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao salvar diário."); }
    finally { setSaving(false); }
  }

  async function createCompra() {
    if (!obra || !newCompra.descricao.trim()) return;
    const quantidade = Number(newCompra.quantidade || 0);
    const valorUnitario = Number(newCompra.valorUnitario || 0);
    setSaving(true);
    try {
      await api(`/api/arch/construction/${obra.id}/compras`, {
        method: "POST",
        body: JSON.stringify({ ...newCompra, quantidade, valorUnitario, valorTotal: quantidade * valorUnitario, status: "pendente" }),
      });
      setNewCompra({ descricao: "", fornecedor: "", quantidade: "1", valorUnitario: "0", dataPrevista: "" });
      await loadAll();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao registrar compra."); }
    finally { setSaving(false); }
  }

  async function createMeasurement(etapa: Etapa) {
    if (!obra) return;
    const value = measurementDraft[etapa.id];
    if (value === undefined || value === "") return;
    setSaving(true);
    try {
      await api(`/api/arch/construction/${obra.id}/etapas/${etapa.id}/medicoes`, {
        method: "POST",
        body: JSON.stringify({ data: today(), percentualNovo: Number(value), observacao: "Atualização pelo ARQDOR" }),
      });
      setMeasurementDraft((prev) => ({ ...prev, [etapa.id]: "" }));
      await loadAll();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao registrar medição."); }
    finally { setSaving(false); }
  }

  const totalCompras = compras.reduce((sum, item) => sum + Number(item.valorTotal ?? 0), 0);
  const comprasPendentes = compras.filter((item) => item.status === "pendente").reduce((sum, item) => sum + Number(item.valorTotal ?? 0), 0);
  const avgProgress = etapas.length
    ? etapas.reduce((sum, item) => sum + Number(item.percentualExecutado ?? 0), 0) / etapas.length
    : Number(obra?.percentualGeral ?? 0);

  if (!meta.id) return <Empty>Selecione ou crie um projeto antes de abrir a obra.</Empty>;
  if (loading) return <div className="p-8 text-sm text-slate-500">Conectando projeto à obra real…</div>;
  if (error && !obra) return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
      <p className="font-semibold text-amber-900">Não foi possível abrir a obra</p>
      <p className="mt-2 text-sm text-amber-800">{error}</p>
      <button type="button" onClick={() => void loadAll()} className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Tentar novamente</button>
    </div>
  );
  if (!obra) return <Empty>Não foi possível vincular uma obra a este projeto.</Empty>;

  const nav: Array<{ id: View; label: string }> = [
    { id: "overview", label: "Visão Geral" },
    { id: "schedule", label: "Cronograma" },
    { id: "diary", label: "Diário" },
    { id: "measurements", label: "Medições" },
    { id: "purchases", label: "Compras" },
    { id: "financial", label: "Financeiro" },
  ];

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-5 py-6 lg:px-8">
        <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">ARQDOR • Obra vinculada</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">{obra.nome}</h1>
              <p className="mt-1 text-sm text-slate-500">Projeto, cronograma, diário, medições, compras e financeiro usam o mesmo registro real.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {nav.map((item) => (
                <button key={item.id} type="button" onClick={() => setView(item.id)} className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${view === item.id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700"}`}>{item.label}</button>
              ))}
              <button type="button" onClick={() => void loadAll()} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Atualizar</button>
            </div>
          </div>
        </header>

        {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}

        {view === "overview" ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Progresso" value={pct(avgProgress)} hint={`${etapas.length} etapas`} />
              <Metric label="Orçamento" value={currency(obra.orcamentoTotal)} />
              <Metric label="Custo realizado" value={currency(obra.custoRealizado)} />
              <Metric label="Compras" value={currency(totalCompras)} hint={`${compras.length} pedidos`} />
              <Metric label="Diários" value={String(diario.length)} hint="registros de obra" />
            </section>
            <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Etapas da obra</h2>
                <div className="mt-4 space-y-3">
                  {etapas.length ? etapas.map((etapa) => (
                    <div key={etapa.id} className="rounded-2xl bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3"><span className="font-semibold">{etapa.nome}</span><span className="text-sm font-semibold text-violet-700">{pct(etapa.percentualExecutado)}</span></div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-violet-600" style={{ width: pct(etapa.percentualExecutado) }} /></div>
                    </div>
                  )) : <Empty>Adicione a primeira etapa no Cronograma.</Empty>}
                </div>
              </div>
              <div className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Atenção</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="rounded-2xl bg-amber-50 p-4"><b>{currency(comprasPendentes)}</b><p className="mt-1 text-amber-800">em compras pendentes</p></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><b>{diario.filter((item) => item.status !== "aprovado").length}</b><p className="mt-1 text-slate-500">diários aguardando aprovação</p></div>
                  <button type="button" onClick={() => onNavigate?.("execution")} className="w-full rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-left font-semibold text-violet-700">Abrir Produção & Execução →</button>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {view === "schedule" ? (
          <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-4">
              <input value={newEtapa.nome} onChange={(e) => setNewEtapa((v) => ({ ...v, nome: e.target.value }))} placeholder="Nova etapa" className="rounded-2xl border px-4 py-2 text-sm" />
              <input type="date" value={newEtapa.dataInicioPrevista} onChange={(e) => setNewEtapa((v) => ({ ...v, dataInicioPrevista: e.target.value }))} className="rounded-2xl border px-4 py-2 text-sm" />
              <input type="date" value={newEtapa.dataFimPrevista} onChange={(e) => setNewEtapa((v) => ({ ...v, dataFimPrevista: e.target.value }))} className="rounded-2xl border px-4 py-2 text-sm" />
              <button disabled={saving} onClick={() => void createEtapa()} className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Adicionar etapa</button>
            </div>
            <div className="mt-5 space-y-3">{etapas.map((etapa) => <div key={etapa.id} className="grid gap-3 rounded-2xl border border-slate-100 p-4 md:grid-cols-[1fr_auto_auto] md:items-center"><div><p className="font-semibold">{etapa.nome}</p><p className="mt-1 text-xs text-slate-500">{etapa.dataInicioPrevista || "Sem início"} → {etapa.dataFimPrevista || "Sem término"}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{etapa.status || "pendente"}</span><span className="text-sm font-semibold text-violet-700">{pct(etapa.percentualExecutado)}</span></div>)}</div>
          </section>
        ) : null}

        {view === "diary" ? (
          <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <div className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="font-semibold">Novo diário</h2>
              <div className="mt-4 space-y-3"><input type="date" value={newDiario.data} onChange={(e) => setNewDiario((v) => ({ ...v, data: e.target.value }))} className="w-full rounded-2xl border px-4 py-2 text-sm" /><textarea value={newDiario.conteudo} onChange={(e) => setNewDiario((v) => ({ ...v, conteudo: e.target.value }))} placeholder="Serviços executados, ocorrências e observações do dia" rows={6} className="w-full rounded-2xl border px-4 py-3 text-sm" /><input value={newDiario.climaTempo} onChange={(e) => setNewDiario((v) => ({ ...v, climaTempo: e.target.value }))} placeholder="Clima" className="w-full rounded-2xl border px-4 py-2 text-sm" /><input type="number" value={newDiario.maoDeObra} onChange={(e) => setNewDiario((v) => ({ ...v, maoDeObra: e.target.value }))} placeholder="Pessoas na obra" className="w-full rounded-2xl border px-4 py-2 text-sm" /><button disabled={saving} onClick={() => void createDiario()} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Salvar diário</button></div>
            </div>
            <div className="space-y-3">{diario.length ? diario.map((entry) => <article key={entry.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{entry.data}</p><p className="text-xs text-slate-400">{entry.responsavelNome || "Equipe"}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{entry.status}</span></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{entry.conteudo}</p><div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">{entry.climaTempo ? <span>Clima: {entry.climaTempo}</span> : null}{entry.maoDeObra != null ? <span>Equipe: {entry.maoDeObra}</span> : null}{entry.fotos?.length ? <span>Fotos: {entry.fotos.length}</span> : null}</div></article>) : <Empty>Nenhum diário registrado.</Empty>}</div>
          </section>
        ) : null}

        {view === "measurements" ? (
          <section className="space-y-4">{etapas.length ? etapas.map((etapa) => <div key={etapa.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><h3 className="font-semibold">{etapa.nome}</h3><p className="mt-1 text-sm text-slate-500">Executado: {pct(etapa.percentualExecutado)}</p></div><div className="flex gap-2"><input type="number" min="0" max="100" value={measurementDraft[etapa.id] ?? ""} onChange={(e) => setMeasurementDraft((prev) => ({ ...prev, [etapa.id]: e.target.value }))} placeholder="Novo %" className="w-28 rounded-xl border px-3 py-2 text-sm" /><button disabled={saving} onClick={() => void createMeasurement(etapa)} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Registrar</button></div></div><div className="mt-4 space-y-2">{(medicoes[etapa.id] ?? []).slice(0, 5).map((m) => <div key={m.id} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"><span>{m.data}</span><span>{pct(m.percentualAnterior)} → {pct(m.percentualNovo)}</span></div>)}</div></div>) : <Empty>Crie etapas antes de registrar medições.</Empty>}</section>
        ) : null}

        {view === "purchases" ? (
          <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <div className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm"><h2 className="font-semibold">Nova compra</h2><div className="mt-4 space-y-3"><input value={newCompra.descricao} onChange={(e) => setNewCompra((v) => ({ ...v, descricao: e.target.value }))} placeholder="Material / serviço" className="w-full rounded-2xl border px-4 py-2 text-sm" /><input value={newCompra.fornecedor} onChange={(e) => setNewCompra((v) => ({ ...v, fornecedor: e.target.value }))} placeholder="Fornecedor" className="w-full rounded-2xl border px-4 py-2 text-sm" /><div className="grid grid-cols-2 gap-2"><input type="number" value={newCompra.quantidade} onChange={(e) => setNewCompra((v) => ({ ...v, quantidade: e.target.value }))} placeholder="Qtd." className="rounded-2xl border px-4 py-2 text-sm" /><input type="number" value={newCompra.valorUnitario} onChange={(e) => setNewCompra((v) => ({ ...v, valorUnitario: e.target.value }))} placeholder="Valor unit." className="rounded-2xl border px-4 py-2 text-sm" /></div><input type="date" value={newCompra.dataPrevista} onChange={(e) => setNewCompra((v) => ({ ...v, dataPrevista: e.target.value }))} className="w-full rounded-2xl border px-4 py-2 text-sm" /><button disabled={saving} onClick={() => void createCompra()} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white">Adicionar compra</button></div></div>
            <div className="space-y-3">{compras.length ? compras.map((compra) => <div key={compra.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{compra.descricao}</p><p className="mt-1 text-xs text-slate-500">{compra.fornecedor || "Fornecedor não definido"}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{compra.status}</span></div><div className="mt-4 flex justify-between text-sm"><span className="text-slate-500">{Number(compra.quantidade || 0)} × {currency(compra.valorUnitario)}</span><b>{currency(compra.valorTotal)}</b></div></div>) : <Empty>Nenhuma compra registrada.</Empty>}</div>
          </section>
        ) : null}

        {view === "financial" ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Metric label="Orçamento da obra" value={currency(obra.orcamentoTotal)} /><Metric label="Custo realizado" value={currency(obra.custoRealizado)} /><Metric label="Compras registradas" value={currency(totalCompras)} /><Metric label="Compras pendentes" value={currency(comprasPendentes)} /><div className="md:col-span-2 xl:col-span-4 rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm"><h2 className="font-semibold">Controle previsto × realizado</h2><p className="mt-2 text-sm text-slate-500">O projeto ARQDOR, a obra, as etapas, as medições, o diário e as compras estão agora ligados ao mesmo registro operacional.</p><button type="button" onClick={() => onNavigate?.("real-budget")} className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">Abrir orçamento detalhado →</button></div></section>
        ) : null}
      </div>
    </div>
  );
}
