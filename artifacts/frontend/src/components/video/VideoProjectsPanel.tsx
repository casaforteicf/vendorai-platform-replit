import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, CheckCircle2, Clock3, Film, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type MediaProject = {
  id: string;
  title: string;
  kind: string;
  status: string;
  source?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type MediaVersion = {
  id: string;
  assetId?: string | null;
  createdAt?: string | null;
};

type MediaJob = {
  id: string;
  status: string;
  output?: { videoAssetId?: string; assetId?: string } | null;
  updatedAt?: string | null;
};

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
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
      const response = await fetch(`/api/tenants/${tenantId}/media/projects?limit=40`, { headers: authHeaders() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Falha ao carregar projetos");
      const list = Array.isArray(data.projects) ? data.projects as MediaProject[] : [];
      setProjects(list.filter((project) => ["video", "reel", "story", "mixed"].includes(project.kind)).slice(0, 12));
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    ready: projects.filter((project) => project.status === "ready").length,
    processing: projects.filter((project) => project.status === "processing").length,
    draft: projects.filter((project) => project.status === "draft").length,
  }), [projects]);

  const openProject = async (project: MediaProject) => {
    if (!tenantId || openingId) return;
    setOpeningId(project.id);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/projects/${project.id}`, { headers: authHeaders() });
      const data = await response.json().catch(() => ({})) as { versions?: MediaVersion[]; jobs?: MediaJob[] };
      if (!response.ok) throw new Error("Falha ao abrir projeto");
      const latestVersion = [...(data.versions ?? [])].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))).find((item) => item.assetId);
      const latestJob = [...(data.jobs ?? [])].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))).find((item) => item.status === "done" && (item.output?.videoAssetId || item.output?.assetId));
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
          <p className="mt-1 text-sm text-muted-foreground">Retome produções recentes sem precisar procurar arquivos na Biblioteca.</p>
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
      ) : projects.length === 0 ? (
        <div className="px-5 py-10 text-center"><p className="text-sm font-medium text-foreground">Nenhum projeto de vídeo ainda</p><p className="mt-1 text-xs text-muted-foreground">Quando você gerar um vídeo, ele aparecerá aqui automaticamente.</p></div>
      ) : (
        <div className="divide-y divide-border">
          {projects.slice(0, 8).map((project) => (
            <button key={project.id} type="button" onClick={() => void openProject(project)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40 sm:px-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">{project.status === "ready" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Clock3 className="h-4 w-4" />}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-foreground">{project.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatDate(project.updatedAt || project.createdAt)} · {project.kind}</p></div>
              <span className={cn("hidden rounded-full border px-2 py-1 text-[10px] font-semibold sm:inline-flex", statusClass(project.status))}>{statusLabel(project.status)}</span>
              {openingId === project.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
