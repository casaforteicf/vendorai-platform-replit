import { VendorBackButton } from "@/components/ui/back-button";
import { useEffect, useMemo, useState } from "react";
import { Clapperboard, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

type MediaJob = {
  id?: string;
  status?: string;
  output?: Record<string, unknown> | null;
  videoUrl?: string | null;
  error?: string | null;
};

type MediaProjectResponse = {
  project?: {
    id?: string;
    title?: string;
    name?: string;
    status?: string;
    context?: Record<string, unknown> | null;
    updatedAt?: string;
  };
  jobs?: MediaJob[];
};

function extractVideoUrl(job?: MediaJob | null) {
  if (!job) return "";
  if (typeof job.videoUrl === "string" && job.videoUrl) return job.videoUrl;
  const output = job.output ?? {};
  for (const key of ["videoUrl", "url", "assetUrl", "mediaUrl"]) {
    const value = output[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

export default function VideoProjectDirectPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const tenantId = params.get("tenantId")?.trim() ?? "";
  const projectId = params.get("projectId")?.trim() ?? "";
  const [data, setData] = useState<MediaProjectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    if (!tenantId || !projectId) {
      setError("Link incompleto: tenantId e projectId são obrigatórios.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("vendorai_token");
      const response = await fetch(
        `/api/tenants/${encodeURIComponent(tenantId)}/media/projects/${encodeURIComponent(projectId)}`,
        {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      const body = await response.json().catch(() => ({})) as MediaProjectResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || `Falha ao carregar projeto (${response.status})`);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar projeto.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [tenantId, projectId]);

  const project = data?.project;
  const jobs = data?.jobs ?? [];
  const latestJob = jobs[0] ?? null;
  const videoUrl = extractVideoUrl(latestJob);
  const title = project?.title || project?.name || "Projeto de vídeo";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <VendorBackButton to="/content-studio/video" label="Voltar ao Video Studio" />
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <section className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Clapperboard className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
            <p className="mt-1 break-all text-xs text-muted-foreground">Projeto: {projectId}</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">Tenant: {tenantId}</p>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="rounded-3xl border bg-card p-8 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Carregando projeto…</p>
        </section>
      ) : error ? (
        <section className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5">
          <p className="font-medium text-destructive">Não foi possível abrir o projeto</p>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Usuário atual: {user?.email ?? "não identificado"} · perfil {user?.platformRole ?? "desconhecido"}
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Status do projeto</p>
              <p className="mt-1 font-semibold">{project?.status || "—"}</p>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Jobs</p>
              <p className="mt-1 font-semibold">{jobs.length}</p>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Último processamento</p>
              <p className="mt-1 font-semibold">{latestJob?.status || "—"}</p>
            </div>
          </section>

          {latestJob?.error ? (
            <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="font-medium text-destructive">Erro do processamento</p>
              <p className="mt-2 text-sm text-muted-foreground">{latestJob.error}</p>
            </section>
          ) : null}

          {videoUrl ? (
            <section className="overflow-hidden rounded-3xl border bg-black">
              <video src={videoUrl} controls playsInline className="aspect-video w-full bg-black" />
              <div className="bg-card p-3">
                <a href={videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                  Abrir vídeo <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </section>
          ) : (
            <section className="rounded-3xl border bg-card p-6">
              <p className="font-medium">Vídeo ainda não disponível para reprodução</p>
              <p className="mt-2 text-sm text-muted-foreground">
                O projeto foi localizado. Quando o job finalizar e devolver a URL do vídeo, ela aparecerá aqui automaticamente ao tocar em Atualizar.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
