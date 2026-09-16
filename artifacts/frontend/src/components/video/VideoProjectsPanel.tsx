import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, CheckCircle2, Clock3, Film, Layers3, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type MediaProject = {
  id: string;
  title: string;
  kind: string;
  status: string;
  source?: string | null;
  context?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type MediaVersion = {
  id: string;
  assetId?: string | null;
  operation?: string | null;
  createdAt?: string | null;
};

type MediaJob = {
  id: string;
  status: string;
  output?: { videoAssetId?: string; assetId?: string } | null;
  updatedAt?: string | null;
};

type ProjectGroup = {
  key: string;
  title: string;
  projects: MediaProject[];
  latest: MediaProject;
  versionCount: number;
  latestVersionNumber: number | null;
  guided: boolean;
};

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function statusLabel(status: string) {
  if (status === "ready") return "Pronto";
  if (status === "processing") return "Em produção";
  if (status === "archived") return "Arquivado";
  return "Rascunho";
}

function statusClass(status: string) {
  if (status === "ready") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "processing") return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-border bg-muted text-muted-foreground";
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function timestamp(project: MediaProject) {
  const raw = project.updatedAt || project.createdAt || "";
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : 0;
}

function groupProjects(projects: MediaProject[]): ProjectGroup[] {
  const groups = new Map<string, MediaProject[]>();
  for (const project of projects) {
    const context = asRecord(project.context);
    const seriesId = String(context.guidedVideoSeriesId ?? "").trim();
    const key = seriesId ? `guided:${seriesId}` : `project:${project.id}`;
    const current = groups.get(key) ?? [];
    current.push(project);
    groups.set(key, current);
  }

  return Array.from(groups.entries()).map(([key, items]) => {
    const sorted = [...items].sort((a, b) => timestamp(b) - timestamp(a));
    const latest = sorted[0]!;
    const latestContext = asRecord(latest.context);
    const guided = key.startsWith("guided:");
    const latestVersionNumber = guided
      ? Math.max(...sorted.map((project) => Math.max(1, Number(asRecord(project.context).guidedVideoVersion ?? 1) || 1)))
      : null;
    const explicitTitle = String(latestContext.guidedVideoTitle ?? "").trim();
    const cleanTitle = latest.title.replace(/\s*[·-]\s*V\d+\s*$/i, "").trim();
    return {
      key,
      title: explicitTitle || cleanTitle || latest.title,
      projects: sorted,
      latest,
      versionCount: sorted.length,
      latestVersionNumber,
      guided,
    };
  }).sort((a, b) => timestamp(b.latest) - timestamp(a.latest));
}

export default function VideoProjectsPanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [, navigate] = useLocation();
  const [projects, setProjects] = useState<MediaProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState("");

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/projects?limit=100`, { headers: authHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Falha ao carregar projetos");
      const list = Array.isArray(data.projects) ? data.projects as MediaProject[] : [];
      setProjects(list.filter((project) => ["video", "reel", "story", "mixed"].includes(project.kind)));
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => groupProjects(projects).slice(0, 12), [projects]);
  const counts = useMemo(() => ({
    ready: groups.filter((group) => group.latest.status === "ready").length,
    processing: groups.filter((group) => group.latest.status === "processing").length,
    draft: groups.filter((group) => group.latest.status === "draft").length,
  }), [groups]);

  const openProject = async (group: ProjectGroup) => {
    if (!tenantId || openingId) return;
    const project = group.latest;
    setOpeningId(group.key);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/projects/${project.id}`, { headers: authHeaders() });
      const data = await response.json().catch(() => ({})) as { versions?: MediaVersion[]; jobs?: MediaJob[] };
      if (!response.ok) throw new Error("Falha ao abrir projeto");
      const latestVersion = [...(data.versions ?? [])]
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
        .find((item) => item.assetId && item.operation !== "video_generate_scene");
      const latestJob = [...(data.jobs ?? [])]
        .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
        .find((item) => item.status === "done" && (item.output?.videoAssetId || item.output?.assetId));
      const assetId = latestVersion?.assetId || latestJob?.output?.videoAssetId || latestJob?.output?.assetId || "";
      if (assetId) {
        navigate(`/content-studio/video/edicao?mediaAssetId=${encodeURIComponent(assetId)}`);
      } else {
        navigate("/midias");
      }
    } catch {
      navigate("/midias");
    } finally {
      setOpeningId("");
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <div className="flex items-center gap-2"><Film className="h-4 w-4 text-primary" /><h2 className="font-semibold text-foreground">Meus projetos de vídeo</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">Cada vídeo aparece uma única vez; V1, V2, V3 ficam agrupadas dentro do mesmo projeto.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 self-start rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Atualizar
        </button>
      </div>

      <div className="grid gap-2 border-b border-border bg-muted/20 p-3 sm:grid-cols-3 sm:p-4">
        <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Prontos</p><p className="mt-1 text-xl font-semibold text-foreground">{counts.ready}</p></div>
        <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Em produção</p><p className="mt-1 text-xl font-semibold text-foreground">{counts.processing}</p></div>
        <div className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">Rascunhos</p><p className="mt-1 text-xl font-semibold text-foreground">{counts.draft}</p></div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando projetos…</div>
      ) : groups.length === 0 ? (
        <div className="px-5 py-10 text-center"><p className="text-sm font-medium text-foreground">Nenhum projeto de vídeo ainda</p><p className="mt-1 text-xs text-muted-foreground">Quando você gerar um vídeo, ele aparecerá aqui automaticamente.</p></div>
      ) : (
        <div className="divide-y divide-border">
          {groups.slice(0, 8).map((group) => {
            const project = group.latest;
            return (
              <button key={group.key} type="button" onClick={() => void openProject(group)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40 sm:px-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">{group.guided && group.versionCount > 1 ? <Layers3 className="h-4 w-4 text-primary" /> : project.status === "ready" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Clock3 className="h-4 w-4" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{group.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(project.updatedAt || project.createdAt)}{group.guided ? ` · ${group.versionCount} ${group.versionCount === 1 ? "versão" : "versões"}${group.latestVersionNumber ? ` · V${group.latestVersionNumber}` : ""}` : ` · ${project.kind}`}</p>
                </div>
                <span className={cn("hidden rounded-full border px-2 py-1 text-[10px] font-semibold sm:inline-flex", statusClass(project.status))}>{statusLabel(project.status)}</span>
                {openingId === group.key ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
