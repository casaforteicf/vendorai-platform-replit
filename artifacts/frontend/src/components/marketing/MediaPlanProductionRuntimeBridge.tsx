import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Video } from "lucide-react";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const RESUME_KEY_PREFIX = "vendorai_media_plan_resume_v1:";

type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };

type MediaProject = {
  id: string;
  status: string;
  source: string;
  context?: Record<string, unknown> | null;
};

type CalendarItem = {
  id: string;
  mediaPlanId?: string | null;
  status: string;
  contentGenerationId?: string | null;
};

type MediaPlan = {
  id: string;
  conteudo?: { statusPlanejamento?: string } | null;
};

type ContentUsage = { monthlyUsed?: number; monthlyLimit?: number };

type MediaJob = {
  id: string;
  operation?: string;
  status?: string;
  error?: string | null;
  progress?: number | null;
  total?: number | null;
  output?: { videoUrl?: string; videoAssetId?: string } | null;
};

type SiteJob = {
  status?: string;
  error?: string;
  result?: { id?: string; siteSlug?: string };
};

type RuntimeSummary = {
  pending: number;
  failed: number;
  processing: number;
  used: number;
  limit: number;
};

function currentTenantId(): string {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CachedOverride;
      if (parsed?.id) return parsed.id;
    }
  } catch {}
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return "";
    return (JSON.parse(raw) as CachedUser)?.tenantId ?? "";
  } catch {
    return "";
  }
}

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function asContext(project: MediaProject) {
  return project.context && typeof project.context === "object" && !Array.isArray(project.context)
    ? project.context
    : {};
}

function mediaUrl(value: string) {
  return value.startsWith("/objects/") ? `/api/storage${value}` : value;
}

async function patchProject(tenantId: string, project: MediaProject, patch: Record<string, unknown>) {
  const response = await fetch(`/api/tenants/${tenantId}/media/projects/${project.id}`, {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify({ context: { ...asContext(project), ...patch } }),
  });
  if (!response.ok) throw new Error("Não foi possível sincronizar o rascunho do Plano de Mídia.");
}

function productionButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    (button.textContent ?? "").toLowerCase().includes("produzir plano completo"),
  ) ?? null;
}

function refreshQueueButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
    (button.textContent ?? "").trim().toLowerCase() === "atualizar",
  ) ?? null;
}

function attachStatusHost() {
  let host = document.querySelector<HTMLElement>("[data-vendorai-plan-runtime-status]");
  if (!host) {
    host = document.createElement("div");
    host.setAttribute("data-vendorai-plan-runtime-status", "true");
    host.className = "basis-full";
  }
  const productionHost = document.querySelector<HTMLElement>("[data-vendorai-plan-production]");
  const parent = productionHost?.parentElement;
  if (parent && host.parentElement !== parent) parent.appendChild(host);
  return host.parentElement ? host : null;
}

function useLocationSnapshot() {
  const [value, setValue] = useState(() => `${window.location.pathname}${window.location.search}`);
  useEffect(() => {
    const update = () => setValue(`${window.location.pathname}${window.location.search}`);
    window.addEventListener("popstate", update);
    const timer = window.setInterval(update, 350);
    return () => {
      window.removeEventListener("popstate", update);
      window.clearInterval(timer);
    };
  }, []);
  return value;
}

function VideoJobCard({ tenantId, projectId, jobId }: { tenantId: string; projectId: string; jobId: string }) {
  const [job, setJob] = useState<MediaJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !projectId || !jobId) return;
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/projects/${projectId}`, { headers: authHeaders(), cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { jobs?: MediaJob[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar o vídeo.");
      const current = (body.jobs ?? []).find((entry) => entry.id === jobId) ?? null;
      if (!current) throw new Error("O job deste vídeo não foi encontrado.");
      setJob(current);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar o vídeo.");
    } finally {
      setLoading(false);
    }
  }, [jobId, projectId, tenantId]);

  useEffect(() => {
    void load();
    if (job?.status === "done" || job?.status === "error") return;
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [job?.status, load]);

  const progress = useMemo(() => {
    const raw = Number(job?.progress ?? 0);
    const total = Number(job?.total ?? 100);
    if (!Number.isFinite(raw)) return 0;
    return total > 0 && total !== 100
      ? Math.max(0, Math.min(100, Math.round((raw / total) * 100)))
      : Math.max(0, Math.min(100, Math.round(raw)));
  }, [job?.progress, job?.total]);

  if (loading && !job) {
    return <div className="rounded-xl border border-primary/20 bg-card p-5 shadow-sm"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Abrindo o vídeo criado pelo Plano de Mídia…</div></div>;
  }

  if (error) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" /><div><p className="text-sm font-semibold">Não foi possível abrir este job</p><p className="mt-1 text-xs text-muted-foreground">{error}</p><button type="button" onClick={() => void load()} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary"><RefreshCw className="h-3.5 w-3.5" />Tentar novamente</button></div></div></div>;
  }

  const videoUrl = job?.output?.videoUrl ? mediaUrl(job.output.videoUrl) : "";
  const done = job?.status === "done";
  const failed = job?.status === "error";

  return (
    <div className="rounded-xl border border-primary/25 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Video className="h-5 w-5" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">Vídeo do Plano de Mídia</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${done ? "bg-emerald-100 text-emerald-700" : failed ? "bg-red-100 text-red-700" : "bg-indigo-100 text-indigo-700"}`}>{done ? "Pronto para revisão" : failed ? "Falhou" : "Em geração"}</span></div>
            <p className="mt-1 text-xs text-muted-foreground">Este é o job real criado pela Produção do Plano. Não é um novo vídeo vazio.</p>
          </div>
        </div>
        <button type="button" onClick={() => window.location.assign("/content")} className="rounded-md border px-3 py-2 text-xs font-semibold hover:bg-muted">Voltar à produção</button>
      </div>

      {!done && !failed && (
        <div className="mt-4 space-y-2"><div className="flex justify-between text-xs"><span className="text-muted-foreground">Media Engine processando</span><strong>{progress}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></div>
      )}
      {failed && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{job?.error ?? "O Media Engine não conseguiu concluir este vídeo."}</div>}
      {done && videoUrl && <div className="mt-4 overflow-hidden rounded-xl border bg-black"><video src={videoUrl} controls playsInline className="aspect-video w-full object-contain" /></div>}
      {done && !videoUrl && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">O processamento terminou, mas o arquivo final ainda não foi anexado ao job. Atualize em alguns segundos.</div>}
    </div>
  );
}

export function MediaPlanProductionRuntimeBridge() {
  const tenantId = currentTenantId();
  const location = useLocationSnapshot();
  const pathname = location.split("?")[0] ?? "";
  const params = useMemo(() => new URLSearchParams(location.includes("?") ? location.split("?")[1] : ""), [location]);
  const [summary, setSummary] = useState<RuntimeSummary | null>(null);
  const [statusHost, setStatusHost] = useState<HTMLElement | null>(null);
  const [videoHost, setVideoHost] = useState<HTMLElement | null>(null);
  const lastSyncRef = useRef(false);

  const onPlanQueue = pathname === "/content" && params.get("mode") !== "avulso";
  const videoProjectId = pathname === "/content-studio/video" ? params.get("projectId") ?? "" : "";
  const videoJobId = pathname === "/content-studio/video" ? params.get("jobId") ?? "" : "";
  const siteId = pathname === "/content" && params.get("view") === "lp" ? params.get("siteId") ?? "" : "";

  const sync = useCallback(async () => {
    if (!tenantId || !onPlanQueue || lastSyncRef.current) return;
    lastSyncRef.current = true;
    let changed = false;
    try {
      const [projectsResponse, calendarResponse, planResponse, usageResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/projects?limit=100`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/content-calendar`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/media-plan`, { headers: authHeaders(), cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/content`, { headers: authHeaders(), cache: "no-store" }),
      ]);
      const projectsBody = await projectsResponse.json().catch(() => ({})) as { projects?: MediaProject[] };
      const calendarBody = await calendarResponse.json().catch(() => []) as CalendarItem[];
      const plan = await planResponse.json().catch(() => null) as MediaPlan | null;
      const usage = await usageResponse.json().catch(() => ({})) as ContentUsage;
      const projects = (projectsBody.projects ?? []).filter((project) => asContext(project).source === "media-plan");

      for (const project of projects) {
        const context = asContext(project);
        const kind = String(context.executorKind ?? "");
        const materializationStatus = String(context.materializationStatus ?? "");

        if (kind === "video" && context.executorProjectId && context.executorJobId) {
          const executorProjectId = String(context.executorProjectId);
          const executorJobId = String(context.executorJobId);
          const specificUrl = `/content-studio/video?from=media-plan&projectId=${encodeURIComponent(executorProjectId)}&jobId=${encodeURIComponent(executorJobId)}`;
          let nextPatch: Record<string, unknown> = context.executorUrl === specificUrl ? {} : { executorUrl: specificUrl };
          if (materializationStatus === "processing") {
            const detailResponse = await fetch(`/api/tenants/${tenantId}/media/projects/${executorProjectId}`, { headers: authHeaders(), cache: "no-store" });
            if (detailResponse.ok) {
              const detail = await detailResponse.json().catch(() => ({})) as { jobs?: MediaJob[] };
              const job = (detail.jobs ?? []).find((entry) => entry.id === executorJobId);
              if (job?.status === "done") nextPatch = { ...nextPatch, materializationStatus: "draft_ready", executorDetail: "Vídeo gerado e pronto para revisão", executorOutputUrl: job.output?.videoUrl ?? null };
              if (job?.status === "error") nextPatch = { ...nextPatch, materializationStatus: "failed", executorDetail: job.error ?? "Falha no Media Engine" };
            }
          }
          if (Object.keys(nextPatch).length > 0) {
            await patchProject(tenantId, project, nextPatch).catch(() => null);
            changed = true;
          }
        }

        if (kind === "site" && materializationStatus === "processing" && context.executorJobId) {
          const jobId = String(context.executorJobId);
          const response = await fetch(`/api/tenants/${tenantId}/site-generator/jobs/${jobId}`, { headers: authHeaders(), cache: "no-store" });
          if (response.ok) {
            const job = await response.json().catch(() => ({})) as SiteJob;
            if (job.status === "done") {
              const generatedSiteId = job.result?.id ?? "";
              const campaignId = String(context.campaignId ?? "");
              const mediaPlanId = String(context.mediaPlanId ?? plan?.id ?? "");
              const executorUrl = `/content?tab=campanhas&view=lp&source=media-plan&mediaPlanId=${encodeURIComponent(mediaPlanId)}&campaignId=${encodeURIComponent(campaignId)}${generatedSiteId ? `&siteId=${encodeURIComponent(generatedSiteId)}` : ""}`;
              await patchProject(tenantId, project, { materializationStatus: "draft_ready", executorDraftId: generatedSiteId || null, executorSiteSlug: job.result?.siteSlug ?? null, executorUrl, executorDetail: "Landing page/site gerado e salvo como rascunho" }).catch(() => null);
              changed = true;
            } else if (job.status === "error") {
              await patchProject(tenantId, project, { materializationStatus: "failed", executorDetail: job.error ?? "O gerador da página falhou" }).catch(() => null);
              changed = true;
            }
          }
        }
      }

      const projectByItem = new Map(projects.map((project) => [String(asContext(project).calendarItemId ?? ""), project]));
      const relevant = Array.isArray(calendarBody)
        ? calendarBody.filter((item) => (!item.mediaPlanId || item.mediaPlanId === plan?.id) && (item.status === "aprovado" || item.status === "gerado"))
        : [];
      let pending = 0;
      let failed = 0;
      let processing = 0;
      for (const item of relevant) {
        if (item.contentGenerationId) continue;
        const project = projectByItem.get(item.id);
        const status = String(project ? asContext(project).materializationStatus ?? "" : "");
        if (status === "failed") failed += 1;
        else if (status === "processing") processing += 1;
        else if (!["draft_ready", "ready", "review", "approved"].includes(status)) pending += 1;
      }

      const used = Number(usage.monthlyUsed ?? 0);
      const limit = Number(usage.monthlyLimit ?? 20);
      setSummary({ pending, failed, processing, used, limit });

      const available = Math.max(0, limit - used);
      if (plan?.conteudo?.statusPlanejamento === "aprovado" && pending > 0 && available >= pending && processing === 0) {
        const resumeKey = `${RESUME_KEY_PREFIX}${plan.id}:${pending}`;
        let alreadyResumed = false;
        try { alreadyResumed = sessionStorage.getItem(resumeKey) === "1"; } catch {}
        if (!alreadyResumed) {
          const button = productionButton();
          if (button && !button.disabled) {
            try { sessionStorage.setItem(resumeKey, "1"); } catch {}
            window.setTimeout(() => button.click(), 350);
          }
        }
      }

      if (changed) window.setTimeout(() => refreshQueueButton()?.click(), 500);
    } finally {
      lastSyncRef.current = false;
    }
  }, [onPlanQueue, tenantId]);

  useEffect(() => {
    if (!onPlanQueue || !tenantId) {
      setSummary(null);
      setStatusHost(null);
      return;
    }
    const attach = () => setStatusHost(attachStatusHost());
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    void sync();
    const timer = window.setInterval(() => void sync(), 5000);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [onPlanQueue, sync, tenantId]);

  useEffect(() => {
    if (!videoProjectId || !videoJobId || !tenantId) {
      setVideoHost(null);
      return;
    }
    const attach = () => {
      let host = document.querySelector<HTMLElement>("[data-vendorai-plan-video-job]");
      if (!host) {
        const header = Array.from(document.querySelectorAll<HTMLElement>("header")).find((entry) => (entry.textContent ?? "").includes("Vídeo com IA"));
        if (!header?.parentElement) return;
        host = document.createElement("div");
        host.setAttribute("data-vendorai-plan-video-job", "true");
        header.insertAdjacentElement("afterend", host);
      }
      setVideoHost(host);
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [tenantId, videoJobId, videoProjectId]);

  useEffect(() => {
    if (!siteId || !tenantId) return;
    let completed = false;
    const focus = () => {
      if (completed) return;
      const selector = document.querySelector<HTMLSelectElement>('select[aria-label="Selecionar site para visualizar"]');
      if (selector && Array.from(selector.options).some((option) => option.value === siteId)) {
        if (selector.value !== siteId) {
          selector.value = siteId;
          selector.dispatchEvent(new Event("change", { bubbles: true }));
        }
        completed = true;
        return;
      }
      const previewButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => (button.textContent ?? "").trim() === "Visualizar site");
      if (previewButton && !previewButton.disabled) previewButton.click();
    };
    focus();
    const timer = window.setInterval(focus, 700);
    return () => window.clearInterval(timer);
  }, [siteId, tenantId]);

  const statusPortal = statusHost && summary ? createPortal((() => {
    const available = Math.max(0, summary.limit - summary.used);
    const quotaInsufficient = summary.pending > 0 && available < summary.pending;
    if (!quotaInsufficient && summary.failed === 0) return null;
    return (
      <div className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${quotaInsufficient ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-900"}`}>
        {quotaInsufficient ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
        {quotaInsufficient ? (
          <span><strong>Produção protegida:</strong> há {summary.pending} material(is) ainda não iniciado(s), mas somente {available} geração(ões) disponíveis neste período ({summary.used}/{summary.limit}). O sistema não dispara o restante em massa para não transformar itens válidos em falhas por limite.</span>
        ) : (
          <span><strong>{summary.failed} material(is) com falha.</strong> Use Produzir plano completo para tentar novamente somente depois de corrigir o motivo indicado em Produção real.</span>
        )}
      </div>
    );
  })(), statusHost) : null;

  const videoPortal = videoHost && videoProjectId && videoJobId
    ? createPortal(<VideoJobCard tenantId={tenantId} projectId={videoProjectId} jobId={videoJobId} />, videoHost)
    : null;

  return <>{statusPortal}{videoPortal}</>;
}
