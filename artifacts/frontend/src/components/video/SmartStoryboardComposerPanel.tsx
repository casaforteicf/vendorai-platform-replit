import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Film, Layers3, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { assetLabel, assetUrl, type ProfessionalMediaAsset } from "./professional-video";
import {
  CREATIVE_FONT_KEY,
  DESIGN_PLAN_KEY,
  SMART_STORYBOARD_MANIFEST_KEY,
  buildSmartSceneProject,
  parseSmartDesign,
  type SmartStoryboardManifest,
  type StoredSmartDesignPlan,
} from "./smart-storyboard";

type BusinessProfile = { logoUrl?: string | null };

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export default function SmartStoryboardComposerPanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [stored, setStored] = useState<StoredSmartDesignPlan | null>(null);
  const [assets, setAssets] = useState<ProfessionalMediaAsset[]>([]);
  const [logoUrl, setLogoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState(0);

  const refreshStored = useCallback(() => {
    if (!tenantId) return;
    setStored(parseSmartDesign(sessionStorage.getItem(DESIGN_PLAN_KEY), tenantId));
  }, [tenantId]);

  useEffect(() => {
    refreshStored();
    const timer = window.setInterval(refreshStored, 900);
    return () => window.clearInterval(timer);
  }, [refreshStored]);

  const mediaPlan = stored?.mediaAutocomposition ?? null;

  const load = useCallback(async () => {
    if (!tenantId || !mediaPlan?.scenes.length) return;
    setLoading(true);
    try {
      const [imagesRes, videosRes, profileRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=300`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=180`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/business-profile`, { headers: authHeaders() }),
      ]);
      const [imagesData, videosData, profileData] = await Promise.all([
        imagesRes.json().catch(() => ({})),
        videosRes.json().catch(() => ({})),
        profileRes.json().catch(() => ({})),
      ]);
      const rows = [imagesData, videosData].flatMap((data) => Array.isArray(data.assets) ? data.assets as ProfessionalMediaAsset[] : []);
      const wanted = new Set(mediaPlan.scenes.map((scene) => scene.assetId));
      setAssets(Array.from(new Map(rows.filter((asset) => wanted.has(asset.id) && Boolean(assetUrl(asset))).map((asset) => [asset.id, asset])).values()));
      if (profileRes.ok) setLogoUrl(String((profileData as BusinessProfile)?.logoUrl ?? ""));
    } catch (error) {
      toast({ title: "Não foi possível preparar o storyboard", description: error instanceof Error ? error.message : "Falha ao carregar mídias", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [mediaPlan, tenantId, toast]);

  useEffect(() => { void load(); }, [load]);

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const coveredScenes = mediaPlan?.scenes.filter((scene) => assetById.has(scene.assetId)).length ?? 0;
  const sceneCount = stored?.plan.scenes.length ?? 0;
  const ready = Boolean(stored && mediaPlan && mediaPlan.scenes.length === sceneCount && coveredScenes === sceneCount && sceneCount > 0);

  const createStoryboard = async () => {
    if (!tenantId || !stored || !mediaPlan || creating || !ready) return;
    setCreating(true);
    setProgress(0);
    try {
      const manifestScenes: SmartStoryboardManifest["scenes"] = [];
      for (let index = 0; index < stored.plan.scenes.length; index += 1) {
        const media = mediaPlan.scenes.find((item) => item.sceneIndex === index) ?? mediaPlan.scenes[index];
        if (!media) throw new Error(`Cena ${index + 1} ainda não possui seleção inteligente de mídia`);
        const asset = assetById.get(media.assetId);
        if (!asset) throw new Error(`A mídia da cena ${index + 1} não está mais disponível na Biblioteca`);
        const project = buildSmartSceneProject({ stored, sceneIndex: index, asset, media, logoUrl });
        const response = await fetch(`/api/tenants/${tenantId}/media/projects`, {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({
            title: project.title,
            kind: "video",
            source: "smart_storyboard_scene",
            context: project.context,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.project?.id) throw new Error(data?.error ?? `Não foi possível criar a cena ${index + 1}`);
        manifestScenes.push({
          sceneIndex: index,
          projectId: String(data.project.id),
          assetId: asset.id,
          assetType: asset.type === "video" ? "video" : "image",
          mediaScore: media.score,
          headline: stored.plan.scenes[index]?.headline ?? `Cena ${index + 1}`,
          crop: media.crop,
        });
        setProgress(Math.round(((index + 1) / stored.plan.scenes.length) * 100));
      }

      const manifest: SmartStoryboardManifest = {
        version: 1,
        tenantId,
        createdAt: new Date().toISOString(),
        directionName: stored.plan.directionName,
        designScore: stored.plan.overallScore,
        targetFormat: stored.plan.format,
        scenes: manifestScenes,
      };
      sessionStorage.setItem(SMART_STORYBOARD_MANIFEST_KEY, JSON.stringify(manifest));
      localStorage.setItem(CREATIVE_FONT_KEY, stored.plan.typography.headingFamily);
      toast({
        title: "Storyboard profissional criado",
        description: `${manifestScenes.length} cenas independentes foram montadas com mídia, foco, crop e layout próprios.`,
      });
      const first = manifestScenes[0];
      if (first) navigate(`/content-studio/video/edicao?projectId=${encodeURIComponent(first.projectId)}&from=smart-storyboard&scene=1`);
    } catch (error) {
      toast({ title: "Falha ao criar o storyboard", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  if (!stored) return null;

  return (
    <section className="rounded-3xl border border-fuchsia-500/20 bg-gradient-to-r from-fuchsia-500/[0.07] via-card to-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300"><Layers3 className="h-5 w-5" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-foreground">Storyboard multi-cena</p><span className="rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700 dark:text-fuchsia-300">{stored.plan.format}</span></div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">Transforma toda a direção aprovada em pranchetas separadas. Cada cena mantém sua própria mídia, crop, ponto focal e layers, evitando sobreposição entre cenas no Canvas.</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
              <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">Design {stored.plan.overallScore}/100</span>
              <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">{sceneCount} cenas</span>
              <span className={cn("rounded-full px-2 py-1", coveredScenes === sceneCount && sceneCount > 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300")}>{coveredScenes}/{sceneCount} mídias prontas</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <button type="button" onClick={() => void load()} disabled={loading || creating || !mediaPlan} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Atualizar</button>
          <button type="button" onClick={() => void createStoryboard()} disabled={!ready || creating || loading} className="inline-flex h-10 items-center gap-2 rounded-xl bg-fuchsia-600 px-4 text-sm font-semibold text-white transition hover:bg-fuchsia-500 disabled:opacity-40">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{creating ? `Criando ${progress}%` : "Montar storyboard completo"}<ArrowRight className="h-4 w-4" /></button>
        </div>
      </div>

      {mediaPlan?.scenes.length ? (
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {stored.plan.scenes.map((scene, index) => {
            const media = mediaPlan.scenes.find((item) => item.sceneIndex === index) ?? mediaPlan.scenes[index];
            const asset = media ? assetById.get(media.assetId) : null;
            return (
              <div key={`${scene.sceneIndex}-${index}`} className="rounded-2xl border border-border bg-background/55 p-3">
                <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cena {index + 1}</span>{asset ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Film className="h-3.5 w-3.5 text-amber-500" />}</div>
                <p className="mt-1 line-clamp-2 text-xs font-semibold text-foreground">{scene.headline}</p>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">{asset ? assetLabel(asset) : media ? "Carregando mídia selecionada…" : "Aguardando Auto Compose"}</p>
                {media && <div className="mt-2 flex items-center justify-between text-[10px]"><span className="text-fuchsia-700 dark:text-fuchsia-300">Match {media.score}/100</span><span className="text-muted-foreground">Foco {Math.round(media.crop.x)}×{Math.round(media.crop.y)}</span></div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">Primeiro conclua o Smart Media → Smart Crop para o sistema definir a mídia de cada cena.</div>
      )}
    </section>
  );
}
