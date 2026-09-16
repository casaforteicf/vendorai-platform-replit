import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceProject } from "../WorkspaceContext";

type MediaItem = {
  url: string;
  caption?: string;
  uploadedAt?: string;
  mimeType?: string;
  name?: string;
};

type ServiceItem = {
  nome: string;
  quantidade?: number;
  unidade?: string;
  etapaId?: string;
  observacao?: string;
};

type MaterialItem = {
  nome: string;
  quantidade?: number;
  unidade?: string;
  fornecedor?: string;
  conferido?: boolean;
  observacao?: string;
};

type OccurrenceItem = {
  tipo: string;
  descricao: string;
  gravidade?: "baixa" | "media" | "alta" | "critica";
  resolvida?: boolean;
  responsavel?: string;
};

type TeamItem = {
  equipe?: string;
  funcao?: string;
  quantidade: number;
  horas?: number;
  responsavel?: string;
};

type EquipmentItem = {
  nome: string;
  quantidade?: number;
  horasUso?: number;
  status?: "operando" | "parado" | "manutencao";
  observacao?: string;
};

type DiaryEntry = {
  id: string;
  data: string;
  conteudo: string;
  responsavelNome?: string | null;
  status: string;
  climaTempo?: string | null;
  maoDeObra?: number | null;
  observacoes?: string | null;
  condicaoCanteiro?: string | null;
  servicosExecutados: ServiceItem[];
  materiaisRecebidos: MaterialItem[];
  ocorrencias: OccurrenceItem[];
  equipeDetalhes: TeamItem[];
  equipamentos: EquipmentItem[];
  fotos: MediaItem[];
  videos: MediaItem[];
  anexos: MediaItem[];
  resumoIA?: string | null;
  aprovadoEm?: string | null;
};

type Draft = {
  data: string;
  conteudo: string;
  climaTempo: string;
  maoDeObra: string;
  observacoes: string;
  condicaoCanteiro: string;
  servicosExecutados: ServiceItem[];
  materiaisRecebidos: MaterialItem[];
  ocorrencias: OccurrenceItem[];
  equipeDetalhes: TeamItem[];
  equipamentos: EquipmentItem[];
};

type Props = { arqState?: any };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): Draft {
  return {
    data: today(),
    conteudo: "",
    climaTempo: "",
    maoDeObra: "",
    observacoes: "",
    condicaoCanteiro: "",
    servicosExecutados: [],
    materiaisRecebidos: [],
    ocorrencias: [],
    equipeDetalhes: [],
    equipamentos: [],
  };
}

function token() {
  return localStorage.getItem("vendorai_token") ?? "";
}

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
  const candidate = arqState?.currentProject ?? arqState?.selectedProject ?? arqState?.project ?? {};
  return {
    id: String(projectCtx?.id || arqState?.projectId || candidate?.id || ""),
    name: String(projectCtx?.name || candidate?.titulo || candidate?.title || candidate?.name || "Projeto ARQDOR"),
    clientName: candidate?.clienteNome || candidate?.clientName || null,
    budget: candidate?.orcamentoTotal || null,
    status: candidate?.status || null,
  };
}

function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalize(raw: any): DiaryEntry {
  return {
    id: String(raw?.id ?? ""),
    data: String(raw?.data ?? ""),
    conteudo: String(raw?.conteudo ?? ""),
    responsavelNome: raw?.responsavelNome ?? raw?.responsavel_nome ?? null,
    status: String(raw?.status ?? "rascunho"),
    climaTempo: raw?.climaTempo ?? raw?.clima_tempo ?? null,
    maoDeObra: raw?.maoDeObra ?? raw?.mao_de_obra ?? null,
    observacoes: raw?.observacoes ?? null,
    condicaoCanteiro: raw?.condicaoCanteiro ?? raw?.condicao_canteiro ?? null,
    servicosExecutados: array<ServiceItem>(raw?.servicosExecutados ?? raw?.servicos_executados),
    materiaisRecebidos: array<MaterialItem>(raw?.materiaisRecebidos ?? raw?.materiais_recebidos),
    ocorrencias: array<OccurrenceItem>(raw?.ocorrencias),
    equipeDetalhes: array<TeamItem>(raw?.equipeDetalhes ?? raw?.equipe_detalhes),
    equipamentos: array<EquipmentItem>(raw?.equipamentos),
    fotos: array<MediaItem>(raw?.fotos),
    videos: array<MediaItem>(raw?.videos),
    anexos: array<MediaItem>(raw?.anexos),
    resumoIA: raw?.resumoIA ?? raw?.resumo_ia ?? null,
    aprovadoEm: raw?.aprovadoEm ?? raw?.aprovado_em ?? null,
  };
}

function toDraft(entry: DiaryEntry): Draft {
  return {
    data: entry.data,
    conteudo: entry.conteudo,
    climaTempo: entry.climaTempo ?? "",
    maoDeObra: entry.maoDeObra == null ? "" : String(entry.maoDeObra),
    observacoes: entry.observacoes ?? "",
    condicaoCanteiro: entry.condicaoCanteiro ?? "",
    servicosExecutados: entry.servicosExecutados,
    materiaisRecebidos: entry.materiaisRecebidos,
    ocorrencias: entry.ocorrencias,
    equipeDetalhes: entry.equipeDetalhes,
    equipamentos: entry.equipamentos,
  };
}

function statusLabel(status: string) {
  if (status === "aprovado") return "Aprovado";
  if (status === "revisao") return "Em revisão";
  return "Rascunho";
}

function statusClass(status: string) {
  if (status === "aprovado") return "bg-emerald-50 text-emerald-700";
  if (status === "revisao") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function DetailSection({ title, hint, children, defaultOpen = false }: { title: string; hint: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-2xl border border-slate-100 bg-slate-50/70">
      <summary className="cursor-pointer list-none px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
      </summary>
      <div className="border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-600">Remover</button>;
}

export default function CompleteSiteDiaryPanel({ arqState }: Props) {
  const { projectCtx, setProjectCtx } = useWorkspaceProject();
  const meta = useMemo(() => projectMeta(arqState, projectCtx), [arqState, projectCtx]);
  const [obraId, setObraId] = useState<string>("");
  const [obraNome, setObraNome] = useState<string>(meta.name);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfRange, setPdfRange] = useState({ dataInicio: today(), dataFim: today() });

  const load = useCallback(async () => {
    if (!meta.id) { setLoading(false); return; }
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
      const bundle = await api<{ diario: any[] }>(`/api/arch/construction/${id}`);
      setEntries((bundle.diario ?? []).map(normalize));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar o diário da obra.");
    } finally {
      setLoading(false);
    }
  }, [meta.budget, meta.clientName, meta.id, meta.name, meta.status, projectCtx, setProjectCtx]);

  useEffect(() => { void load(); }, [load]);

  function resetForm() {
    setDraft(emptyDraft());
    setEditingId(null);
    setFiles([]);
    setCaption("");
  }

  function editEntry(entry: DiaryEntry) {
    setEditingId(entry.id);
    setDraft(toDraft(entry));
    setFiles([]);
    setCaption("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function uploadMedia(entryId: string, selectedFiles = files) {
    if (!obraId || selectedFiles.length === 0) return;
    const form = new FormData();
    selectedFiles.forEach((file) => form.append("midias", file));
    if (caption.trim()) form.append("caption", caption.trim());
    await api(`/api/arch/construction/${obraId}/diario/${entryId}/midias`, { method: "POST", body: form });
  }

  async function saveEntry() {
    if (!obraId || !draft.conteudo.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        data: draft.data,
        conteudo: draft.conteudo.trim(),
        climaTempo: draft.climaTempo.trim() || null,
        maoDeObra: draft.maoDeObra === "" ? null : Number(draft.maoDeObra),
        observacoes: draft.observacoes.trim() || null,
        condicaoCanteiro: draft.condicaoCanteiro.trim() || null,
        servicosExecutados: draft.servicosExecutados,
        materiaisRecebidos: draft.materiaisRecebidos,
        ocorrencias: draft.ocorrencias,
        equipeDetalhes: draft.equipeDetalhes,
        equipamentos: draft.equipamentos,
      };

      let entryId = editingId;
      if (!entryId) {
        const created = await api<{ diario: any }>(`/api/arch/construction/${obraId}/diario`, {
          method: "POST",
          body: JSON.stringify({
            data: payload.data,
            conteudo: payload.conteudo,
            climaTempo: payload.climaTempo,
            maoDeObra: payload.maoDeObra,
            observacoes: payload.observacoes,
          }),
        });
        entryId = String(created.diario?.id ?? "");
        if (!entryId) throw new Error("O diário foi criado sem identificador.");
      }

      await api(`/api/arch/construction/${obraId}/diario/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await uploadMedia(entryId);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o diário.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(entry: DiaryEntry, status: "rascunho" | "revisao" | "aprovado") {
    if (!obraId) return;
    setBusyId(entry.id);
    setError(null);
    try {
      await api(`/api/arch/construction/${obraId}/diario/${entry.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao alterar o status."); }
    finally { setBusyId(null); }
  }

  async function generateAI(entry: DiaryEntry) {
    if (!obraId) return;
    setBusyId(entry.id);
    setError(null);
    try {
      await api(`/api/arch/construction/${obraId}/diario/${entry.id}/resumo-ia`, { method: "POST" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível gerar o resumo IA."); }
    finally { setBusyId(null); }
  }

  async function addMediaToExisting(entry: DiaryEntry, selected: FileList | null) {
    if (!selected?.length) return;
    setBusyId(entry.id);
    setError(null);
    try {
      await uploadMedia(entry.id, Array.from(selected));
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao enviar mídia."); }
    finally { setBusyId(null); }
  }

  async function removeEntry(entry: DiaryEntry) {
    if (!obraId) return;
    if (!window.confirm(`Excluir o diário de ${entry.data}?`)) return;
    setBusyId(entry.id);
    try {
      await api(`/api/arch/construction/${obraId}/diario/${entry.id}`, { method: "DELETE" });
      if (editingId === entry.id) resetForm();
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao excluir o diário."); }
    finally { setBusyId(null); }
  }

  async function downloadPdf() {
    if (!obraId) return;
    setBusyId("pdf");
    setError(null);
    try {
      const response = await fetch(`/api/arch/construction/${obraId}/diario/relatorio-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
        body: JSON.stringify(pdfRange),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as any)?.error ?? `Erro ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `diario-${obraNome.replace(/\s+/g, "-").toLowerCase()}-${pdfRange.dataInicio}-${pdfRange.dataFim}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao gerar relatório PDF."); }
    finally { setBusyId(null); }
  }

  function updateService(index: number, patch: Partial<ServiceItem>) {
    setDraft((current) => ({ ...current, servicosExecutados: current.servicosExecutados.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  }

  function updateMaterial(index: number, patch: Partial<MaterialItem>) {
    setDraft((current) => ({ ...current, materiaisRecebidos: current.materiaisRecebidos.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  }

  function updateOccurrence(index: number, patch: Partial<OccurrenceItem>) {
    setDraft((current) => ({ ...current, ocorrencias: current.ocorrencias.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  }

  function updateTeam(index: number, patch: Partial<TeamItem>) {
    setDraft((current) => ({ ...current, equipeDetalhes: current.equipeDetalhes.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  }

  function updateEquipment(index: number, patch: Partial<EquipmentItem>) {
    setDraft((current) => ({ ...current, equipamentos: current.equipamentos.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  }

  const stats = useMemo(() => ({
    total: entries.length,
    pending: entries.filter((entry) => entry.status !== "aprovado").length,
    photos: entries.reduce((sum, entry) => sum + entry.fotos.length, 0),
    occurrences: entries.reduce((sum, entry) => sum + entry.ocorrencias.filter((item) => !item.resolvida).length, 0),
  }), [entries]);

  if (!meta.id) return <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-slate-500">Selecione um projeto para registrar a obra.</div>;
  if (loading) return <div className="p-8 text-sm text-slate-500">Carregando Diário de Obra…</div>;

  return (
    <div className="space-y-5">
      <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600">Diário de Obra</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-950">{obraNome}</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">Registro diário de campo com serviços, materiais, ocorrências, equipes, mídia, aprovação, IA e relatório PDF.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input type="date" value={pdfRange.dataInicio} onChange={(e) => setPdfRange((v) => ({ ...v, dataInicio: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs" />
            <input type="date" value={pdfRange.dataFim} onChange={(e) => setPdfRange((v) => ({ ...v, dataFim: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-2 text-xs" />
            <button type="button" onClick={() => void downloadPdf()} disabled={busyId === "pdf"} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">{busyId === "pdf" ? "Gerando…" : "Gerar relatório PDF"}</button>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Registros</p><p className="mt-2 text-2xl font-semibold">{stats.total}</p></div>
        <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Aguardando aprovação</p><p className="mt-2 text-2xl font-semibold">{stats.pending}</p></div>
        <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Fotos</p><p className="mt-2 text-2xl font-semibold">{stats.photos}</p></div>
        <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ocorrências abertas</p><p className={`mt-2 text-2xl font-semibold ${stats.occurrences ? "text-rose-600" : ""}`}>{stats.occurrences}</p></div>
      </section>

      <section className="grid gap-5 2xl:grid-cols-[520px_1fr]">
        <div className="self-start rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm 2xl:sticky 2xl:top-4">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="text-lg font-semibold">{editingId ? "Editar registro" : "Registrar o dia"}</h3><p className="mt-1 text-xs text-slate-500">Preencha primeiro o essencial. Os detalhes técnicos ficam organizados abaixo.</p></div>
            {editingId ? <button type="button" onClick={resetForm} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">Novo</button> : null}
          </div>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium text-slate-500">Data<input type="date" value={draft.data} onChange={(e) => setDraft((v) => ({ ...v, data: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="text-[11px] font-medium text-slate-500">Pessoas na obra<input type="number" min="0" value={draft.maoDeObra} onChange={(e) => setDraft((v) => ({ ...v, maoDeObra: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex.: 12" /></label>
            </div>
            <label className="block text-[11px] font-medium text-slate-500">Resumo do dia<textarea rows={5} value={draft.conteudo} onChange={(e) => setDraft((v) => ({ ...v, conteudo: e.target.value }))} placeholder="O que foi executado hoje?" className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium text-slate-500">Clima<input value={draft.climaTempo} onChange={(e) => setDraft((v) => ({ ...v, climaTempo: e.target.value }))} placeholder="Ensolarado, chuva…" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="text-[11px] font-medium text-slate-500">Condição do canteiro<input value={draft.condicaoCanteiro} onChange={(e) => setDraft((v) => ({ ...v, condicaoCanteiro: e.target.value }))} placeholder="Normal, úmido…" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
            </div>
            <label className="block text-[11px] font-medium text-slate-500">Observações gerais<textarea rows={2} value={draft.observacoes} onChange={(e) => setDraft((v) => ({ ...v, observacoes: e.target.value }))} placeholder="Pontos importantes para o próximo dia" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>

            <DetailSection title="Serviços executados" hint="Registre o que foi produzido e em qual quantidade." defaultOpen>
              <div className="space-y-2">
                {draft.servicosExecutados.map((item, index) => <div key={index} className="grid grid-cols-[1fr_82px_76px_auto] gap-2"><input value={item.nome} onChange={(e) => updateService(index, { nome: e.target.value })} placeholder="Serviço" className="rounded-xl border px-3 py-2 text-xs" /><input type="number" min="0" value={item.quantidade ?? ""} onChange={(e) => updateService(index, { quantidade: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="Qtd." className="rounded-xl border px-2 py-2 text-xs" /><input value={item.unidade ?? ""} onChange={(e) => updateService(index, { unidade: e.target.value })} placeholder="un/m²" className="rounded-xl border px-2 py-2 text-xs" /><RemoveButton onClick={() => setDraft((v) => ({ ...v, servicosExecutados: v.servicosExecutados.filter((_, i) => i !== index) }))} /></div>)}
                <button type="button" onClick={() => setDraft((v) => ({ ...v, servicosExecutados: [...v.servicosExecutados, { nome: "" }] }))} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">+ Serviço</button>
              </div>
            </DetailSection>

            <DetailSection title="Materiais recebidos" hint="Confirme entregas, quantidades e fornecedores.">
              <div className="space-y-2">
                {draft.materiaisRecebidos.map((item, index) => <div key={index} className="space-y-2 rounded-xl border border-slate-100 bg-white p-2"><div className="grid grid-cols-[1fr_80px_70px] gap-2"><input value={item.nome} onChange={(e) => updateMaterial(index, { nome: e.target.value })} placeholder="Material" className="rounded-xl border px-3 py-2 text-xs" /><input type="number" min="0" value={item.quantidade ?? ""} onChange={(e) => updateMaterial(index, { quantidade: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="Qtd." className="rounded-xl border px-2 py-2 text-xs" /><input value={item.unidade ?? ""} onChange={(e) => updateMaterial(index, { unidade: e.target.value })} placeholder="un" className="rounded-xl border px-2 py-2 text-xs" /></div><div className="flex gap-2"><input value={item.fornecedor ?? ""} onChange={(e) => updateMaterial(index, { fornecedor: e.target.value })} placeholder="Fornecedor" className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs" /><label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={Boolean(item.conferido)} onChange={(e) => updateMaterial(index, { conferido: e.target.checked })} /> Conferido</label><RemoveButton onClick={() => setDraft((v) => ({ ...v, materiaisRecebidos: v.materiaisRecebidos.filter((_, i) => i !== index) }))} /></div></div>)}
                <button type="button" onClick={() => setDraft((v) => ({ ...v, materiaisRecebidos: [...v.materiaisRecebidos, { nome: "", conferido: false }] }))} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">+ Material recebido</button>
              </div>
            </DetailSection>

            <DetailSection title="Ocorrências e impedimentos" hint="Registre problemas, riscos, atrasos ou decisões de campo.">
              <div className="space-y-2">
                {draft.ocorrencias.map((item, index) => <div key={index} className="space-y-2 rounded-xl border border-slate-100 bg-white p-2"><div className="grid grid-cols-[120px_1fr] gap-2"><input value={item.tipo} onChange={(e) => updateOccurrence(index, { tipo: e.target.value })} placeholder="Tipo" className="rounded-xl border px-3 py-2 text-xs" /><select value={item.gravidade ?? "media"} onChange={(e) => updateOccurrence(index, { gravidade: e.target.value as OccurrenceItem["gravidade"] })} className="rounded-xl border px-3 py-2 text-xs"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></div><textarea rows={2} value={item.descricao} onChange={(e) => updateOccurrence(index, { descricao: e.target.value })} placeholder="Descreva a ocorrência" className="w-full rounded-xl border px-3 py-2 text-xs" /><div className="flex items-center justify-between"><label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={Boolean(item.resolvida)} onChange={(e) => updateOccurrence(index, { resolvida: e.target.checked })} /> Resolvida</label><RemoveButton onClick={() => setDraft((v) => ({ ...v, ocorrencias: v.ocorrencias.filter((_, i) => i !== index) }))} /></div></div>)}
                <button type="button" onClick={() => setDraft((v) => ({ ...v, ocorrencias: [...v.ocorrencias, { tipo: "", descricao: "", gravidade: "media", resolvida: false }] }))} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">+ Ocorrência</button>
              </div>
            </DetailSection>

            <DetailSection title="Equipes e equipamentos" hint="Detalhe quem trabalhou e os equipamentos usados.">
              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Equipes</p>
                {draft.equipeDetalhes.map((item, index) => <div key={index} className="grid grid-cols-[1fr_1fr_70px_auto] gap-2"><input value={item.equipe ?? ""} onChange={(e) => updateTeam(index, { equipe: e.target.value })} placeholder="Equipe" className="rounded-xl border px-2 py-2 text-xs" /><input value={item.funcao ?? ""} onChange={(e) => updateTeam(index, { funcao: e.target.value })} placeholder="Função" className="rounded-xl border px-2 py-2 text-xs" /><input type="number" min="0" value={item.quantidade} onChange={(e) => updateTeam(index, { quantidade: Number(e.target.value || 0) })} className="rounded-xl border px-2 py-2 text-xs" /><RemoveButton onClick={() => setDraft((v) => ({ ...v, equipeDetalhes: v.equipeDetalhes.filter((_, i) => i !== index) }))} /></div>)}
                <button type="button" onClick={() => setDraft((v) => ({ ...v, equipeDetalhes: [...v.equipeDetalhes, { equipe: "", funcao: "", quantidade: 1 }] }))} className="rounded-xl border px-3 py-2 text-xs font-semibold">+ Equipe</button>
                <p className="pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Equipamentos</p>
                {draft.equipamentos.map((item, index) => <div key={index} className="grid grid-cols-[1fr_76px_110px_auto] gap-2"><input value={item.nome} onChange={(e) => updateEquipment(index, { nome: e.target.value })} placeholder="Equipamento" className="rounded-xl border px-2 py-2 text-xs" /><input type="number" min="0" value={item.quantidade ?? ""} onChange={(e) => updateEquipment(index, { quantidade: Number(e.target.value || 0) })} placeholder="Qtd." className="rounded-xl border px-2 py-2 text-xs" /><select value={item.status ?? "operando"} onChange={(e) => updateEquipment(index, { status: e.target.value as EquipmentItem["status"] })} className="rounded-xl border px-2 py-2 text-xs"><option value="operando">Operando</option><option value="parado">Parado</option><option value="manutencao">Manutenção</option></select><RemoveButton onClick={() => setDraft((v) => ({ ...v, equipamentos: v.equipamentos.filter((_, i) => i !== index) }))} /></div>)}
                <button type="button" onClick={() => setDraft((v) => ({ ...v, equipamentos: [...v.equipamentos, { nome: "", quantidade: 1, status: "operando" }] }))} className="rounded-xl border px-3 py-2 text-xs font-semibold">+ Equipamento</button>
              </div>
            </DetailSection>

            <DetailSection title="Fotos, vídeos e anexos" hint="Pode enviar até 10 arquivos por registro, com até 50 MB cada.">
              <input type="file" multiple accept="image/*,video/*,application/pdf,text/plain" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="w-full text-xs" />
              {files.length ? <p className="mt-2 text-xs text-slate-500">{files.length} arquivo(s) selecionado(s)</p> : null}
              <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda opcional para os arquivos" className="mt-2 w-full rounded-xl border px-3 py-2 text-xs" />
            </DetailSection>

            <button type="button" onClick={() => void saveEntry()} disabled={saving || !draft.conteudo.trim()} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Salvando…" : editingId ? "Salvar alterações" : "Salvar Diário de Obra"}</button>
          </div>
        </div>

        <div className="space-y-3">
          {entries.length ? entries.map((entry) => (
            <article key={entry.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{new Date(`${entry.data}T12:00:00`).toLocaleDateString("pt-BR")}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass(entry.status)}`}>{statusLabel(entry.status)}</span>{entry.ocorrencias.some((item) => !item.resolvida) ? <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase text-rose-700">Ocorrência aberta</span> : null}</div>
                  <p className="mt-1 text-xs text-slate-400">{entry.responsavelNome || "Equipe da obra"}{entry.aprovadoEm ? ` · aprovado ${new Date(entry.aprovadoEm).toLocaleString("pt-BR")}` : ""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => editEntry(entry)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">Editar</button>
                  <button type="button" onClick={() => void generateAI(entry)} disabled={busyId === entry.id} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">Resumo IA</button>
                  {entry.status === "aprovado" ? <button type="button" onClick={() => void changeStatus(entry, "rascunho")} disabled={busyId === entry.id} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">Reabrir</button> : <button type="button" onClick={() => void changeStatus(entry, "aprovado")} disabled={busyId === entry.id} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprovar</button>}
                  <label className="cursor-pointer rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">+ Mídia<input type="file" multiple accept="image/*,video/*,application/pdf,text/plain" onChange={(e) => { void addMediaToExisting(entry, e.target.files); e.currentTarget.value = ""; }} className="hidden" /></label>
                  <button type="button" onClick={() => void removeEntry(entry)} disabled={busyId === entry.id} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-600">Excluir</button>
                </div>
              </div>

              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{entry.conteudo}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">{entry.climaTempo ? <span>Clima: {entry.climaTempo}</span> : null}{entry.condicaoCanteiro ? <span>Canteiro: {entry.condicaoCanteiro}</span> : null}{entry.maoDeObra != null ? <span>{entry.maoDeObra} pessoas</span> : null}<span>{entry.servicosExecutados.length} serviços</span><span>{entry.materiaisRecebidos.length} materiais</span><span>{entry.fotos.length} fotos</span><span>{entry.videos.length} vídeos</span><span>{entry.anexos.length} anexos</span></div>

              {entry.resumoIA ? <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4"><p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">Resumo IA</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-violet-950">{entry.resumoIA}</p></div> : null}

              {entry.ocorrencias.length ? <div className="mt-4 space-y-2"><p className="text-xs font-semibold text-slate-700">Ocorrências</p>{entry.ocorrencias.map((item, index) => <div key={index} className={`rounded-xl px-3 py-2 text-xs ${item.resolvida ? "bg-slate-50 text-slate-500" : "bg-rose-50 text-rose-800"}`}><b>{item.tipo || "Ocorrência"}</b> · {item.descricao}{item.resolvida ? " · resolvida" : ""}</div>)}</div> : null}

              {(entry.fotos.length || entry.videos.length || entry.anexos.length) ? <div className="mt-4 flex flex-wrap gap-2">{[...entry.fotos, ...entry.videos, ...entry.anexos].slice(0, 12).map((item, index) => <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer" className="max-w-[210px] truncate rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 underline decoration-slate-300">{item.name || item.caption || (item.mimeType?.startsWith("image/") ? "Foto" : item.mimeType?.startsWith("video/") ? "Vídeo" : "Anexo")}</a>)}</div> : null}
            </article>
          )) : <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">Nenhum registro ainda. Use o formulário ao lado para registrar o primeiro dia da obra.</div>}
        </div>
      </section>
    </div>
  );
}
