import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Frame,
  Gauge,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Type,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  GRAPHIC_DIRECTIONS,
  GRAPHIC_LAYOUTS,
  buildGraphicDesignPlan,
  graphicDirection,
  graphicFormatForChannel,
  type GraphicDesignPlan,
  type GraphicDirectionId,
  type GraphicLayoutId,
} from "@workspace/vendor-brain/graphic-design-director";
import { assetLabel, assetUrl, type ProfessionalMediaAsset } from "./professional-video";

const DESIGN_PLAN_KEY = "vendorai_graphic_design_plan_v1";
const MEDIA_PLAN_EXECUTION_KEY = "vendorai_media_plan_execution_v1";

const CHANNELS = [
  "Instagram / Reels",
  "TikTok",
  "YouTube",
  "Site / Landing Page",
  "WhatsApp",
  "Feed 4:5",
] as const;

type Channel = typeof CHANNELS[number];

type SceneCopy = {
  headline: string;
  supportingText: string;
  cta: string;
};

type StoredDesignPlan = {
  tenantId: string;
  approvedAt: string;
  source: "graphic-design-director";
  brief: {
    product: string;
    headline: string;
    supportingText: string;
    cta: string;
    channel: Channel;
    directionId: GraphicDirectionId;
    brandColor: string;
  };
  plan: GraphicDesignPlan;
};

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function formatAspect(format: GraphicDesignPlan["format"]): string {
  if (format === "16:9") return "16 / 9";
  if (format === "1:1") return "1 / 1";
  if (format === "4:5") return "4 / 5";
  return "9 / 16";
}

function channelProfile(direction: GraphicDirectionId): string {
  if (direction === "product-clean") return "product";
  if (direction === "premium-editorial") return "institutional";
  if (direction === "architecture-luxury") return "architecture";
  if (direction === "authority-minimal") return "educational";
  if (direction === "tech-modern") return "technology";
  return "performance";
}

function headlineForScene(index: number, input: { headline: string; product: string; supporting: string; cta: string }): SceneCopy {
  if (index === 0) {
    return {
      headline: input.headline || input.product || "Sua mensagem principal",
      supportingText: input.supporting || "Uma composição clara, forte e coerente com a marca.",
      cta: "",
    };
  }
  if (index === 1) {
    return {
      headline: input.product ? `Por que ${input.product}?` : "Mostre o que realmente importa",
      supportingText: input.supporting || "Destaque prova, benefício e contexto usando mídia real.",
      cta: "",
    };
  }
  return {
    headline: input.cta ? "Próximo passo" : "Fechamento com assinatura de marca",
    supportingText: input.supporting || "Finalize com foco, espaço visual e uma ação simples.",
    cta: input.cta || "Fale com nossa equipe",
  };
}

function scoreTone(score: number) {
  if (score >= 90) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
  if (score >= 82) return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  if (score >= 72) return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300";
}

function SlotText({
  text,
  x,
  y,
  width,
  align,
  fontFamily,
  fontWeight,
  fontSize,
  color,
  background,
  radius,
}: {
  text: string;
  x: number;
  y: number;
  width: number;
  align: "left" | "center" | "right";
  fontFamily: string;
  fontWeight: number;
  fontSize: string;
  color: string;
  background?: string;
  radius?: number;
}) {
  if (!text.trim()) return null;
  return (
    <div
      className="absolute z-20"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        textAlign: align,
      }}
    >
      <span
        className="inline-block leading-[1.02]"
        style={{
          fontFamily: `"${fontFamily}", Inter, Arial, sans-serif`,
          fontWeight,
          fontSize,
          color,
          background,
          borderRadius: radius,
          padding: background ? "0.42em 0.66em" : undefined,
        }}
      >
        {text}
      </span>
    </div>
  );
}

function Artboard({
  plan,
  sceneIndex,
  asset,
  showSafeArea,
}: {
  plan: GraphicDesignPlan;
  sceneIndex: number;
  asset: ProfessionalMediaAsset | null;
  showSafeArea: boolean;
}) {
  const scene = plan.scenes[sceneIndex];
  const direction = graphicDirection(plan.directionId);
  if (!scene) return null;
  const media = asset ? assetUrl(asset) : "";
  const isVideo = asset?.type === "video";
  const background = plan.palette[0];
  const headlineScale = plan.format === "9:16" ? "clamp(1.55rem, 4.4vw, 3.6rem)" : "clamp(1.35rem, 3.2vw, 3.1rem)";
  const bodyScale = plan.format === "9:16" ? "clamp(.72rem, 1.7vw, 1.05rem)" : "clamp(.68rem, 1.25vw, 1rem)";
  const layout = scene.layout;

  return (
    <div
      className="relative mx-auto w-full overflow-hidden border border-white/10 bg-black shadow-[0_28px_80px_rgba(0,0,0,.24)]"
      style={{ aspectRatio: formatAspect(plan.format), maxHeight: 640, background, borderRadius: plan.borderRadius }}
    >
      {media ? (
        isVideo ? (
          <video src={media} muted playsInline autoPlay loop className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <img src={media} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-black/20 to-black/50">
          <ImageIcon className="h-10 w-10 text-white/25" />
        </div>
      )}

      <div
        className="absolute inset-0"
        style={{
          background: layout.mediaFocus === "right"
            ? `linear-gradient(90deg, ${background} 0%, ${background}E8 38%, ${background}22 72%, transparent 100%)`
            : layout.mediaFocus === "left"
              ? `linear-gradient(270deg, ${background} 0%, ${background}E8 38%, ${background}22 72%, transparent 100%)`
              : `linear-gradient(180deg, rgba(0,0,0,${Math.max(0.08, plan.overlayOpacity * 0.55)}) 0%, rgba(0,0,0,${plan.overlayOpacity}) 100%)`,
        }}
      />

      <div className="absolute left-[7%] top-[5%] z-20 rounded-full border border-white/25 bg-black/20 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm">
        Marca
      </div>

      <SlotText
        text={scene.headline}
        x={layout.headline.x}
        y={layout.headline.y}
        width={layout.headline.width}
        align={layout.headline.align}
        fontFamily={scene.headlineFont}
        fontWeight={scene.headlineWeight}
        fontSize={headlineScale}
        color={direction.textColor}
      />
      <SlotText
        text={scene.supportingText}
        x={layout.supporting.x}
        y={layout.supporting.y}
        width={layout.supporting.width}
        align={layout.supporting.align}
        fontFamily={scene.bodyFont}
        fontWeight={500}
        fontSize={bodyScale}
        color={direction.mutedTextColor}
      />
      <SlotText
        text={scene.cta}
        x={layout.cta.x}
        y={layout.cta.y}
        width={layout.cta.width}
        align={layout.cta.align}
        fontFamily={scene.bodyFont}
        fontWeight={700}
        fontSize={bodyScale}
        color={direction.ctaColor}
        background={direction.ctaBackground}
        radius={Math.max(8, plan.borderRadius * 0.6)}
      />

      {showSafeArea && (
        <div
          className="pointer-events-none absolute z-30 border border-dashed border-white/45"
          style={{ inset: `${plan.safeAreaPct}%` }}
        >
          <span className="absolute -top-5 left-0 text-[8px] font-medium uppercase tracking-widest text-white/60">safe area</span>
        </div>
      )}
      <div className="absolute bottom-2 right-2 z-30 rounded-full bg-black/45 px-2 py-1 text-[9px] font-semibold text-white/80 backdrop-blur-sm">{scene.score}/100</div>
    </div>
  );
}

export default function GraphicDesignDirectorPanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();

  const [product, setProduct] = useState("");
  const [headline, setHeadline] = useState("");
  const [supportingText, setSupportingText] = useState("");
  const [cta, setCta] = useState("");
  const [channel, setChannel] = useState<Channel>("Instagram / Reels");
  const [directionId, setDirectionId] = useState<GraphicDirectionId>("performance-bold");
  const [brandColor, setBrandColor] = useState("#F97316");
  const [assets, setAssets] = useState<ProfessionalMediaAsset[]>([]);
  const [assetIds, setAssetIds] = useState<string[]>(["", "", ""]);
  const [layoutOverrides, setLayoutOverrides] = useState<Partial<Record<number, GraphicLayoutId>>>({});
  const [headlineOverrides, setHeadlineOverrides] = useState<Partial<Record<number, string>>>({});
  const [selectedScene, setSelectedScene] = useState(0);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [approved, setApproved] = useState(false);

  const loadAssets = async () => {
    if (!tenantId) return;
    setLoadingAssets(true);
    try {
      const [imagesRes, videosRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/assets?type=image&limit=120`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/media/assets?type=video&limit=80`, { headers: authHeaders() }),
      ]);
      const [imagesData, videosData] = await Promise.all([
        imagesRes.json().catch(() => ({})),
        videosRes.json().catch(() => ({})),
      ]);
      const next = [imagesData, videosData].flatMap((data) => Array.isArray(data.assets) ? data.assets as ProfessionalMediaAsset[] : []);
      const unique = Array.from(new Map(next.map((asset) => [asset.id, asset])).values());
      setAssets(unique);
      setAssetIds((current) => current.map((id, index) => id || unique[index]?.id || ""));
    } catch (error) {
      toast({ title: "Biblioteca visual indisponível", description: error instanceof Error ? error.message : "Falha ao carregar mídias", variant: "destructive" });
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => { void loadAssets(); }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    try {
      const raw = sessionStorage.getItem(MEDIA_PLAN_EXECUTION_KEY);
      if (!raw) return;
      const execution = JSON.parse(raw) as {
        tenantId?: string;
        campaign?: { produtoServico?: string; oferta?: string; mensagemCentral?: string; objetivo?: string };
        calendarItem?: { temaSugerido?: string; canal?: string };
      };
      if (execution.tenantId !== tenantId) return;
      setProduct((value) => value || execution.campaign?.produtoServico || "");
      setHeadline((value) => value || execution.calendarItem?.temaSugerido || execution.campaign?.objetivo || "");
      setSupportingText((value) => value || execution.campaign?.mensagemCentral || "");
      setCta((value) => value || execution.campaign?.oferta || "");
      const incomingChannel = execution.calendarItem?.canal;
      if (incomingChannel && CHANNELS.includes(incomingChannel as Channel)) setChannel(incomingChannel as Channel);
    } catch {}
  }, [tenantId]);

  const sceneCopies = useMemo(() => [0, 1, 2].map((index) => headlineForScene(index, {
    headline,
    product,
    supporting: supportingText,
    cta,
  })), [headline, product, supportingText, cta]);

  const plan = useMemo(() => buildGraphicDesignPlan({
    directionId,
    channel,
    format: graphicFormatForChannel(channel),
    profile: channelProfile(directionId),
    brandColors: [brandColor],
    tags: [product, headline].join(" ").toLowerCase().split(/\s+/).filter((token) => token.length >= 4).slice(0, 8),
    layoutOverrides,
    headlineOverrides,
    scenes: sceneCopies.map((scene, index) => ({
      ...scene,
      hasMedia: Boolean(assetIds[index]),
    })),
  }), [directionId, channel, brandColor, product, headline, layoutOverrides, headlineOverrides, sceneCopies, assetIds]);

  useEffect(() => { setApproved(false); }, [plan.directionId, plan.overallScore, plan.format, headline, supportingText, cta, assetIds.join("|")]);

  const selectedPlanScene = plan.scenes[selectedScene] ?? plan.scenes[0];
  const selectedAsset = assets.find((asset) => asset.id === assetIds[selectedScene]) ?? null;

  const approve = () => {
    if (!tenantId) return;
    if (!plan.approved) {
      toast({ title: "Direção visual ainda precisa de ajuste", description: "Atinga pelo menos 82/100 e elimine cenas abaixo do mínimo antes de aprovar." });
      return;
    }
    const payload: StoredDesignPlan = {
      tenantId,
      approvedAt: new Date().toISOString(),
      source: "graphic-design-director",
      brief: { product, headline, supportingText, cta, channel, directionId, brandColor },
      plan,
    };
    sessionStorage.setItem(DESIGN_PLAN_KEY, JSON.stringify(payload));
    setApproved(true);
    toast({ title: "Direção de arte aprovada", description: "Layout, tipografia, paleta, safe area e Design Score foram salvos para esta produção." });
  };

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.10] via-card to-card shadow-sm">
        <div className="grid gap-0 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-5 border-b border-border p-5 xl:border-b-0 xl:border-r sm:p-6">
            <div>
              <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300"><Palette className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-[0.18em]">Graphic Design Director</span></div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Design e layout antes do movimento</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">A peça nasce com direção de arte, grid, hierarquia, tipografia e safe area. Vídeo, Dublê e motion entram depois.</p>
            </div>

            <div className="space-y-3">
              <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Produto / serviço</span><input value={product} onChange={(event) => setProduct(event.target.value)} placeholder="Ex.: VendorAI" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-violet-500/40" /></label>
              <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Headline principal</span><textarea value={headline} onChange={(event) => setHeadline(event.target.value)} rows={3} placeholder="A mensagem que precisa dominar a peça" className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-violet-500/40" /></label>
              <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Texto de apoio</span><textarea value={supportingText} onChange={(event) => setSupportingText(event.target.value)} rows={3} placeholder="Prova, benefício ou explicação curta" className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-violet-500/40" /></label>
              <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">CTA</span><input value={cta} onChange={(event) => setCta(event.target.value)} placeholder="Ex.: Agende uma demonstração" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-violet-500/40" /></label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Canal / formato</span><select value={channel} onChange={(event) => setChannel(event.target.value as Channel)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm">{CHANNELS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Cor da marca</span><div className="flex gap-2"><input type="color" value={brandColor} onChange={(event) => setBrandColor(event.target.value)} className="h-10 w-12 rounded-lg border border-border bg-background p-1" /><input value={brandColor} onChange={(event) => /^#[0-9a-fA-F]{0,6}$/.test(event.target.value) && setBrandColor(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-xs font-mono" /></div></label>
            </div>

            <div className="rounded-2xl border border-border bg-background/55 p-3">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-violet-500" /><span className="text-xs font-semibold text-foreground">Design Score</span></div><span className={cn("rounded-full border px-2.5 py-1 text-sm font-bold", scoreTone(plan.overallScore))}>{plan.overallScore}/100</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-all", plan.approved ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${plan.overallScore}%` }} /></div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Aprovação automática: ≥82 geral e nenhuma cena abaixo de 76.</p>
            </div>
          </aside>

          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div><div className="flex items-center gap-2"><LayoutTemplate className="h-4 w-4 text-violet-500" /><h3 className="font-semibold text-foreground">Direção de arte</h3></div><p className="mt-1 text-xs text-muted-foreground">Escolha uma linguagem visual. O Auto Layout mantém consistência entre todas as cenas.</p></div>
              <button type="button" onClick={() => void loadAssets()} disabled={loadingAssets} className="inline-flex items-center gap-2 self-start rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40">{loadingAssets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Biblioteca</button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {GRAPHIC_DIRECTIONS.map((direction) => (
                <button key={direction.id} type="button" onClick={() => setDirectionId(direction.id)} className={cn("rounded-2xl border p-3 text-left transition", directionId === direction.id ? "border-violet-500/45 bg-violet-500/[0.08]" : "border-border bg-background/40 hover:border-violet-500/25")}>
                  <div className="mb-3 flex gap-1">{direction.palette.map((color) => <span key={color} className="h-5 flex-1 rounded-md border border-black/5" style={{ background: color }} />)}</div>
                  <p className="text-sm font-semibold text-foreground">{direction.name}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{direction.description}</p>
                </button>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-foreground">Canvas · {plan.format}</p><p className="text-xs text-muted-foreground">{plan.typography.headingFamily} + {plan.typography.bodyFamily}</p></div><button type="button" onClick={() => setShowSafeArea((value) => !value)} className={cn("rounded-lg border px-2.5 py-1.5 text-xs", showSafeArea ? "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300" : "border-border text-muted-foreground")}>Safe area</button></div>
                <Artboard plan={plan} sceneIndex={selectedScene} asset={selectedAsset} showSafeArea={showSafeArea} />
              </div>

              <aside className="space-y-3">
                <div className="rounded-2xl border border-border bg-background/45 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cena {selectedScene + 1}</p>
                  <label className="mt-3 block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Layout</span><select value={selectedPlanScene?.layoutId ?? "split-left"} onChange={(event) => setLayoutOverrides((current) => ({ ...current, [selectedScene]: event.target.value as GraphicLayoutId }))} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs">{GRAPHIC_LAYOUTS.map((layout) => <option key={layout.id} value={layout.id}>{layout.name}</option>)}</select></label>
                  <label className="mt-3 block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Headline desta cena</span><textarea value={headlineOverrides[selectedScene] ?? selectedPlanScene?.headline ?? ""} onChange={(event) => setHeadlineOverrides((current) => ({ ...current, [selectedScene]: event.target.value }))} rows={4} className="w-full resize-y rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-violet-500/40" /></label>
                  <label className="mt-3 block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">Mídia principal</span><select value={assetIds[selectedScene] ?? ""} onChange={(event) => setAssetIds((current) => current.map((id, index) => index === selectedScene ? event.target.value : id))} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs"><option value="">Sem mídia</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}</select></label>
                </div>

                {selectedPlanScene && (
                  <div className="rounded-2xl border border-border bg-background/45 p-3">
                    <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-500" /><p className="text-xs font-semibold text-foreground">Qualidade da composição</p></div>
                    <div className="mt-3 space-y-2 text-[11px]">
                      {Object.entries(selectedPlanScene.scores).map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3"><span className="capitalize text-muted-foreground">{label.replace(/([A-Z])/g, " $1")}</span><span className="font-semibold text-foreground">{value}/100</span></div>)}
                    </div>
                    {selectedPlanScene.warnings.length > 0 && <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-2 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">{selectedPlanScene.warnings.join(" ")}</div>}
                  </div>
                )}
              </aside>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {plan.scenes.map((scene, index) => {
                const asset = assets.find((item) => item.id === assetIds[index]) ?? null;
                return (
                  <button key={index} type="button" onClick={() => setSelectedScene(index)} className={cn("rounded-2xl border p-2 text-left transition", selectedScene === index ? "border-violet-500/45 bg-violet-500/[0.06]" : "border-border bg-background/30 hover:border-violet-500/20")}>
                    <div className="overflow-hidden rounded-xl bg-muted" style={{ aspectRatio: formatAspect(plan.format) }}>{asset && asset.type === "image" ? <img src={assetUrl(asset)} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full min-h-24 items-center justify-center"><Frame className="h-5 w-5 text-muted-foreground" /></div>}</div>
                    <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-foreground">Cena {index + 1}</span><span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-semibold", scoreTone(scene.score))}>{scene.score}</span></div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{scene.headline}</p>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background/45 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3"><Type className="mt-0.5 h-4 w-4 text-violet-500" /><div><p className="text-sm font-semibold text-foreground">Sistema visual pronto para produção</p><p className="mt-0.5 text-xs text-muted-foreground">Paleta, par tipográfico, grids, CTA, safe area e score ficam salvos como direção visual do projeto.</p></div></div>
              <button type="button" onClick={approve} disabled={!plan.approved} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40">{approved ? <CheckCircle2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}{approved ? "Direção aprovada" : "Aprovar direção visual"}</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
