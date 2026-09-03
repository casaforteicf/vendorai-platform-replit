import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Library,
  Loader2,
  Music2,
  Save,
  Send,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

type MediaTrack = {
  id: string;
  original_filename?: string | null;
  originalFilename?: string | null;
  rights?: {
    status?: string;
    origin?: string;
  } | null;
  usage?: {
    organicAllowed?: boolean;
    paidAdsAllowed?: boolean;
    reasons?: string[];
  } | null;
};

type ComposeJob = {
  id: string;
  operation: string;
  status: string;
  progress?: number | null;
  error?: string | null;
  output?: {
    videoUrl?: string;
    videoAssetId?: string;
    assetId?: string;
  } | null;
  videoUrl?: string;
  assetId?: string;
};

type Props = {
  tenantId: string;
  sourceVideoUrl: string;
  generationId: string;
  format: "story" | "reel";
};

function storageObjectPath(rawUrl: string): string {
  try {
    const pathname = new URL(rawUrl, window.location.origin).pathname;
    if (pathname.startsWith("/api/storage")) return pathname.slice("/api/storage".length);
    if (pathname.startsWith("/objects/")) return pathname;
    return "";
  } catch {
    return "";
  }
}

function trackLabel(track: MediaTrack): string {
  return track.original_filename || track.originalFilename || `Trilha ${track.id.slice(0, 8)}`;
}

export function ProductVideoFinalizePanel({ tenantId, sourceVideoUrl, generationId, format }: Props) {
  const [tracks, setTracks] = useState<MediaTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [musicVolume, setMusicVolume] = useState(22);

  const [composeProjectId, setComposeProjectId] = useState("");
  const [composeJobId, setComposeJobId] = useState("");
  const [composeJob, setComposeJob] = useState<ComposeJob | null>(null);
  const [composeLoading, setComposeLoading] = useState(false);
  const [composeError, setComposeError] = useState("");

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [publishError, setPublishError] = useState("");

  const composedVideoUrl = composeJob?.output?.videoUrl || composeJob?.videoUrl || "";
  const finalVideoUrl = composedVideoUrl || sourceVideoUrl;
  const composeProgress = Math.max(0, Math.min(100, Number(composeJob?.progress ?? 0)));
  const composeDone = composeJob?.status === "done";
  const composeFailed = composeJob?.status === "error";

  const allowedTracks = useMemo(
    () => tracks.filter((track) => track.usage?.organicAllowed === true),
    [tracks],
  );

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    void (async () => {
      setTracksLoading(true);
      setTracksError("");
      try {
        const response = await fetch(`/api/tenants/${tenantId}/media/tracks?limit=100`, {
          headers: authHeader(),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar as trilhas");
        if (!cancelled) setTracks(Array.isArray(data.tracks) ? data.tracks : []);
      } catch (error) {
        if (!cancelled) setTracksError(error instanceof Error ? error.message : "Falha ao carregar trilhas");
      } finally {
        if (!cancelled) setTracksLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || !composeProjectId || !composeJobId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/media/projects/${composeProjectId}`, {
          headers: authHeader(),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Falha ao consultar a composição");
        const current = (Array.isArray(data.jobs) ? data.jobs : []).find(
          (item: ComposeJob) => item.id === composeJobId && item.operation === "video_compose",
        ) as ComposeJob | undefined;
        if (!cancelled && current) {
          setComposeJob(current);
          if (current.status === "done") setComposeLoading(false);
          if (current.status === "error") {
            setComposeLoading(false);
            setComposeError(current.error || "Não foi possível aplicar a trilha ao vídeo.");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setComposeLoading(false);
          setComposeError(error instanceof Error ? error.message : "Falha ao consultar composição");
        }
      }
    };

    void load();
    if (composeDone || composeFailed) return () => { cancelled = true; };
    const timer = window.setInterval(() => { void load(); }, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tenantId, composeProjectId, composeJobId, composeDone, composeFailed]);

  const useOriginalVideo = () => {
    setSelectedTrackId("");
    setComposeProjectId("");
    setComposeJobId("");
    setComposeJob(null);
    setComposeError("");
    setSaveMessage("");
    setPublishMessage("");
    setPublishError("");
  };

  const applyMusic = async () => {
    if (!selectedTrackId || composeLoading) return;
    setComposeLoading(true);
    setComposeError("");
    setSaveMessage("");
    setPublishMessage("");
    setPublishError("");
    setComposeJob(null);

    try {
      const sourceResponse = await fetch(sourceVideoUrl, { headers: authHeader() });
      if (!sourceResponse.ok) throw new Error("Não foi possível abrir o MP4 para aplicar a trilha");
      const videoBlob = await sourceResponse.blob();
      const form = new FormData();
      form.append("video", new File([videoBlob], "vendorai-reel.mp4", { type: videoBlob.type || "video/mp4" }));
      form.append("musicAssetId", selectedTrackId);
      form.append("musicVolume", String(musicVolume / 100));
      form.append("ducking", "true");
      form.append("fadeIn", "0.35");
      form.append("fadeOut", "0.6");
      form.append("brollContext", "Vídeo de produto finalizado no VendorAI; preservar produto, marca e CTA do material original.");

      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/compose`, {
        method: "POST",
        headers: authHeader(),
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível aplicar a trilha");
      setComposeProjectId(String(data.projectId || ""));
      setComposeJobId(String(data.jobId || ""));
      if (!data.projectId || !data.jobId) throw new Error("A composição não retornou um job válido");
    } catch (error) {
      setComposeLoading(false);
      setComposeError(error instanceof Error ? error.message : "Falha ao aplicar trilha");
    }
  };

  const syncFinalVideo = async (): Promise<string> => {
    const objectPath = storageObjectPath(finalVideoUrl);
    if (!objectPath) {
      throw new Error("O vídeo final não possui um caminho de armazenamento compatível para organização/publicação.");
    }
    const response = await fetch(`/api/tenants/${tenantId}/content/${generationId}/variations/0/image`, {
      method: "PATCH",
      headers: {
        ...authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ objectPath, field: "videoUrl" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Não foi possível vincular o vídeo ao conteúdo");
    return String(data.mediaUrl || finalVideoUrl);
  };

  const saveForLater = async () => {
    if (saveLoading || publishLoading) return;
    setSaveLoading(true);
    setSaveMessage("");
    setPublishError("");
    try {
      await syncFinalVideo();
      setSaveMessage("Vídeo organizado e vinculado ao conteúdo. Ele permanece na Biblioteca para publicação posterior.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Não foi possível organizar o vídeo");
    } finally {
      setSaveLoading(false);
    }
  };

  const publishNow = async () => {
    if (format !== "reel" || publishLoading || saveLoading) return;
    setPublishLoading(true);
    setPublishMessage("");
    setPublishError("");
    try {
      await syncFinalVideo();
      const response = await fetch(`/api/tenants/${tenantId}/content/${generationId}/publish-instagram`, {
        method: "POST",
        headers: {
          ...authHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ variationIndex: 0 }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível publicar o Reel no Instagram");
      setPublishMessage("Reel publicado no Instagram pelo VendorAI.");
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Falha ao publicar no Instagram");
    } finally {
      setPublishLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.045] p-4 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            Finalizar no VendorAI
          </div>
          <p className="mt-1 text-xs text-gray-400">Escolha o áudio real, aplique no MP4 e depois organize ou publique sem sair do sistema.</p>
        </div>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">
          MP4 na Biblioteca
        </span>
      </div>

      <div className="space-y-3 rounded-xl border border-white/10 bg-black/10 p-4">
        <div className="flex items-center gap-2">
          <Music2 className="h-4 w-4 text-cyan-300" />
          <div>
            <p className="text-sm font-semibold text-white">1. Áudio</p>
            <p className="text-[11px] text-gray-500">Só aparecem trilhas liberadas para uso orgânico.</p>
          </div>
        </div>

        {tracksLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando trilhas da Central de Mídias…</div>
        ) : tracksError ? (
          <p className="text-xs text-red-300">{tracksError}</p>
        ) : (
          <>
            <select
              value={selectedTrackId}
              onChange={(event) => {
                setSelectedTrackId(event.target.value);
                setComposeError("");
                setSaveMessage("");
                setPublishMessage("");
                setPublishError("");
              }}
              className="w-full rounded-xl border border-white/10 bg-[#171329] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/50"
            >
              <option value="">Sem música — manter áudio original</option>
              {allowedTracks.map((track) => (
                <option key={track.id} value={track.id}>{trackLabel(track)}</option>
              ))}
            </select>
            {allowedTracks.length === 0 && (
              <p className="text-[11px] text-amber-300">Nenhuma trilha está liberada para uso orgânico. Cadastre ou valide uma trilha na Central de Mídias.</p>
            )}
          </>
        )}

        {selectedTrackId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5" /> Volume da música</span>
              <span>{musicVolume}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={60}
              value={musicVolume}
              onChange={(event) => setMusicVolume(Number(event.target.value))}
              className="w-full accent-cyan-400"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void applyMusic()}
                disabled={composeLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-[#07131a] hover:bg-cyan-400 disabled:opacity-50"
              >
                {composeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Music2 className="h-3.5 w-3.5" />}
                {composeLoading ? "Aplicando trilha…" : "Aplicar música ao vídeo"}
              </button>
              {(composedVideoUrl || composeError) && (
                <button type="button" onClick={useOriginalVideo} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/5">
                  Usar vídeo sem música
                </button>
              )}
            </div>
          </div>
        )}

        {composeLoading && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-gray-500"><span>Compondo áudio + vídeo</span><span>{composeProgress}%</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${composeProgress}%` }} /></div>
          </div>
        )}
        {composeError && <p className="text-xs text-red-300">{composeError}</p>}
        {composeDone && composedVideoUrl && (
          <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-xs font-semibold text-emerald-200">Música aplicada. Este é o vídeo final que será salvo/publicado.</p>
            <video controls src={composedVideoUrl} className="w-full max-h-[520px] rounded-lg bg-black" />
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-white/10 bg-black/10 p-4">
        <div className="flex items-center gap-2">
          <Library className="h-4 w-4 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-white">2. Organizar ou publicar</p>
            <p className="text-[11px] text-gray-500">O VendorAI vincula o MP4 final ao conteúdo antes de qualquer publicação.</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void saveForLater()}
            disabled={saveLoading || publishLoading || (Boolean(selectedTrackId) && composeLoading)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/15 disabled:opacity-50"
          >
            {saveLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar e organizar
          </button>

          {format === "reel" ? (
            <button
              type="button"
              onClick={() => void publishNow()}
              disabled={publishLoading || saveLoading || (Boolean(selectedTrackId) && composeLoading)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 px-3 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {publishLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Publicar Reel agora
            </button>
          ) : (
            <div className="rounded-xl border border-white/10 px-3 py-2.5 text-center text-[11px] text-gray-500">
              Stories: salvar e organizar disponível. A publicação automática desta tela ainda não é usada para vídeo de Story.
            </div>
          )}
        </div>

        {saveMessage && <p className={cn("text-xs", saveMessage.startsWith("Vídeo organizado") ? "text-emerald-300" : "text-red-300")}>{saveMessage}</p>}
        {publishMessage && <p className="text-xs text-emerald-300">{publishMessage}</p>}
        {publishError && <p className="text-xs text-red-300">{publishError}</p>}
      </div>
    </div>
  );
}
