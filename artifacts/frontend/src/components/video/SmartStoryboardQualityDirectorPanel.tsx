import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Gauge,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DESIGN_PLAN_KEY,
  SMART_STORYBOARD_MANIFEST_KEY,
  parseSmartDesign,
  type StoredSmartDesignPlan,
} from "./smart-storyboard";

const QUALITY_GATE_VERSION = 1;
const MIN_PUBLISH_SCORE = 85;

type Ratio = "9:16" | "4:5" | "1:1" | "16:9";

type GraphicLayer = {
  id?: string;
  type?: string;
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  fontSize?: number;
  opacity?: number;
  designRole?: string;
};

type SceneProject = {
  id: string;
  title?: string;
  context?: {
    ratio?: Ratio;
    layers?: GraphicLayer[];
    graphicDesign?: Record<string, unknown>;
  };
};

type MasterManifest = {
  version: 1;
  tenantId: string;
  createdAt: string;
  directionName: string;
  designScore: number;
  targetFormat: Ratio;
  scenes: Array<{
    sceneIndex: number;
    projectId: string;
    assetId: string;
    assetType: "image" | "video";
    mediaScore: number;
    headline: string;
    crop?: { safe?: boolean | null };
  }>;
  master?: {
    assetId: string;
    projectId: string;
    url: string;
    durationSeconds: number;
    transition?: string;
    transitionDuration?: number;
    renderedAt?: string;
  };
  audioMaster?: {
    assetId: string;
    url: string;
    renderedAt: string;
    musicAssetId?: string | null;
    extraAssetId?: string | null;
    voiceAssetId?: string | null;
    direction?: string;
    loudnessTarget?: number;
  };
  qualityGate?: CreativeQualityGate;
  [key: string]: unknown;
};

type VideoProbe = {
  width: number;
  height: number;
  duration: number;
};

type QualityMetric = {
  id: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
  status: "pass" | "warn" | "fail";
};

type CreativeQualityGate = {
  version: number;
  checkedAt: string;
  assetId: string;
  projectId: string;
  score: number;
  minimumScore: number;
  publishReady: boolean;
  targetFormat: Ratio;
  channel: string;
  metrics: QualityMetric[];
  blockers: string[];
  warnings: string[];
  technical: VideoProbe | null;
};

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function mediaUrl(raw: string): string {
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || raw.startsWith("blob:")) return raw;
  if (raw.startsWith("/api/")) return raw;
  if (raw.startsWith("/objects/")) return `/api/storage${raw}`;
  return raw;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function normalized(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function metric(id: string, label: string, score: number, weight: number, detail: string): QualityMetric {
  const rounded = Math.round(clamp(score));
  return {
    id,
    label,
    score: rounded,
    weight,
    detail,
    status: rounded >= 85 ? "pass" : rounded >= 65 ? "warn" : "fail",
  };
}

function expectedDimensions(format: Ratio) {
  if (format === "16:9") return { width: 1280, height: 720 };
  if (format === "4:5") return { width: 864, height: 1080 };
  if (format === "1:1") return { width: 1080, height: 1080 };
  return { width: 720, height: 1280 };
}

function allowedFormats(channel: string): Ratio[] {
  const key = normalized(channel);
  if (key.includes("reels") || key.includes("tiktok") || key.includes("shorts") || key.includes("stories") || key.includes("story")) return ["9:16"];
  if (key.includes("youtube")) return ["16:9", "9:16"];
  if (key.includes("instagram") && (key.includes("feed") || key.includes("post"))) return ["4:5", "1:1"];
  if (key.includes("linkedin")) return ["1:1", "4:5", "16:9"];
  if (key.includes("facebook")) return ["1:1", "4:5", "16:9", "9:16"];
  return ["9:16", "4:5", "1:1", "16:9"];
}

function durationScore(channel: string, duration: number) {
  const key = normalized(channel);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (key.includes("reels") || key.includes("tiktok") || key.includes("shorts")) {
    if (duration >= 8 && duration <= 60) return 100;
    if (duration >= 4 && duration <= 90) return 82;
    return 55;
  }
  if (key.includes("stories") || key.includes("story")) {
    if (duration >= 4 && duration <= 60) return 100;
    if (duration <= 90) return 75;
    return 50;
  }
  if (key.includes("youtube")) {
    if (duration >= 10 && duration <= 180) return 100;
    if (duration <= 300) return 80;
    return 60;
  }
  if (duration >= 5 && duration <= 120) return 100;
  if (duration <= 180) return 80;
  return 60;
}

function textReadabilityScore(projects: SceneProject[], safeArea: number, warnings: string[], blockers: string[]) {
  let score = 100;
  let textCount = 0;
  let unsafeCount = 0;

  for (const project of projects) {
    const layers = project.context?.layers ?? [];
    for (const layer of layers) {
      if (layer.type !== "text") continue;
      textCount += 1;
      const role = normalized(layer.designRole);
      const fontSize = Number(layer.fontSize ?? 0);
      const opacity = Number(layer.opacity ?? 1);
      const x = Number(layer.x ?? 0);
      const y = Number(layer.y ?? 0);
      const width = Number(layer.width ?? 0);
      const text = String(layer.text ?? "").trim();
      const minimum = role === "headline" ? 34 : role === "cta" ? 22 : 20;
      if (fontSize > 0 && fontSize < minimum) score -= role === "headline" ? 10 : 6;
      if (opacity < 0.78) score -= 7;
      if (text.length > (role === "headline" ? 90 : role === "cta" ? 55 : 220)) score -= 6;
      const outside = x < Math.max(0, safeArea - 2) || x + width > Math.min(100, 100 - safeArea + 2) || y < Math.max(0, safeArea - 3) || y > 96;
      if (outside && role !== "media") {
        unsafeCount += 1;
        score -= 8;
      }
    }
  }

  if (!textCount) {
    warnings.push("Nenhuma layer de texto foi encontrada nas pranchetas; legibilidade não pôde ser validada integralmente.");
    return 70;
  }
  if (unsafeCount > Math.max(1, Math.floor(textCount * 0.25))) {
    blockers.push("Muitos textos estão fora da área segura do formato final.");
  } else if (unsafeCount > 0) {
    warnings.push(`${unsafeCount} elemento(s) de texto estão próximos ou fora da área segura.`);
  }
  return clamp(score);
}

function compositionScore(manifest: MasterManifest, projects: SceneProject[], warnings: string[]) {
  const mediaScores = manifest.scenes.map((scene) => Number(scene.mediaScore ?? 0)).filter(Number.isFinite);
  const mediaAverage = mediaScores.length ? mediaScores.reduce((sum, value) => sum + value, 0) / mediaScores.length : 65;
  const unsafeCrops = manifest.scenes.filter((scene) => scene.crop?.safe === false).length;
  const missingProjects = Math.max(0, manifest.scenes.length - projects.length);
  let score = mediaAverage * 0.72 + 28;
  score -= unsafeCrops * 8;
  score -= missingProjects * 15;
  if (unsafeCrops) warnings.push(`${unsafeCrops} cena(s) usam crop marcado como não seguro pelo Media Intelligence.`);
  if (missingProjects) warnings.push(`${missingProjects} prancheta(s) não puderam ser inspecionadas.`);
  return clamp(score);
}

function brandScore(projects: SceneProject[], warnings: string[]) {
  if (!projects.length) return 60;
  const branded = projects.filter((project) => (project.context?.layers ?? []).some((layer) => normalized(layer.designRole) === "brand")).length;
  if (branded === projects.length) return 100;
  if (branded > 0) {
    warnings.push(`A marca aparece em ${branded}/${projects.length} cenas; considere consistência maior quando o formato pedir presença contínua.`);
    return 82;
  }
  warnings.push("Nenhuma layer de marca/logo foi encontrada no storyboard final.");
  return 68;
}

function ctaScore(design: StoredSmartDesignPlan | null, projects: SceneProject[], blockers: string[], warnings: string[]) {
  const expected = String(design?.brief?.cta ?? "").trim();
  if (!expected) {
    warnings.push("O briefing não definiu CTA; a peça pode publicar, mas perde força de conversão.");
    return 82;
  }
  const last = projects.at(-1);
  const ctaLayers = (last?.context?.layers ?? []).filter((layer) => normalized(layer.designRole) === "cta");
  const found = ctaLayers.some((layer) => normalized(layer.text).includes(normalized(expected)) || normalized(expected).includes(normalized(layer.text)));
  if (found) return 100;
  if (ctaLayers.length) {
    warnings.push("Existe CTA visual, mas o texto diverge do CTA aprovado no briefing.");
    return 72;
  }
  blockers.push("O CTA aprovado no briefing não está presente na cena final.");
  return 45;
}

async function probeVideo(rawUrl: string): Promise<VideoProbe | null> {
  if (!rawUrl || typeof document === "undefined") return null;
  let objectUrl = "";
  try {
    const url = mediaUrl(rawUrl);
    let source = url;
    if (url.startsWith("/api/")) {
      const response = await fetch(url, { headers: authHeaders() });
      if (!response.ok) return null;
      objectUrl = URL.createObjectURL(await response.blob());
      source = objectUrl;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.playsInline = true;
    video.src = source;
    await new Promise<void>((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error("metadata")); };
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", done);
        video.removeEventListener("error", fail);
      };
      video.addEventListener("loadedmetadata", done);
      video.addEventListener("error", fail);
      video.load();
    });
    return {
      width: Number(video.videoWidth || 0),
      height: Number(video.videoHeight || 0),
      duration: Number(video.duration || 0),
    };
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function parseManifest(tenantId: string): MasterManifest | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SMART_STORYBOARD_MANIFEST_KEY) ?? "null") as MasterManifest | null;
    return parsed?.tenantId === tenantId ? parsed : null;
  } catch {
    return null;
  }
}

export default function SmartStoryboardQualityDirectorPanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [manifest, setManifest] = useState<MasterManifest | null>(null);
  const [design, setDesign] = useState<StoredSmartDesignPlan | null>(null);
  const [projects, setProjects] = useState<SceneProject[]>([]);
  const [gate, setGate] = useState<CreativeQualityGate | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("Aguardando QA final");

  const refreshStored = useCallback(() => {
    if (!tenantId) return;
    const nextManifest = parseManifest(tenantId);
    setManifest(nextManifest);
    setGate(nextManifest?.qualityGate ?? null);
    setDesign(parseSmartDesign(sessionStorage.getItem(DESIGN_PLAN_KEY), tenantId));
  }, [tenantId]);

  useEffect(() => {
    refreshStored();
    const timer = window.setInterval(refreshStored, 1500);
    return () => window.clearInterval(timer);
  }, [refreshStored]);

  const finalAssetId = manifest?.audioMaster?.assetId || manifest?.master?.assetId || "";
  const finalUrl = manifest?.audioMaster?.url || manifest?.master?.url || "";

  const loadProjects = useCallback(async (sourceManifest: MasterManifest) => {
    const rows = await Promise.all(sourceManifest.scenes.map(async (scene) => {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/media/projects/${scene.projectId}`, { headers: authHeaders(), cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.project) return null;
        return data.project as SceneProject;
      } catch {
        return null;
      }
    }));
    const valid = rows.filter((row): row is SceneProject => Boolean(row));
    setProjects(valid);
    return valid;
  }, [tenantId]);

  const analyze = useCallback(async () => {
    if (!tenantId || loading) return;
    const sourceManifest = parseManifest(tenantId);
    if (!sourceManifest?.master) {
      toast({ title: "Master ainda não existe", description: "Crie o Master do storyboard antes de executar o QA final." });
      return;
    }
    const sourceDesign = parseSmartDesign(sessionStorage.getItem(DESIGN_PLAN_KEY), tenantId);
    setManifest(sourceManifest);
    setDesign(sourceDesign);
    setLoading(true);
    setStage("Inspecionando pranchetas, formato e áudio…");
    try {
      const sceneProjects = await loadProjects(sourceManifest);
      const blockers: string[] = [];
      const warnings: string[] = [];
      const channel = String(sourceDesign?.brief?.channel ?? "Canal não informado");
      const safeArea = Number(sourceDesign?.plan?.safeAreaPct ?? 7);
      const metrics: QualityMetric[] = [];

      const designScore = Number(sourceManifest.designScore ?? sourceDesign?.plan?.overallScore ?? 0);
      if (!sourceDesign?.plan?.approved || designScore < 82) blockers.push("Direção gráfica abaixo do gate mínimo de 82/100 ou ainda não aprovada.");
      const designWarnings = sourceDesign?.plan?.warnings?.length ?? 0;
      metrics.push(metric("design", "Design", designScore - Math.min(10, designWarnings * 2), 16, `Design Score ${Math.round(designScore)}/100${designWarnings ? ` · ${designWarnings} alerta(s)` : " · direção aprovada"}`));

      const legibility = textReadabilityScore(sceneProjects, safeArea, warnings, blockers);
      metrics.push(metric("legibility", "Legibilidade", legibility, 12, `Tipografia, opacidade, densidade e safe area em ${sceneProjects.length} prancheta(s).`));

      const composition = compositionScore(sourceManifest, sceneProjects, warnings);
      metrics.push(metric("composition", "Enquadramento", composition, 12, "Media score, Smart Crop e disponibilidade das pranchetas."));

      const brand = brandScore(sceneProjects, warnings);
      metrics.push(metric("brand", "Marca", brand, 8, "Presença de logo/marca nas composições finais."));

      const cta = ctaScore(sourceDesign, sceneProjects, blockers, warnings);
      metrics.push(metric("cta", "CTA", cta, 8, "Confere o CTA aprovado com a última cena do storyboard."));

      const allowed = allowedFormats(channel);
      const projectFormats = sceneProjects.map((project) => project.context?.ratio).filter(Boolean) as Ratio[];
      const formatMismatch = projectFormats.some((format) => format !== sourceManifest.targetFormat);
      const channelMismatch = !allowed.includes(sourceManifest.targetFormat);
      let formatScore = 100;
      if (formatMismatch) {
        formatScore -= 40;
        blockers.push("Há pranchetas com proporção diferente do formato aprovado do storyboard.");
      }
      if (channelMismatch) {
        formatScore -= 35;
        blockers.push(`O formato ${sourceManifest.targetFormat} não é o formato principal recomendado para ${channel}.`);
      }
      metrics.push(metric("format", "Formato do canal", formatScore, 10, `${sourceManifest.targetFormat} · ${channel}`));

      const duration = Number(sourceManifest.audioMaster ? sourceManifest.master.durationSeconds : sourceManifest.master.durationSeconds);
      const durationQuality = durationScore(channel, duration);
      if (durationQuality < 65) warnings.push(`A duração de ${duration.toFixed(1)}s está fora da faixa recomendada para ${channel}.`);
      metrics.push(metric("duration", "Duração", durationQuality, 7, `${duration.toFixed(1)}s no Master final.`));

      let audioScore = 20;
      if (sourceManifest.audioMaster) {
        audioScore = 82;
        const loudness = Number(sourceManifest.audioMaster.loudnessTarget);
        if (Number.isFinite(loudness) && loudness >= -16 && loudness <= -12) audioScore = 100;
        else warnings.push("O Master audiovisual existe, mas o alvo de loudness não está confirmado entre -16 e -12 LUFS.");
      } else {
        blockers.push("A finalização audiovisual ainda não foi executada pelo Audio Director.");
      }
      metrics.push(metric("audio", "Áudio / loudness", audioScore, 10, sourceManifest.audioMaster ? `Master audiovisual · alvo ${sourceManifest.audioMaster.loudnessTarget ?? "?"} LUFS` : "Sem Master audiovisual final"));

      const scriptLength = (sourceDesign?.plan?.scenes ?? []).reduce((sum, scene) => sum + String(scene.headline ?? "").length + String(scene.supportingText ?? "").length + String(scene.cta ?? "").length, 0);
      let voiceScore = 92;
      if (sourceManifest.audioMaster?.voiceAssetId) voiceScore = 100;
      else if (scriptLength > 40) {
        voiceScore = 72;
        warnings.push("Há roteiro suficiente para locução, mas nenhuma voz foi registrada no Master audiovisual. Isso pode ser intencional.");
      }
      metrics.push(metric("voice", "Locução", voiceScore, 7, sourceManifest.audioMaster?.voiceAssetId ? "Voz autorizada presente no Master." : "Sem locução registrada no Master."));

      let transitionScore = 100;
      if (sourceManifest.scenes.length > 1) {
        const transition = String(sourceManifest.master.transition ?? "");
        const transitionDuration = Number(sourceManifest.master.transitionDuration ?? 0);
        if (!transition) transitionScore = 55;
        else if (transition !== "cut" && (transitionDuration < 0.15 || transitionDuration > 1.6)) transitionScore = 72;
      }
      metrics.push(metric("transition", "Transições", transitionScore, 5, `${sourceManifest.master.transition ?? "não informada"}${sourceManifest.master.transition !== "cut" ? ` · ${Number(sourceManifest.master.transitionDuration ?? 0).toFixed(2)}s` : ""}`));

      setStage("Validando arquivo final…");
      const probe = await probeVideo(sourceManifest.audioMaster?.url || sourceManifest.master.url);
      let technicalScore = 100;
      const expected = expectedDimensions(sourceManifest.targetFormat);
      if (!finalAssetId || !finalUrl) {
        technicalScore = 0;
        blockers.push("O arquivo final não possui assetId/URL persistido na Biblioteca.");
      } else if (!probe) {
        technicalScore = 72;
        warnings.push("O navegador não conseguiu abrir os metadados técnicos do arquivo final; asset e URL existem, mas resolução não foi confirmada.");
      } else {
        const ratioExpected = expected.width / expected.height;
        const ratioActual = probe.width / Math.max(1, probe.height);
        if (Math.abs(ratioExpected - ratioActual) > 0.03) {
          technicalScore -= 45;
          blockers.push("A proporção real do arquivo final difere do formato aprovado.");
        }
        if (probe.width < Math.min(expected.width, 720) || probe.height < Math.min(expected.height, 720)) {
          technicalScore -= 25;
          warnings.push(`Resolução final baixa (${probe.width}×${probe.height}).`);
        }
        if (Math.abs(probe.duration - duration) > 2.5) {
          technicalScore -= 15;
          warnings.push("A duração do arquivo final diverge do Master registrado.");
        }
      }
      metrics.push(metric("technical", "Arquivo final", technicalScore, 5, probe ? `${probe.width}×${probe.height} · ${probe.duration.toFixed(1)}s` : "Asset persistido; probe técnico indisponível"));

      const totalWeight = metrics.reduce((sum, item) => sum + item.weight, 0);
      const score = Math.round(metrics.reduce((sum, item) => sum + item.score * item.weight, 0) / Math.max(1, totalWeight));
      for (const item of metrics) {
        if (["design", "legibility", "format", "audio", "technical"].includes(item.id) && item.score < 60) {
          blockers.push(`${item.label} ficou abaixo de 60/100.`);
        }
      }
      const uniqueBlockers = Array.from(new Set(blockers));
      const uniqueWarnings = Array.from(new Set(warnings));
      const publishReady = score >= MIN_PUBLISH_SCORE && uniqueBlockers.length === 0;
      const nextGate: CreativeQualityGate = {
        version: QUALITY_GATE_VERSION,
        checkedAt: new Date().toISOString(),
        assetId: finalAssetId,
        projectId: sourceManifest.master.projectId,
        score,
        minimumScore: MIN_PUBLISH_SCORE,
        publishReady,
        targetFormat: sourceManifest.targetFormat,
        channel,
        metrics,
        blockers: uniqueBlockers,
        warnings: uniqueWarnings,
        technical: probe,
      };

      const nextManifest: MasterManifest = { ...sourceManifest, qualityGate: nextGate };
      sessionStorage.setItem(SMART_STORYBOARD_MANIFEST_KEY, JSON.stringify(nextManifest));
      setManifest(nextManifest);
      setGate(nextGate);

      if (finalAssetId) {
        await fetch(`/api/tenants/${tenantId}/media/assets/${finalAssetId}`, {
          method: "PATCH",
          headers: authHeaders(true),
          body: JSON.stringify({ metadata: { creativeQualityGate: nextGate, publishReady, qualityScore: score, qualityCheckedAt: nextGate.checkedAt } }),
        }).catch(() => undefined);
      }

      if (sourceManifest.master.projectId) {
        const projectRes = await fetch(`/api/tenants/${tenantId}/media/projects/${sourceManifest.master.projectId}`, { headers: authHeaders(), cache: "no-store" });
        const projectData = await projectRes.json().catch(() => ({}));
        const currentContext = projectData?.project?.context && typeof projectData.project.context === "object" ? projectData.project.context : {};
        await fetch(`/api/tenants/${tenantId}/media/projects/${sourceManifest.master.projectId}`, {
          method: "PATCH",
          headers: authHeaders(true),
          body: JSON.stringify({ context: { ...currentContext, qualityDirector: nextGate, publishReady } }),
        }).catch(() => undefined);
      }

      setStage(publishReady ? "QA aprovado · pronto para publicação" : "QA bloqueou a publicação");
      toast({
        title: publishReady ? "Creative Quality aprovado" : "Creative Quality requer correções",
        description: publishReady ? `Score ${score}/100. O Master atingiu o padrão mínimo de publicação.` : `Score ${score}/100 · ${uniqueBlockers.length} bloqueio(s). Corrija e execute o QA novamente.`,
        variant: publishReady ? "default" : "destructive",
      });
    } catch (error) {
      setStage("QA final não concluído");
      toast({ title: "Quality Director não concluiu a análise", description: error instanceof Error ? error.message : "Falha desconhecida", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [finalAssetId, finalUrl, loadProjects, loading, tenantId, toast]);

  const summary = useMemo(() => {
    if (!gate) return { pass: 0, warn: 0, fail: 0 };
    return gate.metrics.reduce((acc, item) => {
      acc[item.status] += 1;
      return acc;
    }, { pass: 0, warn: 0, fail: 0 });
  }, [gate]);

  if (!tenantId || !manifest?.master) return null;

  return (
    <section className={cn("overflow-hidden rounded-3xl border bg-card shadow-sm", gate?.publishReady ? "border-emerald-500/25" : gate ? "border-amber-500/25" : "border-sky-500/20")} data-testid="smart-storyboard-quality-director">
      <div className={cn("border-b border-border px-4 py-4 sm:px-5", gate?.publishReady ? "bg-gradient-to-r from-emerald-500/[0.09] via-card to-card" : "bg-gradient-to-r from-sky-500/[0.08] via-card to-card")}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-3">
            <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl", gate?.publishReady ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "bg-sky-500/10 text-sky-600 dark:text-sky-300")}>
              {gate?.publishReady ? <ShieldCheck className="h-5 w-5" /> : gate ? <ShieldX className="h-5 w-5" /> : <Gauge className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-foreground">Creative Quality Director</h2>
                <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", gate?.publishReady ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : gate ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300")}>
                  {gate?.publishReady ? "APROVADO" : gate ? "BLOQUEADO" : "QA FINAL"}
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">Audita o Master final antes da publicação: direção visual, legibilidade, enquadramento, marca, CTA, formato do canal, duração, áudio/loudness, locução, transições e integridade técnica. O resultado fica gravado no asset e no projeto.</p>
            </div>
          </div>
          <button type="button" onClick={() => void analyze()} disabled={loading} className={cn("inline-flex h-10 items-center gap-2 self-start rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-40", gate?.publishReady ? "bg-emerald-600 hover:bg-emerald-500" : "bg-sky-600 hover:bg-sky-500")}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : gate ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {loading ? stage : gate ? "Executar QA novamente" : "Executar QA final"}
          </button>
        </div>
      </div>

      {gate ? (
        <div className="p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className={cn("rounded-2xl border p-4", gate.publishReady ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-amber-500/25 bg-amber-500/[0.06]")}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Creative Quality Score</div>
              <div className="mt-2 flex items-end gap-2"><span className="text-5xl font-bold tracking-tight text-foreground">{gate.score}</span><span className="pb-1 text-sm font-semibold text-muted-foreground">/100</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", gate.publishReady ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${gate.score}%` }} /></div>
              <p className="mt-2 text-xs text-muted-foreground">Mínimo para liberar: {gate.minimumScore}/100.</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px]"><span className="rounded-full bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-700 dark:text-emerald-300">{summary.pass} aprovados</span><span className="rounded-full bg-amber-500/10 px-2 py-1 font-semibold text-amber-700 dark:text-amber-300">{summary.warn} alertas</span><span className="rounded-full bg-red-500/10 px-2 py-1 font-semibold text-red-700 dark:text-red-300">{summary.fail} falhas</span></div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {gate.metrics.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border bg-background/55 p-3">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-foreground">{item.label}</span>{item.status === "pass" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : item.status === "warn" ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <ShieldX className="h-4 w-4 text-red-500" />}</div>
                  <div className="mt-2 flex items-baseline gap-1"><span className="text-xl font-bold text-foreground">{item.score}</span><span className="text-[10px] text-muted-foreground">/100 · peso {item.weight}%</span></div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {(gate.blockers.length > 0 || gate.warnings.length > 0) && (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className={cn("rounded-2xl border p-3", gate.blockers.length ? "border-red-500/25 bg-red-500/[0.05]" : "border-emerald-500/20 bg-emerald-500/[0.04]")}>
                <div className="flex items-center gap-2 text-xs font-semibold">{gate.blockers.length ? <ShieldX className="h-4 w-4 text-red-500" /> : <BadgeCheck className="h-4 w-4 text-emerald-500" />}Bloqueios de publicação</div>
                {gate.blockers.length ? <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">{gate.blockers.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">Nenhum bloqueio crítico encontrado.</p>}
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
                <div className="flex items-center gap-2 text-xs font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" />Alertas de melhoria</div>
                {gate.warnings.length ? <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">{gate.warnings.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">Sem alertas adicionais.</p>}
              </div>
            </div>
          )}

          <div className={cn("mt-4 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between", gate.publishReady ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-red-500/25 bg-red-500/[0.05]")}>
            <div>
              <div className={cn("flex items-center gap-2 text-sm font-semibold", gate.publishReady ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>{gate.publishReady ? <ShieldCheck className="h-4 w-4" /> : <ShieldX className="h-4 w-4" />}{gate.publishReady ? "Liberado para publicação" : "Publicação bloqueada pelo Quality Gate"}</div>
              <p className="mt-1 text-xs text-muted-foreground">{gate.publishReady ? "O asset final recebeu publishReady=true e o relatório de QA foi persistido no projeto." : "O asset final recebeu publishReady=false. Corrija os bloqueios, gere a nova versão necessária e execute o QA novamente."}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Volume2 className="h-4 w-4" />{gate.technical ? `${gate.technical.width}×${gate.technical.height} · ${gate.technical.duration.toFixed(1)}s` : `${gate.targetFormat} · ${gate.channel}`}</div>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-5">
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] p-4 text-sm text-muted-foreground"><ShieldCheck className="mr-2 inline h-4 w-4 text-sky-500" />O Master existe. Execute o QA final depois da finalização audiovisual para gerar o Creative Quality Score e registrar a decisão de publicação.</div>
        </div>
      )}
    </section>
  );
}
