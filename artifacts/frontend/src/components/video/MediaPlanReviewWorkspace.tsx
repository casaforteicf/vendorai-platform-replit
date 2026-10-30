import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Film,
  Image as ImageIcon,
  Library,
  Loader2,
  Mic2,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Scissors,
  Sparkles,
  Subtitles,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const MEDIA_PLAN_EXECUTION_KEY = "vendorai_media_plan_execution_v1";
const DESIGN_PLAN_KEY = "vendorai_graphic_design_plan_v1";

type ReferenceMedia = {
  assetId: string;
  type: string;
  storageUrl: string;
  originalFilename?: string | null;
};

type ExecutionContext = {
  tenantId: string;
  mediaPlanId?: string;
  campaign?: {
    id?: string;
    nome?: string;
    objetivo?: string;
    produtoServico?: string;
    mensagemCentral?: string;
    oferta?: string;
  };
  calendarItem?: {
    id: string;
    temaSugerido?: string;
    canal?: string;
    tipo?: string;
    dataAgendada?: string;
  };
  referenceMedia?: ReferenceMedia[];
};

type StoredDesign = {
  brief?: {
    headline?: string;
    supportingText?: string;
    cta?: string;
    brandColor?: string;
  };
  plan?: {
    overallScore?: number;
    scenes?: Array<{ headline?: string; supportingText?: string; cta?: string; score?: number }>;
  };
};

type MediaProject = {
  id: string;
  context?: Record<string, unknown> | null;
};

type MediaJob = {
  id: string;
  status?: string;
  error?: string | null;
  output?: { videoUrl?: string; videoAssetId?: string } | null;
};

type CalendarItem = {
  id: string;
  mediaPlanId?: string | null;
  status: string;
  contentGenerationId?: string | null;
  dataAgendada?: string;
  temaSugerido?: string;
  canal?: string;
  tipo?: string;
};

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function mediaUrl(value?: string) {
  if (!value) return "";
  if (value.startsWith("/objects/")) return `/api/storage${value}`;
  return value;
}

function cleanHeadline(value: string) {
  return value
    .replace(/^reels?\s*\d*\s*[:·-]\s*/i, "")
    .replace(/^educa(?:ç|c)[aã]o\s*[:·-]\s*/i, "")
    .replace(/\s*[—–-]\s*foco.*$/i, "")
    .trim();
}

function firstSentence(value: string, max = 110) {
  const text = value.trim();
  if (text.length <= max) return text;
  const sentence = text.split(/[.!?]/)[0]?.trim() ?? text;
  return `${sentence.slice(0, max).trim()}…`;
}

function scoreFor(headline: string, support: string, cta: string, hasMedia: boolean) {
  let score = 58;
  if (headline.length >= 18 && headline.length <= 70) score += 14;
  else if (headline.length <= 95) score += 7;
  if (support.length >= 25 && support.length <= 140) score += 8;
  if (cta.length >= 4 && cta.length <= 40) score += 7;
  if (hasMedia) score += 10;
  return Math.max(45, Math.min(96, score));
}

export default function MediaPlanReviewWorkspace() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const quickEditRef = useRef<HTMLDivElement | null>(null);
  const [execution, setExecution] = useState<ExecutionContext | null>(null);
  const [storedDesign, setStoredDesign] = useState<StoredDesign | null>(null);
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [headline, setHeadline] = useState("");
  const [supportingText, setSupportingText] = useState("");
  const [cta, setCta] = useState("");
  const [brandColor, setBrandColor] = useState("#2563EB");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [generatedMedia, setGeneratedMedia] = useState<ReferenceMedia | null>(null);
  const [productionState, setProductionState] = useState<"idle" | "processing" | "ready" | "failed">("idle");
  const [productionDetail, setProductionDetail] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(MEDIA_PLAN_EXECUTION_KEY);
      const designRaw = sessionStorage.getItem(DESIGN_PLAN_KEY);
      const nextExecution = raw ? JSON.parse(raw) as ExecutionContext : null;
      const nextDesign = designRaw ? JSON.parse(designRaw) as StoredDesign : null;
      setExecution(nextExecution);
      setStoredDesign(nextDesign);
      const initialHeadline = nextDesign?.brief?.headline || nextExecution?.calendarItem?.temaSugerido || "Material do Plano de Mídia";
      setHeadline(cleanHeadline(initialHeadline));
      setSupportingText(nextDesign?.brief?.supportingText || nextExecution?.campaign?.mensagemCentral || "");
      setCta(nextDesign?.brief?.cta || nextExecution?.campaign?.oferta || "Fale com nossa equipe");
      setBrandColor(nextDesign?.brief?.brandColor || "#2563EB");
    } catch {
      setExecution(null);
    }
  }, []);

  useEffect(() => {
    if (!execution?.tenantId) return;
    fetch(`/api/tenants/${execution.tenantId}/content-calendar`, { headers: authHeaders(), cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((items: CalendarItem[]) => setCalendar(items.filter((item) => !execution.mediaPlanId || item.mediaPlanId === execution.mediaPlanId)))
      .catch(() => setCalendar([]));
  }, [execution?.tenantId, execution?.mediaPlanId]);

  useEffect(() => {
    if (!execution?.tenantId || !execution.calendarItem?.id) return;
    let active = true;
    const loadGeneratedMedia = async () => {
      try {
        const projectsResponse = await fetch(`/api/tenants/${execution.tenantId}/media/projects?limit=200`, { headers: authHeaders(), cache: "no-store" });
        const projectsBody = await projectsResponse.json().catch(() => ({})) as { projects?: MediaProject[] };
        const project = (projectsBody.projects ?? []).find((entry) => String(entry.context?.calendarItemId ?? "") === execution.calendarItem?.id);
        if (!active || !project) {
          if (active) setProductionState("idle");
          return;
        }
        const context = project.context ?? {};
        const outputUrl = typeof context.executorOutputUrl === "string" ? context.executorOutputUrl : "";
        const projectId = typeof context.executorProjectId === "string" ? context.executorProjectId : "";
        const jobId = typeof context.executorJobId === "string" ? context.executorJobId : "";
        const materialStatus = String(context.materializationStatus ?? "");
        if (outputUrl) {
          setGeneratedMedia({ assetId: String(context.executorOutputAssetId ?? jobId ?? project.id), type: "video", storageUrl: outputUrl, originalFilename: "Vídeo gerado pela IA" });
          setProductionState("ready");
          setProductionDetail("Vídeo gerado e pronto para revisão");
          return;
        }
        if (projectId && jobId) {
          const detailResponse = await fetch(`/api/tenants/${execution.tenantId}/media/projects/${projectId}`, { headers: authHeaders(), cache: "no-store" });
          const detail = await detailResponse.json().catch(() => ({})) as { jobs?: MediaJob[] };
          const job = (detail.jobs ?? []).find((entry) => entry.id === jobId);
          const jobUrl = job?.output?.videoUrl ?? "";
          if (job?.status === "done" && jobUrl) {
            setGeneratedMedia({ assetId: job.output?.videoAssetId ?? job.id, type: "video", storageUrl: jobUrl, originalFilename: "Vídeo gerado pela IA" });
            setProductionState("ready");
            setProductionDetail("Vídeo gerado e pronto para revisão");
          } else if (job?.status === "error" || materialStatus === "failed") {
            setProductionState("failed");
            setProductionDetail(job?.error ?? String(context.executorDetail ?? "A geração da mídia falhou."));
          } else {
            setProductionState("processing");
            setProductionDetail("A IA está criando as cenas e montando o vídeo.");
          }
          return;
        }
        setProductionState(materialStatus === "failed" ? "failed" : materialStatus === "processing" ? "processing" : "idle");
        setProductionDetail(String(context.executorDetail ?? ""));
      } catch {
        if (active) setProductionDetail("Não foi possível consultar a produção agora.");
      }
    };
    void loadGeneratedMedia();
    const timer = window.setInterval(() => void loadGeneratedMedia(), 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [execution?.tenantId, execution?.calendarItem?.id]);

  const currentItem = useMemo(() => calendar.find((item) => item.id === execution?.calendarItem?.id), [calendar, execution?.calendarItem?.id]);
  const media = generatedMedia ? [generatedMedia, ...(execution?.referenceMedia ?? [])] : (execution?.referenceMedia ?? []);
  const mainMedia = media[0];
  const previewUrl = mediaUrl(mainMedia?.storageUrl);
  const score = storedDesign?.plan?.overallScore ?? scoreFor(headline, supportingText, cta, Boolean(previewUrl));
  const sortedItems = useMemo(() => [...calendar].sort((a, b) => String(a.dataAgendada ?? "").localeCompare(String(b.dataAgendada ?? ""))), [calendar]);
  const currentIndex = Math.max(0, sortedItems.findIndex((item) => item.id === execution?.calendarItem?.id));
  const batchPosition = sortedItems.length > 0 ? currentIndex + 1 : 1;
  const batchTotal = Math.min(10, sortedItems.length || 10);

  const scenes = useMemo(() => {
    const stored = storedDesign?.plan?.scenes ?? [];
    if (stored.length > 0) return stored.slice(0, 4).map((scene, index) => ({
      title: scene.headline || `Cena ${index + 1}`,
      score: scene.score ?? Math.max(60, score - index * 3),
      start: index === 0 ? "0:00" : `0:${String(index * 5).padStart(2, "0")}`,
      end: `0:${String(index === 0 ? 4 : index * 5 + 5).padStart(2, "0")}`,
    }));
    return [0, 1, 2, 3].map((index) => ({
      title: index === 0 ? headline : index === 1 ? execution?.campaign?.produtoServico || "Benefício principal" : index === 2 ? "Prova e resultado" : cta,
      score: Math.max(55, score - index * 3),
      start: index === 0 ? "0:00" : `0:${String(index * 5).padStart(2, "0")}`,
      end: `0:${String(index === 0 ? 4 : index * 5 + 5).padStart(2, "0")}`,
    }));
  }, [storedDesign, score, headline, cta, execution?.campaign?.produtoServico]);

  const saveQuickEdits = () => {
    if (!execution) return;
    const updated: ExecutionContext = {
      ...execution,
      campaign: {
        ...execution.campaign,
        mensagemCentral: supportingText,
        oferta: cta,
      },
      calendarItem: execution.calendarItem ? { ...execution.calendarItem, temaSugerido: headline } : execution.calendarItem,
    };
    sessionStorage.setItem(MEDIA_PLAN_EXECUTION_KEY, JSON.stringify(updated));
    setExecution(updated);
    toast({ title: "Ajustes salvos", description: "Texto, CTA e direção foram atualizados sem consumir créditos de IA." });
  };

  const approve = async () => {
    if (!execution?.calendarItem?.id) return;
    if (!previewUrl) {
      toast({ title: "Mídia ainda não está pronta", description: productionState === "processing" ? "A IA ainda está montando o material. Aguarde a conclusão." : "Gere a mídia com IA ou selecione uma mídia própria antes de aprovar.", variant: "destructive" });
      return;
    }
    setApproving(true);
    try {
      if (currentItem?.status === "gerado" && currentItem.contentGenerationId) {
        const response = await fetch(`/api/content-calendar/${currentItem.id}`, {
          method: "PATCH",
          headers: authHeaders(true),
          body: JSON.stringify({ status: "aprovado" }),
        });
        if (!response.ok) throw new Error("Não foi possível aprovar o material.");
      }
      sessionStorage.setItem(`vendorai_material_review_approved:${execution.calendarItem.id}`, new Date().toISOString());
      toast({ title: "Material aprovado", description: "A aprovação não consumiu créditos de IA." });
    } catch (error) {
      toast({ title: "Não foi possível aprovar", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setApproving(false);
    }
  };

  const openAdvanced = () => {
    const params = new URLSearchParams(window.location.search);
    params.set("advanced", "1");
    navigate(`${window.location.pathname}?${params.toString()}`);
  };

  const strongPoints = [
    headline.length <= 80 ? "Headline com boa leitura" : "Estrutura visual definida",
    cta.trim() ? "CTA definido" : "Formato definido",
    "Cores da marca aplicadas",
    "Safe area preservada",
  ];
  const suggestions = [
    headline.length > 70 ? "Encurtar a headline para leitura mais rápida" : null,
    !previewUrl ? productionState === "processing" ? "Aguardar a IA concluir a mídia principal" : "Gerar a mídia principal com IA antes da aprovação" : null,
    supportingText.length > 140 ? "Reduzir o texto de apoio" : null,
  ].filter(Boolean) as string[];

  if (!execution?.calendarItem) {
    return <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">Não foi possível identificar o material vindo do Plano de Mídia.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-28 sm:pb-10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="mt-0.5" onClick={() => navigate(`/content?tab=campanhas&source=media-plan&mediaPlanId=${execution.mediaPlanId ?? ""}`)}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Revisão do material</h1>
            <p className="mt-1 text-sm text-muted-foreground">Confira o conteúdo, faça ajustes rápidos e aprove quando estiver pronto.</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-sm sm:flex"><span className="font-semibold">{batchPosition} / {batchTotal}</span><span className="text-muted-foreground">no lote atual</span></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.02fr)_minmax(420px,.98fr)]">
        <div className="space-y-4">
          <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">Em revisão</Badge>
              <Badge variant="secondary">{execution.calendarItem.canal || "Instagram"} / {(execution.calendarItem.tipo || "reels").replaceAll("_", " ")}</Badge>
              <Badge variant="outline">Lote 1 de {Math.max(1, Math.ceil((sortedItems.length || 10) / 10))}</Badge>
            </div>
            <h2 className="mt-4 text-2xl font-semibold">{execution.calendarItem.tipo?.toLowerCase() === "reels" ? "Reels" : "Material"} · {cleanHeadline(execution.calendarItem.temaSugerido || "Conteúdo")}</h2>
            <p className="mt-1 text-base text-muted-foreground">{execution.campaign?.nome || execution.campaign?.produtoServico || "Campanha do Plano de Mídia"}</p>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Objetivo", execution.campaign?.objetivo || "—"],
                ["Tema", "Educação"],
                ["Data", execution.calendarItem.dataAgendada ? new Date(`${execution.calendarItem.dataAgendada}T12:00:00`).toLocaleDateString("pt-BR") : "—"],
                ["CTA", cta || "—"],
              ].map(([label, value]) => <div key={label} className="rounded-xl border bg-background p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>)}
            </div>
          </section>

          <section className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="mx-auto max-w-[430px]">
              <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] border bg-slate-950 shadow-xl">
                {previewUrl ? (
                  mainMedia?.type === "video" ? <video src={previewUrl} muted playsInline className="absolute inset-0 h-full w-full object-cover" /> : <img src={previewUrl} alt="Prévia do material" className="absolute inset-0 h-full w-full object-cover" />
                ) : <div className="absolute inset-0" style={{ background: `linear-gradient(145deg, ${brandColor}, #151515 78%)` }} />}
                <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/55" />
                <div className="absolute left-6 top-6 rounded-xl bg-blue-500 px-3 py-2 text-sm font-bold text-white">V</div>
                <div className="absolute right-5 top-5 rounded-full bg-black/45 px-3 py-1 text-[11px] font-semibold text-white">REELS</div>
                <div className="absolute inset-x-6 bottom-8 text-white">
                  <h3 className="max-w-[90%] text-3xl font-extrabold leading-[.98] sm:text-4xl">{firstSentence(headline, 70)}</h3>
                  {supportingText ? <p className="mt-4 max-w-[88%] text-sm leading-snug text-white/90">{firstSentence(supportingText, 105)}</p> : null}
                  {cta ? <span className="mt-5 inline-flex rounded-full bg-blue-500 px-4 py-2 text-xs font-semibold">{firstSentence(cta, 32)} →</span> : null}
                </div>
                {!previewUrl ? <div className="absolute right-5 bottom-5 rounded-full bg-black/45 p-2 text-white/70"><ImageIcon className="h-5 w-5" /></div> : null}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border bg-background p-3">
              <div className="flex items-center justify-between"><p className="text-sm font-semibold">Mídia utilizada</p><span className="text-xs text-muted-foreground">{media.length} item(ns)</span></div>
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {media.slice(0, 4).map((item) => <div key={item.assetId} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-muted">{item.type === "video" ? <video src={mediaUrl(item.storageUrl)} muted className="h-full w-full object-cover" /> : <img src={mediaUrl(item.storageUrl)} alt="" className="h-full w-full object-cover" />}</div>)}
                {productionState === "processing" ? (
                  <div className="flex h-20 min-w-48 shrink-0 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-medium text-indigo-800"><Loader2 className="h-4 w-4 animate-spin" />IA criando cenas e montando vídeo</div>
                ) : !previewUrl ? (
                  <button type="button" onClick={() => navigate(`/content?tab=campanhas&source=media-plan&mediaPlanId=${execution.mediaPlanId ?? ""}`)} className="flex h-20 min-w-40 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-blue-300 bg-blue-50 text-xs font-semibold text-blue-800"><Sparkles className="mb-1 h-5 w-5" />{productionState === "failed" ? "Tentar gerar novamente" : "Gerar mídia com IA"}</button>
                ) : null}
                <button type="button" onClick={openAdvanced} className="flex h-20 min-w-32 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground"><Plus className="mb-1 h-5 w-5" />Usar mídia própria</button>
              </div>
              {productionDetail ? <p className={`mt-2 text-xs ${productionState === "failed" ? "text-red-700" : "text-muted-foreground"}`}>{productionDetail}</p> : null}
            </div>

            <Button className="mt-4 h-12 w-full rounded-xl bg-blue-500 text-base hover:bg-blue-600" onClick={() => void approve()} disabled={approving || !previewUrl}>{approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : productionState === "processing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}{productionState === "processing" ? "Aguardando mídia da IA" : !previewUrl ? "Gere a mídia para aprovar" : "Aprovar material"}</Button>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Button variant="outline" className="h-11" onClick={() => quickEditRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}><Pencil className="mr-1.5 h-4 w-4" />Editar texto</Button>
              <Button variant="outline" className="h-11" onClick={openAdvanced}><ImageIcon className="mr-1.5 h-4 w-4" />Trocar mídia</Button>
              <Button variant="outline" className="h-11" onClick={openAdvanced}><Sparkles className="mr-1.5 h-4 w-4" />Nova versão</Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Aprovar, editar texto ou trocar mídia não consome créditos. Gerar uma nova versão pode consumir créditos de IA e exige confirmação no editor.</p>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Qualidade do material</h3>
            <div className="mt-4 grid gap-5 sm:grid-cols-[150px_1fr]">
              <div className="flex h-36 w-36 items-center justify-center rounded-full" style={{ background: `conic-gradient(#10b981 ${score * 3.6}deg, #e5e7eb 0)` }}><div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-card"><span className="text-4xl font-semibold">{score}</span><span className="text-sm text-muted-foreground">/ 100</span></div></div>
              <div className="space-y-3">
                <div><p className="text-sm font-semibold">Pontos fortes</p><div className="mt-2 space-y-1.5">{strongPoints.map((item) => <p key={item} className="flex items-center gap-2 text-sm text-muted-foreground"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" /></span>{item}</p>)}</div></div>
                <div><p className="text-sm font-semibold">Ajustes sugeridos</p><div className="mt-2 space-y-1.5">{suggestions.length ? suggestions.map((item) => <p key={item} className="text-sm text-blue-700">• {item}</p>) : <p className="text-sm text-emerald-700">Nenhum ajuste crítico identificado.</p>}</div></div>
              </div>
            </div>
          </section>

          <section ref={quickEditRef} className="rounded-3xl border bg-card p-5 shadow-sm scroll-mt-24">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Ajustes rápidos</h3><Button size="sm" variant="ghost" onClick={() => { setHeadline(cleanHeadline(execution.calendarItem?.temaSugerido || "")); setSupportingText(execution.campaign?.mensagemCentral || ""); setCta(execution.campaign?.oferta || ""); }}><RefreshCw className="mr-1.5 h-4 w-4" />Redefinir</Button></div>
            <div className="mt-4 space-y-3">
              <label className="block"><span className="text-xs font-medium text-muted-foreground">Headline principal</span><textarea value={headline} onChange={(event) => setHeadline(event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-sm" /><span className="mt-1 block text-right text-[11px] text-muted-foreground">{headline.length}/80</span></label>
              <label className="block"><span className="text-xs font-medium text-muted-foreground">Texto de apoio</span><textarea value={supportingText} onChange={(event) => setSupportingText(event.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-sm" /><span className="mt-1 block text-right text-[11px] text-muted-foreground">{supportingText.length}/140</span></label>
              <label className="block"><span className="text-xs font-medium text-muted-foreground">CTA</span><input value={cta} onChange={(event) => setCta(event.target.value)} className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-sm" /></label>
              <div className="grid grid-cols-2 gap-3"><label><span className="text-xs font-medium text-muted-foreground">Layout</span><div className="mt-1.5 flex h-11 items-center justify-between rounded-xl border bg-background px-3 text-sm">Reels (9:16)<ChevronDown className="h-4 w-4" /></div></label><label><span className="text-xs font-medium text-muted-foreground">Cor da marca</span><div className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border bg-background px-3"><input type="color" value={brandColor} onChange={(event) => setBrandColor(event.target.value)} className="h-7 w-7 rounded border-0 p-0" /><span className="text-sm">{brandColor}</span></div></label></div>
              <Button className="w-full" onClick={saveQuickEdits}>Salvar ajustes</Button>
            </div>
          </section>

          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Cenas do vídeo</h3><button type="button" onClick={openAdvanced} className="text-sm font-medium text-primary">Ver todas →</button></div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{scenes.map((scene, index) => <button type="button" key={`${scene.title}-${index}`} onClick={openAdvanced} className="text-left"><div className="relative aspect-[4/5] overflow-hidden rounded-xl border bg-slate-950">{previewUrl ? <img src={previewUrl} alt="" className="h-full w-full object-cover opacity-80" /> : <div className="h-full w-full" style={{ background: `linear-gradient(145deg, ${brandColor}, #111)` }} />}<div className="absolute inset-0 bg-black/25" /><span className="absolute bottom-2 right-2 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-900">{scene.score}</span><span className="absolute inset-x-2 bottom-9 line-clamp-3 text-[10px] font-semibold uppercase leading-tight text-white">{scene.title}</span></div><p className="mt-1 text-xs font-medium">Cena {index + 1}</p><p className="text-[10px] text-muted-foreground">{scene.start} – {scene.end}</p></button>)}</div>
          </section>

          <section className="rounded-3xl border bg-card shadow-sm">
            <button type="button" onClick={() => setAdvancedOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 p-5 text-left"><div><div className="flex items-center gap-2"><h3 className="text-lg font-semibold">Editor avançado</h3><Badge variant="secondary">Novo</Badge></div><p className="mt-1 text-sm text-muted-foreground">Ferramentas profissionais para design, vídeo, áudio e IA.</p></div>{advancedOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</button>
            {advancedOpen ? <div className="grid grid-cols-3 gap-2 border-t p-4">{[
              [Palette, "Direção de arte", openAdvanced], [Mic2, "Pessoas & Vozes", () => navigate("/content-studio/video/avatar")], [Scissors, "Edição profissional", () => navigate("/content-studio/video/edicao")], [Subtitles, "Legendagem", () => navigate("/content-studio/video/legenda")], [Film, "Clipes automáticos", () => navigate("/content-studio/video/clipes")], [Video, "Vídeo em lote", () => navigate("/content-studio/video/lote")], [Library, "Biblioteca", () => navigate("/midias")], [Sparkles, "Media Intelligence", openAdvanced], [ImageIcon, "Mídia e layout", openAdvanced],
            ].map(([Icon, label, action]) => { const ToolIcon = Icon as typeof Palette; return <button type="button" key={String(label)} onClick={action as () => void} className="flex min-h-24 flex-col items-center justify-center rounded-xl border bg-background p-2 text-center text-xs font-medium hover:bg-muted"><ToolIcon className="mb-2 h-5 w-5" />{String(label)}</button>; })}</div> : null}
          </section>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3 text-sm"><button type="button" className="flex items-center gap-2 text-left text-muted-foreground" disabled={currentIndex <= 0}><ArrowLeft className="h-4 w-4" />Anterior</button><button type="button" className="flex items-center gap-2 text-right text-muted-foreground" disabled={currentIndex < 0 || currentIndex >= sortedItems.length - 1}>Próximo<ArrowRight className="h-4 w-4" /></button></div>
    </div>
  );
}
