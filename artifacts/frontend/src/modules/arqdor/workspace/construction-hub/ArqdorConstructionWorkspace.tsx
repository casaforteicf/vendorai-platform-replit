import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./arqdor-construction-studio.css";
import { StudioField, StudioToolButton } from "../../theme/ArqdorStudioComponents";
import "../../theme/arqdor-studio-primitives.css";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceProject } from "../WorkspaceContext";

type View = "overview" | "measurements";

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
  status?: string | null;
};

type Compra = {
  id: string;
  valorTotal?: string | null;
  status?: string | null;
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
  const [measurementDraft, setMeasurementDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const normalizedMedicoes = (bundle.medicoes ?? []).map(normalizeMedicao);
      const byEtapa: Record<string, Medicao[]> = {};
      for (const medicao of normalizedMedicoes) {
        if (!byEtapa[medicao.etapaId]) byEtapa[medicao.etapaId] = [];
        byEtapa[medicao.etapaId]!.push(medicao);
      }

      setObra(normalizeObra(bundle.obra));
      setEtapas((bundle.etapas ?? []).map(normalizeEtapa));
      setDiario((bundle.diario ?? []).map((item: any) => ({ id: String(item?.id ?? ""), status: item?.status ?? null })));
      setCompras((bundle.compras ?? []).map((item: any) => ({ id: String(item?.id ?? ""), valorTotal: item?.valorTotal ?? item?.valor_total ?? null, status: item?.status ?? null })));
      setMedicoes(byEtapa);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar a obra vinculada ao projeto.");
    } finally {
      setLoading(false);
    }
  }, [meta.budget, meta.clientName, meta.id, meta.name, meta.status, rememberObra]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function createMeasurement(etapa: Etapa) {
    if (!obra) return;
    const value = measurementDraft[etapa.id];
    if (value === undefined || value === "") return;
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue) || nextValue < 0 || nextValue > 100) {
      setError("A medição deve estar entre 0% e 100%.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api(`/api/arch/construction/${obra.id}/etapas/${etapa.id}/medicoes`, {
        method: "POST",
        body: JSON.stringify({ data: today(), percentualNovo: nextValue, observacao: "Atualização pelo ARQDOR" }),
      });
      setMeasurementDraft((prev) => ({ ...prev, [etapa.id]: "" }));
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar medição.");
    } finally {
      setSaving(false);
    }
  }

  const totalCompras = compras.reduce((sum, item) => sum + Number(item.valorTotal ?? 0), 0);
  const comprasPendentes = compras.filter((item) => item.status === "pendente").reduce((sum, item) => sum + Number(item.valorTotal ?? 0), 0);
  const avgProgress = etapas.length
    ? etapas.reduce((sum, item) => sum + Number(item.percentualExecutado ?? 0), 0) / etapas.length
    : Number(obra?.percentualGeral ?? 0);
  const etapasConcluidas = etapas.filter((item) => Number(item.percentualExecutado ?? 0) >= 100).length;
  const diariosPendentes = diario.filter((item) => item.status !== "aprovado").length;

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

  return (
    <div className="arqdor-studio-ui arqdor-construction-studio min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-5 py-6 lg:px-8">
        <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">ARQDOR • Operação da obra</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">{obra.nome}</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Aqui ficam somente o acompanhamento operacional e as medições. Planejamento, Diário, Financeiro, Qualidade e Decisões usam as telas oficiais no topo do Hub.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StudioToolButton active={view === "overview"} onClick={() => setView("overview")}>Visão Geral</StudioToolButton>
              <StudioToolButton active={view === "measurements"} onClick={() => setView("measurements")}>Medições</StudioToolButton>
              <button type="button" onClick={() => onNavigate?.("procurement")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Compras</button>
              <button type="button" onClick={() => onNavigate?.("real-budget")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Orçamento</button>
              <button type="button" onClick={() => onNavigate?.("execution")} className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">Produção & Execução</button>
              <button type="button" onClick={() => void loadAll()} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">Atualizar</button>
            </div>
          </div>
        </header>

        {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}

        {view === "overview" ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Progresso" value={pct(avgProgress)} hint={`${etapasConcluidas}/${etapas.length} etapas concluídas`} />
              <Metric label="Orçamento" value={currency(obra.orcamentoTotal)} />
              <Metric label="Custo realizado" value={currency(obra.custoRealizado)} />
              <Metric label="Compras vinculadas" value={currency(totalCompras)} hint={`${compras.length} registros`} />
              <Metric label="Diários" value={String(diario.length)} hint={`${diariosPendentes} aguardando aprovação`} />
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Evolução da obra</h2>
                    <p className="mt-1 text-xs text-slate-500">A medição é o único lançamento operacional mantido nesta tela.</p>
                  </div>
                  <button type="button" onClick={() => setView("measurements")} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white">Registrar medição</button>
                </div>
                <div className="mt-4 space-y-3">
                  {etapas.length ? etapas.map((etapa) => (
                    <div key={etapa.id} className="rounded-2xl bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="font-semibold">{etapa.nome}</span>
                          <p className="mt-1 text-[11px] text-slate-400">{etapa.dataInicioPrevista || "Sem início"} → {etapa.dataFimPrevista || "Sem término"}</p>
                        </div>
                        <span className="text-sm font-semibold text-violet-700">{pct(etapa.percentualExecutado)}</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-violet-600" style={{ width: pct(etapa.percentualExecutado) }} /></div>
                    </div>
                  )) : <Empty>Crie as etapas em Planejamento físico-financeiro.</Empty>}
                </div>
              </div>

              <div className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Atenção operacional</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="rounded-2xl bg-amber-50 p-4"><b>{currency(comprasPendentes)}</b><p className="mt-1 text-amber-800">em compras ainda pendentes</p></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><b>{diariosPendentes}</b><p className="mt-1 text-slate-500">diários aguardando aprovação</p></div>
                  <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-xs leading-5 text-slate-500">
                    Para evitar duplicidade, novos cronogramas são feitos em <b>Planejamento</b>, registros de campo em <b>Diário</b>, compras em <b>Compras</b> e custos em <b>Financeiro da Obra</b>.
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {view === "measurements" ? (
          <section className="space-y-4">
            <div className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Medições reais</p>
              <h2 className="mt-1 text-xl font-semibold">Avanço físico por etapa</h2>
              <p className="mt-1 text-sm text-slate-500">Cada lançamento atualiza o percentual executado da etapa e mantém o histórico anterior → novo.</p>
            </div>
            {etapas.length ? etapas.map((etapa) => (
              <div key={etapa.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-semibold">{etapa.nome}</h3>
                    <p className="mt-1 text-sm text-slate-500">Executado: {pct(etapa.percentualExecutado)}</p>
                  </div>
                  <div className="flex gap-2">
                    <StudioField label={`Novo percentual de ${etapa.nome}`} type="number" min={0} max={100} step="0.01" value={measurementDraft[etapa.id] ?? ""} onChange={(e) => setMeasurementDraft((prev) => ({ ...prev, [etapa.id]: e.target.value }))} placeholder="0–100%" className="w-28" />
                    <button disabled={saving} onClick={() => void createMeasurement(etapa)} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Registrar</button>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {(medicoes[etapa.id] ?? []).slice(0, 8).map((m) => (
                    <div key={m.id} className="flex flex-col gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                      <span>{m.data}</span>
                      <span className="font-semibold">{pct(m.percentualAnterior)} → {pct(m.percentualNovo)}</span>
                      {m.observacao ? <span className="text-slate-500">{m.observacao}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            )) : <Empty>Crie as etapas em Planejamento antes de registrar medições.</Empty>}
          </section>
        ) : null}
      </div>
    </div>
  );
}
