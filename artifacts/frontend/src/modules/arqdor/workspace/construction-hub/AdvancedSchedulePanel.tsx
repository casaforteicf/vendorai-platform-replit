import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceProject } from "../WorkspaceContext";

type Etapa = {
  id: string;
  nome: string;
  descricao?: string | null;
  ordem: number;
  dataInicioPrevista?: string | null;
  dataFimPrevista?: string | null;
  dataInicioReal?: string | null;
  dataFimReal?: string | null;
  status: string;
  percentualExecutado: number;
  responsavel?: string | null;
  custoPrevisto: number;
  pesoFisico: number;
  marco: boolean;
};

type Dependencia = {
  id: string;
  etapaId: string;
  dependeDeEtapaId: string;
  tipo: "FS" | "SS" | "FF" | "SF";
  defasagemDias: number;
};

type Compra = { valorTotal: number; status?: string | null };

type Bundle = {
  obra: { id: string; nome: string; orcamentoTotal: number; custoRealizado: number };
  etapas: Etapa[];
  dependencias: Dependencia[];
  compras: Compra[];
};

type Props = { arqState?: any };

type EtapaDraft = {
  nome: string;
  dataInicioPrevista: string;
  dataFimPrevista: string;
  responsavel: string;
  custoPrevisto: string;
  pesoFisico: string;
  marco: boolean;
};

type NewEtapaDraft = EtapaDraft & { predecessorId: string; tipo: "FS" | "SS" | "FF" | "SF"; defasagemDias: string };

const EMPTY_NEW: NewEtapaDraft = {
  nome: "",
  dataInicioPrevista: "",
  dataFimPrevista: "",
  responsavel: "",
  custoPrevisto: "0",
  pesoFisico: "0",
  marco: false,
  predecessorId: "",
  tipo: "FS",
  defasagemDias: "0",
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
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any)?.error ?? `Erro ${response.status}`);
  return data as T;
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

function normalizeEtapa(raw: any): Etapa {
  return {
    id: String(raw?.id ?? ""),
    nome: String(raw?.nome ?? "Etapa"),
    descricao: raw?.descricao ?? null,
    ordem: Number(raw?.ordem ?? 0),
    dataInicioPrevista: raw?.dataInicioPrevista ?? raw?.data_inicio_prevista ?? null,
    dataFimPrevista: raw?.dataFimPrevista ?? raw?.data_fim_prevista ?? null,
    dataInicioReal: raw?.dataInicioReal ?? raw?.data_inicio_real ?? null,
    dataFimReal: raw?.dataFimReal ?? raw?.data_fim_real ?? null,
    status: String(raw?.status ?? "pendente"),
    percentualExecutado: Number(raw?.percentualExecutado ?? raw?.percentual_executado ?? 0),
    responsavel: raw?.responsavel ?? null,
    custoPrevisto: Number(raw?.custoPrevisto ?? raw?.custo_previsto ?? 0),
    pesoFisico: Number(raw?.pesoFisico ?? raw?.peso_fisico ?? 0),
    marco: Boolean(raw?.marco),
  };
}

function normalizeDependencia(raw: any): Dependencia {
  const tipo = String(raw?.tipo ?? "FS") as Dependencia["tipo"];
  return {
    id: String(raw?.id ?? ""),
    etapaId: String(raw?.etapaId ?? raw?.etapa_id ?? ""),
    dependeDeEtapaId: String(raw?.dependeDeEtapaId ?? raw?.depende_de_etapa_id ?? ""),
    tipo: ["FS", "SS", "FF", "SF"].includes(tipo) ? tipo : "FS",
    defasagemDias: Number(raw?.defasagemDias ?? raw?.defasagem_dias ?? 0),
  };
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function dateValue(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffDays(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function durationDays(etapa: Etapa) {
  const start = dateValue(etapa.dataInicioPrevista);
  const end = dateValue(etapa.dataFimPrevista);
  if (!start || !end) return etapa.marco ? 0 : 1;
  return Math.max(0, diffDays(end, start)) + (etapa.marco ? 0 : 1);
}

function plannedPercent(etapa: Etapa, now = new Date()) {
  const start = dateValue(etapa.dataInicioPrevista);
  const end = dateValue(etapa.dataFimPrevista);
  if (!start || !end) return 0;
  if (etapa.marco) return now >= end ? 100 : 0;
  if (now <= start) return 0;
  if (now >= end) return 100;
  const total = Math.max(1, end.getTime() - start.getTime());
  return Math.max(0, Math.min(100, ((now.getTime() - start.getTime()) / total) * 100));
}

function statusLabel(status: string) {
  if (status === "concluida") return "Concluída";
  if (status === "em_andamento") return "Em andamento";
  return "Pendente";
}

function dependencyLabel(tipo: Dependencia["tipo"]) {
  return ({ FS: "Término → Início", SS: "Início → Início", FF: "Término → Término", SF: "Início → Término" } as const)[tipo];
}

function draftFrom(etapa: Etapa): EtapaDraft {
  return {
    nome: etapa.nome,
    dataInicioPrevista: etapa.dataInicioPrevista ?? "",
    dataFimPrevista: etapa.dataFimPrevista ?? "",
    responsavel: etapa.responsavel ?? "",
    custoPrevisto: String(etapa.custoPrevisto || 0),
    pesoFisico: String(etapa.pesoFisico || 0),
    marco: etapa.marco,
  };
}

function Metric({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${danger ? "text-rose-600" : "text-slate-950"}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function DraggableScheduleGantt({
  etapas,
  timeline,
  criticalIds,
  onUpdateDates,
}: {
  etapas: Etapa[];
  timeline: { start: Date; end: Date; span: number };
  criticalIds: Set<string>;
  onUpdateDates: (etapaId: string, start: string, end: string) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const dragRef = useRef<{
    etapaId: string;
    mode: "move" | "left" | "right";
    startX: number;
    origOffset: number;
    origDuration: number;
    prevOffset: number;
    prevDuration: number;
  } | null>(null);

  const LABEL_W = 176;
  const ROW_H = 46;
  const totalDays = Math.max(1, diffDays(timeline.end, timeline.start) + 1);
  const scheduled = etapas.filter((item) => dateValue(item.dataInicioPrevista) && dateValue(item.dataFimPrevista));
  const todayOffset = diffDays(new Date(), timeline.start);
  const tickStep = Math.max(1, Math.ceil(totalDays / 8));
  const ticks: number[] = [];
  for (let day = 0; day < totalDays; day += tickStep) ticks.push(day);
  if (ticks[ticks.length - 1] !== totalDays - 1) ticks.push(totalDays - 1);

  function startDrag(e: React.MouseEvent, etapa: Etapa, mode: "move" | "left" | "right") {
    const start = dateValue(etapa.dataInicioPrevista);
    const end = dateValue(etapa.dataFimPrevista);
    if (!start || !end || etapa.marco) return;
    e.preventDefault();
    e.stopPropagation();

    const offset = Math.max(0, diffDays(start, timeline.start));
    const duration = Math.max(1, diffDays(end, start) + 1);
    dragRef.current = {
      etapaId: etapa.id,
      mode,
      startX: e.clientX,
      origOffset: offset,
      origDuration: duration,
      prevOffset: offset,
      prevDuration: duration,
    };
    forceUpdate((n) => n + 1);

    function onMove(me: MouseEvent) {
      if (!dragRef.current || !containerRef.current) return;
      const timelineWidth = containerRef.current.getBoundingClientRect().width - LABEL_W;
      if (timelineWidth <= 0) return;
      const pxPerDay = timelineWidth / totalDays;
      const deltaDays = Math.round((me.clientX - dragRef.current.startX) / pxPerDay);
      const current = dragRef.current;

      if (current.mode === "move") {
        current.prevOffset = Math.max(0, current.origOffset + deltaDays);
        current.prevDuration = current.origDuration;
      } else if (current.mode === "left") {
        const maxStart = current.origOffset + current.origDuration - 1;
        const nextOffset = Math.max(0, Math.min(maxStart, current.origOffset + deltaDays));
        current.prevOffset = nextOffset;
        current.prevDuration = Math.max(1, current.origDuration - (nextOffset - current.origOffset));
      } else {
        current.prevOffset = current.origOffset;
        current.prevDuration = Math.max(1, current.origDuration + deltaDays);
      }
      forceUpdate((n) => n + 1);
    }

    async function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const current = dragRef.current;
      dragRef.current = null;
      forceUpdate((n) => n + 1);
      if (!current) return;

      const nextStart = addCalendarDays(timeline.start, current.prevOffset);
      const nextEnd = addCalendarDays(nextStart, current.prevDuration - 1);
      setSavingId(current.etapaId);
      try {
        await onUpdateDates(current.etapaId, isoDate(nextStart), isoDate(nextEnd));
      } finally {
        setSavingId(null);
      }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  if (!scheduled.length) {
    return <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">Defina início e término das etapas para montar o Gantt.</div>;
  }

  return (
    <div className="select-none">
      <div className="mb-1 flex text-[10px] text-slate-400" style={{ paddingLeft: LABEL_W }}>
        <div className="relative h-5 flex-1 overflow-hidden">
          {ticks.map((day) => (
            <span key={day} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(day / totalDays) * 100}%` }}>
              {addCalendarDays(timeline.start, day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            </span>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        {scheduled.map((item, index) => {
          const start = dateValue(item.dataInicioPrevista)!;
          const end = dateValue(item.dataFimPrevista)!;
          const drag = dragRef.current?.etapaId === item.id ? dragRef.current : null;
          const baseOffset = Math.max(0, diffDays(start, timeline.start));
          const baseDuration = Math.max(1, diffDays(end, start) + 1);
          const offset = drag ? drag.prevOffset : baseOffset;
          const duration = drag ? drag.prevDuration : baseDuration;
          const left = (offset / totalDays) * 100;
          const width = Math.max(item.marco ? 1.2 : 0.8, (duration / totalDays) * 100);
          const critical = criticalIds.has(item.id);
          const isDragging = Boolean(drag);
          const isSaving = savingId === item.id;

          return (
            <div key={item.id} className={index < scheduled.length - 1 ? "flex items-center border-b border-slate-100" : "flex items-center"} style={{ height: ROW_H }}>
              <div className="flex h-full shrink-0 items-center gap-2 border-r border-slate-100 bg-slate-50/70 px-3" style={{ width: LABEL_W }}>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-700">{item.nome}</p>
                  <p className="truncate text-[10px] text-slate-400">{item.marco ? "Marco" : item.responsavel || "Sem responsável"}</p>
                </div>
              </div>

              <div className="relative h-full flex-1">
                {ticks.map((day) => <div key={day} className="absolute inset-y-0 border-l border-slate-100" style={{ left: `${(day / totalDays) * 100}%` }} />)}
                {todayOffset >= 0 && todayOffset < totalDays ? <div className="absolute inset-y-0 z-10 w-px bg-rose-400" style={{ left: `${(todayOffset / totalDays) * 100}%` }} /> : null}

                <div
                  title={item.marco ? "Marco do projeto" : "Arraste para mover · use as bordas para alterar início/fim"}
                  className={`absolute top-1/2 flex h-7 -translate-y-1/2 items-center rounded-full shadow-sm ${item.marco ? "cursor-default" : "cursor-grab active:cursor-grabbing"} ${isDragging ? "z-20 ring-2 ring-white ring-offset-1" : ""} ${isSaving ? "animate-pulse" : ""} ${critical ? "bg-rose-500" : "bg-violet-600"}`}
                  style={{ left: `${left}%`, width: `${Math.min(100 - left, width)}%`, minWidth: item.marco ? 10 : 18 }}
                  onMouseDown={(e) => startDrag(e, item, "move")}
                >
                  {!item.marco ? <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-full hover:bg-black/15" onMouseDown={(e) => startDrag(e, item, "left")} /> : null}
                  <div className="absolute inset-y-0 left-0 rounded-full bg-black/15 pointer-events-none" style={{ width: `${Math.min(100, item.percentualExecutado)}%` }} />
                  <span className="relative z-10 mx-auto px-2 text-[10px] font-bold text-white">{item.marco ? "◆" : `${item.percentualExecutado.toFixed(0)}%`}</span>
                  {!item.marco ? <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-full hover:bg-black/15" onMouseDown={(e) => startDrag(e, item, "right")} /> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
        <span>Arraste a barra para mover a etapa · arraste as bordas para ajustar início/fim · linha vermelha = hoje.</span>
        <span className="font-medium text-rose-500">Vermelho = caminho crítico</span>
      </div>
    </div>
  );
}

export default function AdvancedSchedulePanel({ arqState }: Props) {
  const { projectCtx, setProjectCtx } = useWorkspaceProject();
  const meta = useMemo(() => projectMeta(arqState, projectCtx), [arqState, projectCtx]);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EtapaDraft>>({});
  const [dependencyDrafts, setDependencyDrafts] = useState<Record<string, { predecessorId: string; tipo: Dependencia["tipo"]; defasagemDias: string }>>({});
  const [newEtapa, setNewEtapa] = useState<NewEtapaDraft>(EMPTY_NEW);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  const load = useCallback(async () => {
    if (!meta.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const ensured = await api<{ obra: any }>("/api/arch/construction/ensure", {
        method: "POST",
        body: JSON.stringify({ projectId: meta.id, name: meta.name, clientName: meta.clientName, budget: meta.budget, status: meta.status }),
      });
      const obraId = String(ensured.obra?.id ?? "");
      if (!obraId) throw new Error("Não foi possível vincular o projeto à obra.");
      if ((projectCtx as any)?.obraId !== obraId) setProjectCtx({ ...(projectCtx as any), id: meta.id, name: meta.name, obraId } as any);
      const raw = await api<any>(`/api/arch/construction/${obraId}`);
      const etapas = (raw.etapas ?? []).map(normalizeEtapa);
      const dependencias = (raw.dependencias ?? []).map(normalizeDependencia);
      const compras = (raw.compras ?? []).map((item: any) => ({
        valorTotal: Number(item?.valorTotal ?? item?.valor_total ?? 0),
        status: item?.status ?? null,
      }));
      setBundle({
        obra: {
          id: obraId,
          nome: String(raw.obra?.nome ?? meta.name),
          orcamentoTotal: Number(raw.obra?.orcamentoTotal ?? raw.obra?.orcamento_total ?? 0),
          custoRealizado: Number(raw.obra?.custoRealizado ?? raw.obra?.custo_realizado ?? 0),
        },
        etapas,
        dependencias,
        compras,
      });
      setDrafts(Object.fromEntries(etapas.map((etapa: Etapa) => [etapa.id, draftFrom(etapa)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar o planejamento.");
    } finally {
      setLoading(false);
    }
  }, [meta.budget, meta.clientName, meta.id, meta.name, meta.status, projectCtx, setProjectCtx]);

  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => {
    const etapas = bundle?.etapas ?? [];
    const now = new Date();
    const totalExplicitWeight = etapas.reduce((sum, item) => sum + item.pesoFisico, 0);
    const totalCost = etapas.reduce((sum, item) => sum + item.custoPrevisto, 0);
    const weights = etapas.map((item) => {
      if (totalExplicitWeight > 0) return item.pesoFisico;
      if (totalCost > 0) return item.custoPrevisto;
      return etapas.length ? 1 : 0;
    });
    const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
    const planned = etapas.reduce((sum, item, index) => sum + plannedPercent(item, now) * weights[index]!, 0) / totalWeight;
    const actual = etapas.reduce((sum, item, index) => sum + item.percentualExecutado * weights[index]!, 0) / totalWeight;
    const earned = etapas.reduce((sum, item) => sum + item.custoPrevisto * item.percentualExecutado / 100, 0);
    const plannedCostEarned = etapas.reduce((sum, item) => sum + item.custoPrevisto * plannedPercent(item, now) / 100, 0);
    const overdue = etapas
      .filter((item) => item.percentualExecutado < 100 && dateValue(item.dataFimPrevista) && dateValue(item.dataFimPrevista)! < now)
      .map((item) => diffDays(now, dateValue(item.dataFimPrevista)!));
    const delayDays = overdue.length ? Math.max(...overdue) : 0;
    const ends = etapas.map((item) => dateValue(item.dataFimPrevista)).filter(Boolean) as Date[];
    const scheduledFinish = ends.length ? new Date(Math.max(...ends.map((date) => date.getTime()))) : null;
    const purchases = (bundle?.compras ?? []).reduce((sum, item) => sum + item.valorTotal, 0);
    return { planned, actual, totalCost, earned, plannedCostEarned, delayDays, scheduledFinish, purchases };
  }, [bundle]);

  const criticalIds = useMemo(() => {
    if (!bundle) return new Set<string>();
    const byId = new Map(bundle.etapas.map((item) => [item.id, item]));
    const predecessors = new Map<string, Dependencia[]>();
    for (const dep of bundle.dependencias) {
      const list = predecessors.get(dep.etapaId) ?? [];
      list.push(dep);
      predecessors.set(dep.etapaId, list);
    }
    const memo = new Map<string, { score: number; parent?: string }>();
    const visiting = new Set<string>();
    const score = (id: string): { score: number; parent?: string } => {
      const cached = memo.get(id);
      if (cached) return cached;
      if (visiting.has(id)) return { score: 0 };
      visiting.add(id);
      let bestScore = 0;
      let bestParent: string | undefined;
      for (const dep of predecessors.get(id) ?? []) {
        const candidate = score(dep.dependeDeEtapaId).score + Math.max(0, dep.defasagemDias);
        if (candidate >= bestScore) { bestScore = candidate; bestParent = dep.dependeDeEtapaId; }
      }
      visiting.delete(id);
      const result = { score: bestScore + durationDays(byId.get(id) ?? ({ marco: false } as Etapa)), parent: bestParent };
      memo.set(id, result);
      return result;
    };
    let endpoint: string | null = null;
    let max = -1;
    for (const item of bundle.etapas) {
      const value = score(item.id).score;
      if (value > max) { max = value; endpoint = item.id; }
    }
    const ids = new Set<string>();
    while (endpoint) {
      ids.add(endpoint);
      endpoint = memo.get(endpoint)?.parent ?? null;
    }
    return ids;
  }, [bundle]);

  const timeline = useMemo(() => {
    const dates = (bundle?.etapas ?? []).flatMap((item) => [dateValue(item.dataInicioPrevista), dateValue(item.dataFimPrevista)]).filter(Boolean) as Date[];
    if (!dates.length) return null;
    const start = new Date(Math.min(...dates.map((date) => date.getTime())));
    const end = new Date(Math.max(...dates.map((date) => date.getTime())));
    const span = Math.max(1, end.getTime() - start.getTime());
    return { start, end, span };
  }, [bundle]);

  async function generatePlanFromBudget() {
    if (!bundle || !meta.id) return;
    setGeneratingPlan(true);
    setError(null);
    setScheduleNotice(null);
    try {
      const result = await api<{
        createdCount?: number;
        updatedCount?: number;
        generated?: Array<{ name: string; itemCount: number; cost: number }>;
        startDate?: string | null;
        endDate?: string | null;
      }>(`/api/arch/construction/${bundle.obra.id}/plan-from-budget`, {
        method: "POST",
        body: JSON.stringify({
          projectId: meta.id,
          startDate: new Date().toISOString().slice(0, 10),
        }),
      });
      const total = Number(result?.createdCount ?? 0) + Number(result?.updatedCount ?? 0);
      setScheduleNotice(
        total > 0
          ? `Planejamento gerado a partir do orçamento: ${result?.createdCount ?? 0} etapa(s) criada(s) e ${result?.updatedCount ?? 0} atualizada(s).`
          : "O orçamento foi analisado, mas nenhuma etapa precisou ser criada ou atualizada.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar planejamento a partir do orçamento.");
    } finally {
      setGeneratingPlan(false);
    }
  }

  async function createEtapa() {
    if (!bundle || !newEtapa.nome.trim()) return;
    setSaving("new"); setError(null);
    try {
      const created = await api<{ etapa: any }>(`/api/arch/construction/${bundle.obra.id}/etapas`, {
        method: "POST",
        body: JSON.stringify({
          nome: newEtapa.nome.trim(),
          ordem: bundle.etapas.length,
          dataInicioPrevista: newEtapa.dataInicioPrevista || null,
          dataFimPrevista: newEtapa.dataFimPrevista || null,
          responsavel: newEtapa.responsavel || null,
          custoPrevisto: Number(newEtapa.custoPrevisto || 0),
          pesoFisico: Number(newEtapa.pesoFisico || 0),
          marco: newEtapa.marco,
        }),
      });
      if (newEtapa.predecessorId && created.etapa?.id) {
        await api(`/api/arch/construction/${bundle.obra.id}/etapas/${created.etapa.id}/dependencias`, {
          method: "POST",
          body: JSON.stringify({ dependeDeEtapaId: newEtapa.predecessorId, tipo: newEtapa.tipo, defasagemDias: Number(newEtapa.defasagemDias || 0) }),
        });
      }
      setNewEtapa(EMPTY_NEW);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao criar etapa."); }
    finally { setSaving(null); }
  }

  async function updateEtapaDates(etapaId: string, dataInicioPrevista: string, dataFimPrevista: string) {
    if (!bundle) return;
    setError(null);
    setScheduleNotice(null);
    try {
      const result = await api<{ cascadedCount?: number; updated?: Array<{ etapaId: string; nome: string; cascading: boolean }> }>(
        `/api/arch/construction/${bundle.obra.id}/etapas/${etapaId}/reschedule`,
        {
          method: "POST",
          body: JSON.stringify({ dataInicioPrevista, dataFimPrevista }),
        },
      );
      const cascadedCount = Number(result?.cascadedCount ?? 0);
      setScheduleNotice(
        cascadedCount > 0
          ? `Cronograma recalculado: ${cascadedCount} etapa${cascadedCount === 1 ? "" : "s"} sucessora${cascadedCount === 1 ? "" : "s"} ajustada${cascadedCount === 1 ? "" : "s"} automaticamente.`
          : "Datas atualizadas. Nenhuma etapa sucessora precisou ser deslocada.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar datas do cronograma.");
      throw err;
    }
  }

  async function saveEtapa(etapaId: string) {
    if (!bundle) return;
    const draft = drafts[etapaId];
    if (!draft) return;
    setSaving(etapaId); setError(null); setScheduleNotice(null);
    try {
      await api(`/api/arch/construction/${bundle.obra.id}/etapas/${etapaId}`, {
        method: "PATCH",
        body: JSON.stringify({
          nome: draft.nome,
          responsavel: draft.responsavel,
          custoPrevisto: Number(draft.custoPrevisto || 0),
          pesoFisico: Number(draft.pesoFisico || 0),
          marco: draft.marco,
          ...(!draft.dataInicioPrevista || !draft.dataFimPrevista
            ? { dataInicioPrevista: draft.dataInicioPrevista || null, dataFimPrevista: draft.dataFimPrevista || null }
            : {}),
        }),
      });

      if (draft.dataInicioPrevista && draft.dataFimPrevista) {
        const result = await api<{ cascadedCount?: number }>(
          `/api/arch/construction/${bundle.obra.id}/etapas/${etapaId}/reschedule`,
          {
            method: "POST",
            body: JSON.stringify({
              dataInicioPrevista: draft.dataInicioPrevista,
              dataFimPrevista: draft.dataFimPrevista,
            }),
          },
        );
        const cascadedCount = Number(result?.cascadedCount ?? 0);
        setScheduleNotice(
          cascadedCount > 0
            ? `Etapa salva e cronograma recalculado: ${cascadedCount} sucessora${cascadedCount === 1 ? "" : "s"} ajustada${cascadedCount === 1 ? "" : "s"}.`
            : "Etapa salva sem necessidade de deslocar sucessoras.",
        );
      }
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao atualizar etapa."); }
    finally { setSaving(null); }
  }

  async function addDependency(etapaId: string) {
    if (!bundle) return;
    const draft = dependencyDrafts[etapaId];
    if (!draft?.predecessorId) return;
    setSaving(`dep-${etapaId}`); setError(null);
    try {
      await api(`/api/arch/construction/${bundle.obra.id}/etapas/${etapaId}/dependencias`, {
        method: "POST",
        body: JSON.stringify({ dependeDeEtapaId: draft.predecessorId, tipo: draft.tipo, defasagemDias: Number(draft.defasagemDias || 0) }),
      });
      setDependencyDrafts((current) => ({ ...current, [etapaId]: { predecessorId: "", tipo: "FS", defasagemDias: "0" } }));
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao criar dependência."); }
    finally { setSaving(null); }
  }

  async function removeDependency(id: string) {
    if (!bundle) return;
    setSaving(`del-${id}`); setError(null);
    try {
      await api(`/api/arch/construction/${bundle.obra.id}/dependencias/${id}`, { method: "DELETE" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao remover dependência."); }
    finally { setSaving(null); }
  }

  if (!meta.id) return <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-slate-500">Selecione um projeto para planejar a obra.</div>;
  if (loading) return <div className="p-8 text-sm text-slate-500">Carregando planejamento físico-financeiro…</div>;
  if (!bundle) return <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">{error || "Não foi possível carregar o planejamento."}</div>;

  return (
    <div className="space-y-5">
      <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600">Planejamento físico-financeiro</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">{bundle.obra.nome}</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">Cronograma com dependências, caminho crítico, marcos, avanço previsto × realizado e custo produzido. O planejamento inicial pode ser gerado automaticamente a partir do orçamento atual.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={generatingPlan}
              onClick={() => void generatePlanFromBudget()}
              className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {generatingPlan ? "Gerando planejamento…" : "Gerar planejamento do orçamento"}
            </button>
            <button type="button" onClick={() => void load()} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Atualizar dados</button>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}
      {scheduleNotice ? <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">{scheduleNotice}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Previsto hoje" value={`${metrics.planned.toFixed(0)}%`} hint="avanço planejado" />
        <Metric label="Realizado" value={`${metrics.actual.toFixed(0)}%`} hint={`${(metrics.actual - metrics.planned).toFixed(0)} p.p. vs plano`} danger={metrics.actual + 1 < metrics.planned} />
        <Metric label="Atraso máximo" value={`${metrics.delayDays} dias`} hint="etapas vencidas" danger={metrics.delayDays > 0} />
        <Metric label="Custo previsto" value={money(metrics.totalCost)} hint="etapas planejadas" />
        <Metric label="Valor produzido" value={money(metrics.earned)} hint={`previsto hoje ${money(metrics.plannedCostEarned)}`} />
        <Metric label="Compras" value={money(metrics.purchases)} hint={metrics.scheduledFinish ? `término ${metrics.scheduledFinish.toLocaleDateString("pt-BR")}` : "sem término definido"} />
      </section>

      <section className="grid gap-5 2xl:grid-cols-[430px_1fr]">
        <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Adicionar etapa ou marco</h3>
          <p className="mt-1 text-xs text-slate-500">O peso físico é opcional. Se ficar zerado, o sistema usa o custo como peso; sem custo, divide igualmente.</p>
          <div className="mt-4 space-y-3">
            <input value={newEtapa.nome} onChange={(e) => setNewEtapa((v) => ({ ...v, nome: e.target.value }))} placeholder="Ex.: Fundação" className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">Início<input type="date" value={newEtapa.dataInicioPrevista} onChange={(e) => setNewEtapa((v) => ({ ...v, dataInicioPrevista: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="text-xs text-slate-500">Término<input type="date" value={newEtapa.dataFimPrevista} onChange={(e) => setNewEtapa((v) => ({ ...v, dataFimPrevista: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
            </div>
            <input value={newEtapa.responsavel} onChange={(e) => setNewEtapa((v) => ({ ...v, responsavel: e.target.value }))} placeholder="Responsável" className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">Custo previsto<input type="number" min="0" value={newEtapa.custoPrevisto} onChange={(e) => setNewEtapa((v) => ({ ...v, custoPrevisto: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="text-xs text-slate-500">Peso físico %<input type="number" min="0" max="100" value={newEtapa.pesoFisico} onChange={(e) => setNewEtapa((v) => ({ ...v, pesoFisico: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
            </div>
            <label className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm"><input type="checkbox" checked={newEtapa.marco} onChange={(e) => setNewEtapa((v) => ({ ...v, marco: e.target.checked }))} /> É um marco do projeto</label>
            {bundle.etapas.length ? <div className="rounded-2xl border border-slate-100 p-3"><p className="text-xs font-semibold text-slate-600">Dependência inicial (opcional)</p><select value={newEtapa.predecessorId} onChange={(e) => setNewEtapa((v) => ({ ...v, predecessorId: e.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Sem predecessora</option>{bundle.etapas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select><div className="mt-2 grid grid-cols-2 gap-2"><select value={newEtapa.tipo} onChange={(e) => setNewEtapa((v) => ({ ...v, tipo: e.target.value as Dependencia["tipo"] }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="FS">Término → Início</option><option value="SS">Início → Início</option><option value="FF">Término → Término</option><option value="SF">Início → Término</option></select><input type="number" value={newEtapa.defasagemDias} onChange={(e) => setNewEtapa((v) => ({ ...v, defasagemDias: e.target.value }))} placeholder="Folga dias" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div></div> : null}
            <button disabled={saving === "new" || !newEtapa.nome.trim()} onClick={() => void createEtapa()} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving === "new" ? "Salvando…" : "Adicionar ao cronograma"}</button>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">Linha do tempo</h3><p className="text-xs text-slate-500">O destaque identifica o caminho crítico calculado pelas dependências e durações.</p></div>{timeline ? <span className="text-xs text-slate-500">{timeline.start.toLocaleDateString("pt-BR")} → {timeline.end.toLocaleDateString("pt-BR")}</span> : null}</div>
            <div className="mt-5">
              {timeline ? (
                <DraggableScheduleGantt etapas={bundle.etapas} timeline={timeline} criticalIds={criticalIds} onUpdateDates={updateEtapaDates} />
              ) : (
                <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">Adicione etapas com datas para montar o Gantt.</div>
              )}
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Curva físico-financeira</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div><div className="flex justify-between text-xs"><span>Físico previsto</span><b>{metrics.planned.toFixed(1)}%</b></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-400" style={{ width: `${Math.min(100, metrics.planned)}%` }} /></div><div className="mt-3 flex justify-between text-xs"><span>Físico realizado</span><b>{metrics.actual.toFixed(1)}%</b></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-600" style={{ width: `${Math.min(100, metrics.actual)}%` }} /></div></div>
              <div><div className="flex justify-between text-xs"><span>Financeiro previsto até hoje</span><b>{money(metrics.plannedCostEarned)}</b></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-400" style={{ width: `${metrics.totalCost ? Math.min(100, metrics.plannedCostEarned / metrics.totalCost * 100) : 0}%` }} /></div><div className="mt-3 flex justify-between text-xs"><span>Valor produzido</span><b>{money(metrics.earned)}</b></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${metrics.totalCost ? Math.min(100, metrics.earned / metrics.totalCost * 100) : 0}%` }} /></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        {bundle.etapas.map((etapa) => {
          const draft = drafts[etapa.id] ?? draftFrom(etapa);
          const deps = bundle.dependencias.filter((dep) => dep.etapaId === etapa.id);
          const depDraft = dependencyDrafts[etapa.id] ?? { predecessorId: "", tipo: "FS" as const, defasagemDias: "0" };
          const critical = criticalIds.has(etapa.id);
          return (
            <article key={etapa.id} className={`rounded-[28px] border bg-white p-5 shadow-sm ${critical ? "border-rose-200" : "border-slate-100"}`}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${critical ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{critical ? "Caminho crítico" : statusLabel(etapa.status)}</span>{etapa.marco ? <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase text-violet-700">Marco</span> : null}<span className="text-xs text-slate-400">Executado {etapa.percentualExecutado.toFixed(0)}%</span></div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <label className="xl:col-span-2 text-[11px] font-medium text-slate-500">Etapa<input value={draft.nome} onChange={(e) => setDrafts((all) => ({ ...all, [etapa.id]: { ...draft, nome: e.target.value } }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" /></label>
                    <label className="text-[11px] font-medium text-slate-500">Início<input type="date" value={draft.dataInicioPrevista} onChange={(e) => setDrafts((all) => ({ ...all, [etapa.id]: { ...draft, dataInicioPrevista: e.target.value } }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                    <label className="text-[11px] font-medium text-slate-500">Término<input type="date" value={draft.dataFimPrevista} onChange={(e) => setDrafts((all) => ({ ...all, [etapa.id]: { ...draft, dataFimPrevista: e.target.value } }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                    <label className="text-[11px] font-medium text-slate-500">Custo previsto<input type="number" min="0" value={draft.custoPrevisto} onChange={(e) => setDrafts((all) => ({ ...all, [etapa.id]: { ...draft, custoPrevisto: e.target.value } }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                    <label className="text-[11px] font-medium text-slate-500">Peso %<input type="number" min="0" max="100" value={draft.pesoFisico} onChange={(e) => setDrafts((all) => ({ ...all, [etapa.id]: { ...draft, pesoFisico: e.target.value } }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end"><label className="text-[11px] font-medium text-slate-500">Responsável<input value={draft.responsavel} onChange={(e) => setDrafts((all) => ({ ...all, [etapa.id]: { ...draft, responsavel: e.target.value } }))} placeholder="Pessoa ou equipe" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><label className="flex h-10 items-center gap-2 rounded-xl bg-slate-50 px-3 text-xs"><input type="checkbox" checked={draft.marco} onChange={(e) => setDrafts((all) => ({ ...all, [etapa.id]: { ...draft, marco: e.target.checked } }))} /> Marco</label></div>
                </div>
                <button type="button" disabled={saving === etapa.id} onClick={() => void saveEtapa(etapa.id)} className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving === etapa.id ? "Salvando…" : "Salvar etapa"}</button>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-700">Dependências</p>
                <div className="mt-2 flex flex-wrap gap-2">{deps.map((dep) => { const predecessor = bundle.etapas.find((item) => item.id === dep.dependeDeEtapaId); return <button key={dep.id} title="Clique para remover" onClick={() => void removeDependency(dep.id)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-700 hover:bg-rose-50 hover:text-rose-700">{predecessor?.nome || "Etapa"} · {dep.tipo}{dep.defasagemDias ? ` · ${dep.defasagemDias > 0 ? "+" : ""}${dep.defasagemDias}d` : ""} ×</button>; })}{!deps.length ? <span className="text-xs text-slate-400">Sem predecessoras.</span> : null}</div>
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_180px_110px_auto]"><select value={depDraft.predecessorId} onChange={(e) => setDependencyDrafts((all) => ({ ...all, [etapa.id]: { ...depDraft, predecessorId: e.target.value } }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">Adicionar predecessora…</option>{bundle.etapas.filter((item) => item.id !== etapa.id).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select><select value={depDraft.tipo} onChange={(e) => setDependencyDrafts((all) => ({ ...all, [etapa.id]: { ...depDraft, tipo: e.target.value as Dependencia["tipo"] } }))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="FS">Término → Início</option><option value="SS">Início → Início</option><option value="FF">Término → Término</option><option value="SF">Início → Término</option></select><input type="number" value={depDraft.defasagemDias} onChange={(e) => setDependencyDrafts((all) => ({ ...all, [etapa.id]: { ...depDraft, defasagemDias: e.target.value } }))} placeholder="Folga" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" /><button disabled={!depDraft.predecessorId || saving === `dep-${etapa.id}`} onClick={() => void addDependency(etapa.id)} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50">Vincular</button></div>
                {deps.length ? <p className="mt-2 text-[10px] text-slate-400">Tipos: {deps.map((dep) => `${dep.tipo} = ${dependencyLabel(dep.tipo)}`).filter((value, index, all) => all.indexOf(value) === index).join(" · ")}</p> : null}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
