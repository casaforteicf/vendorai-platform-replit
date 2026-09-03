import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LayoutGrid,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  Video,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ConsentScope = "face_use" | "voice_use" | "ai_generation" | "organic_publish" | "paid_ads";

type MediaIdentity = {
  id: string;
  display_name: string;
  status: string;
  face_reference_asset_id?: string | null;
};

type VoiceProfile = {
  id: string;
  name: string;
  status: string;
  reference_asset_id?: string | null;
};

type Consent = {
  scope: ConsentScope;
  status: string;
  expires_at?: string | null;
  revoked_at?: string | null;
};

type IdentityDetail = {
  identity: MediaIdentity;
  voices: VoiceProfile[];
  consents: Consent[];
};

type Capabilities = {
  provider: "vendorai";
  capabilities: Record<string, "ready" | "building">;
};

type BatchRow = Record<string, string>;

type BatchResult = {
  name: string;
  status: "pending" | "generating" | "done" | "error";
  videoUrl?: string;
  error?: string;
};

type BatchJob = {
  id: string;
  operation: string;
  status: string;
  progress?: number | null;
  total?: number | null;
  error?: string | null;
  output?: {
    results?: BatchResult[];
    completedCount?: number;
    failedCount?: number;
    currentIndex?: number | null;
  } | null;
};

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...authHeaders(Boolean(init?.body)), ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `Falha na solicitação (${response.status})`);
  return data as T;
}

function normalizeSpreadsheetRows(rawRows: Array<Record<string, unknown>>): BatchRow[] {
  return rawRows
    .map((row) => Object.fromEntries(
      Object.entries(row)
        .map(([key, value]) => [key.trim(), value === null || value === undefined ? "" : String(value).trim()])
        .filter(([key]) => Boolean(key)),
    ))
    .filter((row) => Object.keys(row).length > 0);
}

function placeholdersIn(template: string): string[] {
  return [...template.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

export default function VideoLotePage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [identities, setIdentities] = useState<MediaIdentity[]>([]);
  const [identityId, setIdentityId] = useState("");
  const [detail, setDetail] = useState<IdentityDetail | null>(null);
  const [voiceProfileId, setVoiceProfileId] = useState("");
  const [loadingSetup, setLoadingSetup] = useState(true);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [template, setTemplate] = useState("Olá {{nome}}, preparei este vídeo especialmente para você.");
  const [bboxShift, setBboxShift] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [projectId, setProjectId] = useState("");
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState<BatchJob | null>(null);
  const [polling, setPolling] = useState(false);

  const activeConsentScopes = useMemo(() => {
    const now = Date.now();
    return new Set(
      (detail?.consents ?? [])
        .filter((item) => item.status === "active" && !item.revoked_at && (!item.expires_at || new Date(item.expires_at).getTime() > now))
        .map((item) => item.scope),
    );
  }, [detail]);

  const readyVoices = useMemo(
    () => (detail?.voices ?? []).filter((voice) => voice.status === "ready" && voice.reference_asset_id),
    [detail],
  );

  const batchReady = capabilities?.capabilities?.video_batch === "ready";
  const requiredConsentsReady = activeConsentScopes.has("face_use")
    && activeConsentScopes.has("voice_use")
    && activeConsentScopes.has("ai_generation");
  const faceReady = Boolean(detail?.identity.face_reference_asset_id);

  const usedPlaceholders = useMemo(() => placeholdersIn(template), [template]);
  const normalizedColumns = useMemo(() => new Set(columns.map((column) => column.toLowerCase())), [columns]);
  const missingPlaceholders = useMemo(
    () => usedPlaceholders.filter((placeholder) => !normalizedColumns.has(placeholder.toLowerCase())),
    [normalizedColumns, usedPlaceholders],
  );

  const canGenerate = Boolean(
    batchReady
    && detail
    && detail.identity.status === "active"
    && faceReady
    && requiredConsentsReady
    && readyVoices.some((voice) => voice.id === voiceProfileId)
    && rows.length > 0
    && template.trim()
    && template.length <= 5000
    && missingPlaceholders.length === 0
    && !submitting
    && job?.status !== "running",
  );

  const blockers = [
    !batchReady ? "motores de voz e lip-sync disponíveis" : null,
    !detail ? "pessoa/persona selecionada" : null,
    detail && detail.identity.status !== "active" ? "identidade ativa" : null,
    detail && !faceReady ? "foto de referência" : null,
    detail && readyVoices.length === 0 ? "voz pronta" : null,
    detail && !requiredConsentsReady ? "autorizações de rosto, voz e geração por IA" : null,
    rows.length === 0 ? "planilha CSV ou Excel" : null,
    !template.trim() ? "roteiro" : null,
    template.length > 5000 ? "roteiro com até 5.000 caracteres" : null,
    missingPlaceholders.length > 0 ? `colunas: ${missingPlaceholders.join(", ")}` : null,
  ].filter(Boolean) as string[];

  const loadIdentity = async (nextIdentityId: string) => {
    if (!tenantId || !nextIdentityId) {
      setDetail(null);
      setVoiceProfileId("");
      return;
    }
    const data = await apiJson<IdentityDetail>(`/api/tenants/${tenantId}/media-engine/identities/${nextIdentityId}`);
    setDetail(data);
    const nextVoice = data.voices?.find((voice) => voice.status === "ready" && voice.reference_asset_id);
    setVoiceProfileId(nextVoice?.id ?? "");
  };

  const loadSetup = async () => {
    if (!tenantId) return;
    setLoadingSetup(true);
    try {
      const [identityData, capabilityData] = await Promise.all([
        apiJson<{ identities: MediaIdentity[] }>(`/api/tenants/${tenantId}/media-engine/identities`),
        apiJson<Capabilities>(`/api/tenants/${tenantId}/media-engine/capabilities`),
      ]);
      const activeIdentities = (identityData.identities ?? []).filter((identity) => identity.status !== "archived");
      setIdentities(activeIdentities);
      setCapabilities(capabilityData);
      const nextIdentityId = identityId && activeIdentities.some((identity) => identity.id === identityId)
        ? identityId
        : activeIdentities.find((identity) => identity.status === "active")?.id ?? activeIdentities[0]?.id ?? "";
      setIdentityId(nextIdentityId);
      await loadIdentity(nextIdentityId);
    } catch (error) {
      toast({
        title: "Não foi possível carregar o vídeo em lote",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoadingSetup(false);
    }
  };

  useEffect(() => {
    void loadSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const changeIdentity = async (nextIdentityId: string) => {
    setIdentityId(nextIdentityId);
    try {
      await loadIdentity(nextIdentityId);
    } catch (error) {
      toast({ title: "Não foi possível carregar a identidade", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    }
  };

  const importSpreadsheet = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
      if (!sheet) throw new Error("A planilha não possui uma aba legível");

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      const parsedRows = normalizeSpreadsheetRows(rawRows);
      if (!parsedRows.length) throw new Error("A planilha precisa ter cabeçalho e ao menos uma linha de dados");
      if (parsedRows.length > 50) throw new Error(`A planilha possui ${parsedRows.length} linhas. O limite atual é 50 vídeos por lote; divida em mais de um arquivo.`);

      const parsedColumns = Array.from(new Set(parsedRows.flatMap((row) => Object.keys(row))));
      if (parsedColumns.length > 40) throw new Error("A planilha possui mais de 40 colunas. Reduza as colunas antes de importar.");
      const tooLong = parsedRows.some((row) => Object.values(row).some((value) => value.length > 500));
      if (tooLong) throw new Error("Existe uma célula com mais de 500 caracteres. Reduza o conteúdo antes de importar.");

      setRows(parsedRows);
      setColumns(parsedColumns);
      setFileName(file.name);
      setJob(null);
      setProjectId("");
      setJobId("");
      toast({ title: "Planilha importada", description: `${parsedRows.length} linha(s) e ${parsedColumns.length} coluna(s) prontas para personalização.` });
    } catch (error) {
      setRows([]);
      setColumns([]);
      setFileName("");
      toast({ title: "Não foi possível ler a planilha", description: error instanceof Error ? error.message : "Arquivo inválido", variant: "destructive" });
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const sheet = XLSX.utils.json_to_sheet([
      { nome: "Ana", empresa: "Empresa Exemplo", produto: "Plano Premium" },
      { nome: "Carlos", empresa: "Loja Modelo", produto: "Plano Profissional" },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Leads");
    XLSX.writeFile(workbook, "modelo-video-em-lote-vendorai.xlsx");
  };

  const insertPlaceholder = (column: string) => {
    const placeholder = `{{${column}}}`;
    setTemplate((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${placeholder}`.slice(0, 5000));
  };

  const startBatch = async () => {
    if (!canGenerate || !detail) return;
    setSubmitting(true);
    setJob(null);
    try {
      const title = `Vídeos em lote — ${fileName || detail.identity.display_name}`;
      const data = await apiJson<{ projectId: string; jobId: string }>(`/api/tenants/${tenantId}/media-engine/jobs`, {
        method: "POST",
        body: JSON.stringify({
          operation: "video_batch",
          title,
          context: {
            identityId: detail.identity.id,
            voiceProfileId,
            template: template.trim(),
            rows,
            language: "pt-br",
            bboxShift,
          },
        }),
      });
      setProjectId(data.projectId);
      setJobId(data.jobId);
      toast({ title: "Lote iniciado", description: `${rows.length} vídeo(s) entraram na fila persistente do VendorAI Media Engine.` });
    } catch (error) {
      toast({ title: "Não foi possível iniciar o lote", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const loadBatchStatus = async () => {
    if (!tenantId || !projectId || !jobId) return;
    setPolling(true);
    try {
      const data = await apiJson<{ jobs: BatchJob[] }>(`/api/tenants/${tenantId}/media/projects/${projectId}`);
      const batchJob = (data.jobs ?? []).find((item) => item.id === jobId && item.operation === "video_batch") ?? null;
      if (batchJob) setJob(batchJob);
    } catch (error) {
      console.error("video-batch: falha ao atualizar status", error);
    } finally {
      setPolling(false);
    }
  };

  useEffect(() => {
    if (!projectId || !jobId) return;
    void loadBatchStatus();
    if (job?.status === "done" || job?.status === "error") return;
    const timer = window.setInterval(() => { void loadBatchStatus(); }, 4_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, jobId, job?.status]);

  const results = job?.output?.results ?? [];
  const completedCount = job?.output?.completedCount ?? results.filter((item) => item.status === "done").length;
  const failedCount = job?.output?.failedCount ?? results.filter((item) => item.status === "error").length;
  const progress = Math.max(0, Math.min(100, Number(job?.progress ?? 0)));

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0b1e] via-[#1a1040] to-[#0a0818] text-[#e8e4f8]">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button onClick={() => navigate("/content-studio/video")} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-3">
              <ArrowLeft className="h-4 w-4" /> Voltar para Vídeo com IA
            </button>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-blue-500/20 text-blue-300"><LayoutGrid className="h-6 w-6" /></div>
              <div>
                <h1 className="text-xl font-bold">Vídeo em lote</h1>
                <p className="text-sm text-gray-400">Planilha → roteiro personalizado → voz autorizada → lip-sync → Biblioteca.</p>
              </div>
            </div>
          </div>
          <button onClick={() => navigate("/content-studio/video/avatar")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2.5 text-sm font-semibold text-purple-200 hover:bg-purple-500/20">
            <UserRound className="h-4 w-4" /> Pessoas & Vozes
          </button>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 flex gap-3 text-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-200">Usa somente identidades autorizadas</p>
            <p className="text-xs text-gray-400 mt-0.5">Cada vídeo exige foto, voz pronta e autorizações ativas de rosto, voz e geração por IA. O lote é persistente e continua mesmo se você sair desta tela.</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.25fr]">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-white">1. Pessoa e voz</h2>
                <p className="text-xs text-gray-500 mt-1">Escolha quem aparecerá e falará nos vídeos.</p>
              </div>
              <button disabled={loadingSetup} onClick={() => void loadSetup()} className="p-2 rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40" title="Atualizar">
                <RefreshCw className={cn("h-4 w-4", loadingSetup && "animate-spin")} />
              </button>
            </div>

            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-gray-300">Pessoa / Persona</span>
              <select value={identityId} onChange={(event) => void changeIdentity(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#171126] px-3 py-2.5 text-sm outline-none focus:border-blue-500/50">
                {!identities.length && <option value="">Nenhuma identidade cadastrada</option>}
                {identities.map((identity) => <option key={identity.id} value={identity.id}>{identity.display_name}{identity.status !== "active" ? ` — ${identity.status}` : ""}</option>)}
              </select>
            </label>

            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-gray-300">Voz autorizada</span>
              <select value={voiceProfileId} onChange={(event) => setVoiceProfileId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#171126] px-3 py-2.5 text-sm outline-none focus:border-blue-500/50">
                {!readyVoices.length && <option value="">Nenhuma voz pronta</option>}
                {readyVoices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
              </select>
            </label>

            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-gray-300">Ajuste facial</span>
              <input type="number" min={-20} max={20} value={bboxShift} onChange={(event) => setBboxShift(Math.max(-20, Math.min(20, Number(event.target.value) || 0)))} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm outline-none focus:border-blue-500/50" />
            </label>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className={cn("rounded-lg border px-3 py-2", batchReady ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200" : "border-amber-500/20 bg-amber-500/5 text-amber-200")}>
                {batchReady ? <CheckCircle2 className="h-3.5 w-3.5 inline mr-1.5" /> : <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5" />}
                Media Engine {batchReady ? "pronto" : "aguardando GPU"}
              </div>
              <div className={cn("rounded-lg border px-3 py-2", faceReady && requiredConsentsReady && readyVoices.length ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200" : "border-amber-500/20 bg-amber-500/5 text-amber-200")}>
                <ShieldCheck className="h-3.5 w-3.5 inline mr-1.5" /> Identidade {faceReady && requiredConsentsReady && readyVoices.length ? "pronta" : "incompleta"}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-bold text-white">2. Planilha de personalização</h2>
                <p className="text-xs text-gray-500 mt-1">CSV, XLSX ou XLS. Máximo de 50 linhas por lote.</p>
              </div>
              <button onClick={downloadTemplate} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/5">
                <Download className="h-3.5 w-3.5" /> Baixar modelo
              </button>
            </div>

            <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSpreadsheet(file); }} />
            <button onClick={() => fileInput.current?.click()} className="w-full rounded-xl border border-dashed border-blue-500/30 bg-blue-500/5 p-5 text-left hover:bg-blue-500/10 transition-colors">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-500/15 p-2.5 text-blue-300">{rows.length ? <FileSpreadsheet className="h-5 w-5" /> : <Upload className="h-5 w-5" />}</div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{fileName || "Importar planilha"}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{rows.length ? `${rows.length} linha(s) • ${columns.length} coluna(s)` : "Clique para escolher CSV ou Excel"}</p>
                </div>
              </div>
            </button>

            {columns.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-gray-400">Colunas disponíveis — clique para inserir no roteiro:</p>
                <div className="flex flex-wrap gap-1.5">
                  {columns.map((column) => (
                    <button key={column} onClick={() => insertPlaceholder(column)} className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-medium text-blue-200 hover:bg-blue-500/20">
                      {`{{${column}}}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {rows.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-white/5 text-gray-400">
                    <tr>{columns.slice(0, 6).map((column) => <th key={column} className="px-3 py-2 text-left font-medium whitespace-nowrap">{column}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 4).map((row, index) => (
                      <tr key={index} className="border-t border-white/5 text-gray-300">
                        {columns.slice(0, 6).map((column) => <td key={column} className="px-3 py-2 max-w-[180px] truncate">{row[column]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 4 && <p className="px-3 py-2 text-[10px] text-gray-600 border-t border-white/5">+ {rows.length - 4} linha(s) não exibida(s) no preview</p>}
              </div>
            )}
          </section>
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 space-y-4">
          <div>
            <h2 className="font-bold text-white">3. Roteiro personalizado</h2>
            <p className="text-xs text-gray-500 mt-1">Use nomes de colunas entre chaves duplas. Ex.: <span className="text-blue-300">Olá {`{{nome}}`}, temos uma condição para {`{{empresa}}`}.</span></p>
          </div>
          <textarea value={template} onChange={(event) => setTemplate(event.target.value)} rows={5} maxLength={5000} className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-blue-500/50" placeholder="Olá {{nome}}, preparei uma apresentação para {{empresa}}..." />
          <div className="flex items-center justify-between gap-3 text-[10px] text-gray-600">
            <span>{usedPlaceholders.length ? `Personalizações: ${usedPlaceholders.join(", ")}` : "Sem placeholders: o mesmo texto será usado em todas as linhas."}</span>
            <span>{template.length}/5000</span>
          </div>
          {missingPlaceholders.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" /> A planilha não possui: {missingPlaceholders.join(", ")}.
            </div>
          )}
        </section>

        {blockers.length > 0 && !projectId && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-100">
            <span className="font-semibold">Para iniciar o lote, falta:</span> {blockers.join(", ")}.
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button disabled={!canGenerate} onClick={() => void startBatch()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {submitting ? "Criando lote..." : `Gerar ${rows.length || 0} vídeo(s)`}
          </button>
          <p className="text-[11px] text-gray-500">O processamento é sequencial e persistente para respeitar os workers de GPU e evitar duplicações.</p>
        </div>

        {projectId && (
          <section className="rounded-2xl border border-blue-500/25 bg-blue-500/5 p-5 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-blue-300" />
                  <h2 className="font-bold text-white">Produção do lote</h2>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">Job {jobId.slice(0, 8)}… • salvo no projeto da Biblioteca</p>
              </div>
              <button onClick={() => void loadBatchStatus()} disabled={polling} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 hover:text-white disabled:opacity-40">
                <RefreshCw className={cn("h-3.5 w-3.5", polling && "animate-spin")} /> Atualizar
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-300">{job?.status === "done" ? "Concluído" : job?.status === "error" ? "Concluído com falha" : "Processando"}</span>
                <span className="text-gray-400">{progress}% • {completedCount} prontos • {failedCount} falhas</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all" style={{ width: `${progress}%` }} /></div>
            </div>

            {job?.error && <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200">{job.error}</div>}

            {results.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {results.map((result, index) => (
                  <div key={`${result.name}-${index}`} className="rounded-xl border border-white/10 bg-black/15 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-white truncate">{result.name}</p>
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]",
                        result.status === "done" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
                        result.status === "error" && "border-red-500/30 bg-red-500/10 text-red-200",
                        result.status === "generating" && "border-blue-500/30 bg-blue-500/10 text-blue-200",
                        result.status === "pending" && "border-white/10 bg-white/5 text-gray-400",
                      )}>
                        {result.status === "done" && <CheckCircle2 className="h-3 w-3" />}
                        {result.status === "error" && <XCircle className="h-3 w-3" />}
                        {result.status === "generating" && <Loader2 className="h-3 w-3 animate-spin" />}
                        {result.status === "pending" && <Play className="h-3 w-3" />}
                        {result.status === "done" ? "Pronto" : result.status === "error" ? "Falhou" : result.status === "generating" ? "Gerando" : "Na fila"}
                      </span>
                    </div>
                    {result.error && <p className="text-[10px] text-red-300 line-clamp-2">{result.error}</p>}
                    {result.videoUrl && <video controls preload="metadata" src={result.videoUrl} className="w-full max-h-64 rounded-lg bg-black" />}
                  </div>
                ))}
              </div>
            )}

            {job?.status === "done" && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200 flex gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> Lote concluído. Os vídeos prontos foram salvos individualmente na Biblioteca Audiovisual.
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
