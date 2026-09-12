import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Grid3X3,
  Layers3,
  Lock,
  Maximize2,
  Monitor,
  Move,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Square,
  Trash2,
  Unlock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Ratio = "9:16" | "4:5" | "1:1" | "16:9";
type DesignRole = "brand" | "headline" | "supporting" | "cta";

type GraphicLayer = {
  id: string;
  type: "text" | "card" | "image";
  name: string;
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  color: string;
  background: string;
  opacity: number;
  scale: number;
  rotation: number;
  easing: string;
  textAlign: "left" | "center" | "right";
  enterAnimation: string;
  exitAnimation: string;
  animationDuration: number;
  contentKind?: string;
  url?: string;
  assetId?: string;
  fontFamily?: string;
  fontWeight?: number;
  designRole?: DesignRole;
  locked?: boolean;
};

type GraphicProjectContext = {
  ratio?: Ratio;
  quality?: string;
  clips?: Array<{ id?: string; url?: string; name?: string }>;
  layers?: GraphicLayer[];
  graphicDesign?: {
    source?: string;
    directionName?: string;
    designScore?: number;
    safeAreaPct?: number;
    palette?: string[];
    typography?: { headingFamily?: string; bodyFamily?: string };
    responsiveVariants?: Record<string, { generatedAt: string; layerCount: number }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type ProjectPayload = {
  project?: {
    id: string;
    title: string;
    source?: string | null;
    context?: GraphicProjectContext | null;
  };
};

type Gesture = {
  layerId: string;
  mode: "move" | "resize";
  clientX: number;
  clientY: number;
  x: number;
  y: number;
  width: number;
};

const RATIOS: Array<{ id: Ratio; label: string; icon: typeof Smartphone }> = [
  { id: "9:16", label: "9:16", icon: Smartphone },
  { id: "4:5", label: "4:5", icon: Smartphone },
  { id: "1:1", label: "1:1", icon: Square },
  { id: "16:9", label: "16:9", icon: Monitor },
];

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function aspectRatio(ratio: Ratio) {
  if (ratio === "16:9") return "16 / 9";
  if (ratio === "4:5") return "4 / 5";
  if (ratio === "1:1") return "1 / 1";
  return "9 / 16";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function snapValue(value: number, guides: number[], enabled: boolean) {
  const clamped = clamp(value, 0, 100);
  if (!enabled) return clamped;
  for (const guide of guides) {
    if (Math.abs(clamped - guide) <= 1.35) return guide;
  }
  return Math.round(clamped / 2.5) * 2.5;
}

function layerRole(layer: GraphicLayer): DesignRole | "other" {
  if (layer.designRole) return layer.designRole;
  const normalized = `${layer.name} ${layer.text}`.toLowerCase();
  if (normalized.includes("headline") || normalized.includes("título") || normalized.includes("titulo")) return "headline";
  if (normalized.includes("cta")) return "cta";
  if (normalized.includes("apoio") || normalized.includes("support")) return "supporting";
  if (layer.type === "image" || normalized.includes("logo") || normalized.includes("marca")) return "brand";
  return "other";
}

function adaptedLayer(layer: GraphicLayer, ratio: Ratio, safe: number): GraphicLayer {
  const role = layerRole(layer);
  const isLandscape = ratio === "16:9";
  const isSquareish = ratio === "1:1" || ratio === "4:5";
  const left = safe;
  const usable = 100 - safe * 2;

  if (role === "brand") {
    return { ...layer, x: left, y: safe, width: isLandscape ? 18 : 24 };
  }
  if (role === "headline") {
    return {
      ...layer,
      x: left,
      y: isLandscape ? 18 : isSquareish ? 16 : 17,
      width: isLandscape ? Math.min(56, usable) : Math.min(84, usable),
      fontSize: isLandscape ? Math.min(layer.fontSize, 52) : layer.fontSize,
      textAlign: "left",
    };
  }
  if (role === "supporting") {
    return {
      ...layer,
      x: left,
      y: isLandscape ? 58 : isSquareish ? 58 : 57,
      width: isLandscape ? Math.min(49, usable) : Math.min(82, usable),
      textAlign: "left",
    };
  }
  if (role === "cta") {
    return {
      ...layer,
      x: left,
      y: isLandscape ? 79 : 80,
      width: isLandscape ? Math.min(34, usable) : Math.min(60, usable),
      textAlign: "left",
    };
  }

  return {
    ...layer,
    x: clamp(layer.x, safe, 100 - safe - Math.min(layer.width, usable)),
    y: clamp(layer.y, safe, 100 - safe),
    width: Math.min(layer.width, usable),
  };
}

function layerLabel(layer: GraphicLayer) {
  const role = layerRole(layer);
  if (role === "headline") return "Headline";
  if (role === "supporting") return "Texto de apoio";
  if (role === "cta") return "CTA";
  if (role === "brand") return "Marca / logo";
  return layer.type === "image" ? "Imagem" : "Texto";
}

export default function ProfessionalGraphicCanvasEditor() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const projectId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("projectId") ?? "" : "";
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const [projectTitle, setProjectTitle] = useState("");
  const [context, setContext] = useState<GraphicProjectContext | null>(null);
  const [layers, setLayers] = useState<GraphicLayer[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [ratio, setRatio] = useState<Ratio>("9:16");
  const [showGrid, setShowGrid] = useState(true);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const safeArea = clamp(Number(context?.graphicDesign?.safeAreaPct ?? 7), 4, 14);
  const selected = layers.find((layer) => layer.id === selectedId) ?? null;
  const backgroundClip = context?.clips?.find((clip) => Boolean(clip.url)) ?? null;
  const isGraphicProject = Boolean(context?.graphicDesign || context?.layers?.some((layer) => layer.designRole));

  const load = useCallback(async () => {
    if (!tenantId || !projectId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/projects/${projectId}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({})) as ProjectPayload & { error?: string };
      if (!response.ok || !data.project) throw new Error(data.error ?? "Projeto não encontrado");
      const nextContext = data.project.context ?? {};
      const nextLayers = Array.isArray(nextContext.layers) ? nextContext.layers : [];
      setProjectTitle(data.project.title ?? "Projeto gráfico");
      setContext(nextContext);
      setLayers(nextLayers);
      setSelectedId((current) => current && nextLayers.some((layer) => layer.id === current) ? current : nextLayers[0]?.id ?? "");
      setRatio((nextContext.ratio as Ratio) || "9:16");
      setDirty(false);
    } catch (error) {
      toast({ title: "Canvas gráfico indisponível", description: error instanceof Error ? error.message : "Falha ao carregar projeto", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [projectId, tenantId, toast]);

  useEffect(() => { void load(); }, [load]);

  const updateLayer = useCallback((id: string, patch: Partial<GraphicLayer>) => {
    setLayers((current) => current.map((layer) => layer.id === id ? { ...layer, ...patch } : layer));
    setDirty(true);
  }, []);

  const removeLayer = useCallback((id: string) => {
    setLayers((current) => {
      const next = current.filter((layer) => layer.id !== id);
      setSelectedId((selectedId) => selectedId === id ? next[0]?.id ?? "" : selectedId);
      return next;
    });
    setDirty(true);
  }, []);

  const duplicateLayer = useCallback((id: string) => {
    setLayers((current) => {
      const index = current.findIndex((layer) => layer.id === id);
      if (index < 0) return current;
      const source = current[index]!;
      const clone: GraphicLayer = {
        ...source,
        id: `${source.id}-copy-${Date.now().toString(36)}`,
        name: `${source.name} · cópia`,
        x: clamp(source.x + 2.5, 0, 100 - source.width),
        y: clamp(source.y + 2.5, 0, 96),
        locked: false,
      };
      const next = [...current];
      next.splice(index + 1, 0, clone);
      setSelectedId(clone.id);
      return next;
    });
    setDirty(true);
  }, []);

  const reorder = useCallback((id: string, direction: -1 | 1) => {
    setLayers((current) => {
      const index = current.findIndex((layer) => layer.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    setDirty(true);
  }, []);

  const alignSelected = (position: "left" | "center" | "right") => {
    if (!selected || selected.locked) return;
    const x = position === "left"
      ? safeArea
      : position === "right"
        ? 100 - safeArea - selected.width
        : 50 - selected.width / 2;
    updateLayer(selected.id, { x: clamp(x, 0, 100 - selected.width), textAlign: position });
  };

  const adaptToRatio = (nextRatio: Ratio) => {
    setRatio(nextRatio);
    setLayers((current) => current.map((layer) => adaptedLayer(layer, nextRatio, safeArea)));
    setDirty(true);
    toast({ title: `Layout adaptado para ${nextRatio}`, description: "Hierarquia, marca, headline, apoio e CTA foram recompostos para o novo formato." });
  };

  const beginGesture = (event: ReactPointerEvent<HTMLElement>, layer: GraphicLayer, mode: Gesture["mode"]) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(layer.id);
    if (layer.locked) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gestureRef.current = {
      layerId: layer.id,
      mode,
      clientX: event.clientX,
      clientY: event.clientY,
      x: layer.x,
      y: layer.y,
      width: layer.width,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    const stage = stageRef.current;
    if (!gesture || !stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = ((event.clientX - gesture.clientX) / rect.width) * 100;
    const dy = ((event.clientY - gesture.clientY) / rect.height) * 100;

    if (gesture.mode === "move") {
      const nextX = snapValue(gesture.x + dx, [safeArea, 25, 50, 75, 100 - safeArea], snapEnabled);
      const nextY = snapValue(gesture.y + dy, [safeArea, 25, 50, 75, 100 - safeArea], snapEnabled);
      setLayers((current) => current.map((layer) => layer.id === gesture.layerId
        ? { ...layer, x: clamp(nextX, 0, 100 - layer.width), y: clamp(nextY, 0, 96) }
        : layer));
    } else {
      const nextWidth = snapValue(gesture.width + dx, [20, 25, 33.3, 50, 66.6, 75, 90], snapEnabled);
      setLayers((current) => current.map((layer) => layer.id === gesture.layerId
        ? { ...layer, width: clamp(nextWidth, 8, 100 - layer.x) }
        : layer));
    }
    setDirty(true);
  };

  const finishGesture = () => {
    gestureRef.current = null;
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const layer = layers.find((item) => item.id === selectedId);
      if (!layer) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateLayer(layer.id);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && !layer.locked) {
        event.preventDefault();
        removeLayer(layer.id);
        return;
      }
      if (layer.locked) return;
      const step = event.shiftKey ? 2.5 : 0.5;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        updateLayer(layer.id, {
          x: clamp(layer.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), 0, 100 - layer.width),
          y: clamp(layer.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), 0, 96),
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [duplicateLayer, layers, removeLayer, selectedId, updateLayer]);

  const save = async () => {
    if (!tenantId || !projectId || !context) return;
    setSaving(true);
    try {
      const nextContext: GraphicProjectContext = {
        ...context,
        ratio,
        layers,
        graphicDesign: {
          ...(context.graphicDesign ?? {}),
          editor: "professional-graphic-canvas-v1",
          lastLayoutEditAt: new Date().toISOString(),
          responsiveVariants: {
            ...(context.graphicDesign?.responsiveVariants ?? {}),
            [ratio]: { generatedAt: new Date().toISOString(), layerCount: layers.length },
          },
        },
      };
      const response = await fetch(`/api/tenants/${tenantId}/media/projects/${projectId}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ context: nextContext }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar layout");
      setContext(nextContext);
      setDirty(false);
      toast({ title: "Layout aplicado à Timeline", description: "Posições, ordem das layers, bloqueios e formato foram salvos. A Timeline será recarregada com a nova composição." });
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      toast({ title: "Não foi possível salvar o layout", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const palette = useMemo(() => Array.isArray(context?.graphicDesign?.palette) ? context?.graphicDesign?.palette : [], [context]);

  if (!projectId || (!loading && (!context || !isGraphicProject))) return null;

  return (
    <section className="overflow-hidden rounded-3xl border border-violet-500/20 bg-card shadow-sm" data-testid="professional-graphic-canvas">
      <div className="border-b border-border bg-gradient-to-r from-violet-500/[0.08] via-card to-card px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Maximize2 className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-foreground">Canvas gráfico profissional</h2><span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">Design editável</span></div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Arraste, redimensione, alinhe, duplique e bloqueie layers. O mesmo design pode ser recomposto automaticamente para cada formato antes da Timeline.</p>
              {projectTitle && <p className="mt-1 truncate text-[11px] text-muted-foreground">{projectTitle}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setShowGrid((value) => !value)} className={cn("inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium", showGrid ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border text-muted-foreground")}><Grid3X3 className="h-3.5 w-3.5" />Grid</button>
            <button type="button" onClick={() => setSnapEnabled((value) => !value)} className={cn("inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium", snapEnabled ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border text-muted-foreground")}><Move className="h-3.5 w-3.5" />Snap</button>
            <button type="button" onClick={() => setShowSafeArea((value) => !value)} className={cn("inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium", showSafeArea ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border text-muted-foreground")}><ShieldCheck className="h-3.5 w-3.5" />Safe area</button>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />Recarregar</button>
            <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="inline-flex h-9 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"><Save className="h-3.5 w-3.5" />{saving ? "Salvando…" : dirty ? "Salvar e aplicar" : "Salvo"}</button>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[230px_minmax(0,1fr)_280px]">
        <aside className="border-b border-border p-3 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-2 px-1"><div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-violet-500" /><p className="text-xs font-semibold text-foreground">Layers</p></div><span className="text-[10px] text-muted-foreground">{layers.length}</span></div>
          <div className="mt-3 max-h-[520px] space-y-1 overflow-auto pr-1">
            {[...layers].reverse().map((layer) => {
              const index = layers.findIndex((item) => item.id === layer.id);
              const active = selectedId === layer.id;
              return (
                <button key={layer.id} type="button" onClick={() => setSelectedId(layer.id)} className={cn("flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition", active ? "border-violet-500/35 bg-violet-500/[0.08]" : "border-transparent hover:bg-muted/60")}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{layer.locked ? <Lock className="h-3.5 w-3.5" /> : layer.type === "image" ? <Square className="h-3.5 w-3.5" /> : <Layers3 className="h-3.5 w-3.5" />}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold text-foreground">{layer.name}</span><span className="block truncate text-[9px] text-muted-foreground">{layerLabel(layer)} · z {index + 1}</span></span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 bg-muted/20 p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm font-semibold text-foreground">Prancheta · {ratio}</p><p className="text-xs text-muted-foreground">Arraste a layer selecionada. Use o ponto inferior direito para redimensionar.</p></div>
            <div className="flex flex-wrap gap-1.5">
              {RATIOS.map((item) => {
                const Icon = item.icon;
                return <button key={item.id} type="button" onClick={() => adaptToRatio(item.id)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold", ratio === item.id ? "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border bg-card text-muted-foreground hover:text-foreground")}><Icon className="h-3.5 w-3.5" />{item.label}</button>;
              })}
            </div>
          </div>

          <div
            ref={stageRef}
            onPointerMove={onPointerMove}
            onPointerUp={finishGesture}
            onPointerCancel={finishGesture}
            onPointerLeave={(event) => { if (event.buttons === 0) finishGesture(); }}
            className="relative mx-auto w-full touch-none overflow-hidden bg-black shadow-[0_24px_70px_rgba(0,0,0,.22)]"
            style={{ aspectRatio: aspectRatio(ratio), maxHeight: 680, borderRadius: 18 }}
            onPointerDown={() => setSelectedId("")}
          >
            {backgroundClip?.url ? <video src={backgroundClip.url} muted playsInline loop autoPlay className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-black" />}
            <div className="absolute inset-0 bg-black/20" />

            {showGrid && <div className="pointer-events-none absolute inset-0 z-10 opacity-25" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.45) 1px, transparent 1px)", backgroundSize: "10% 10%" }} />}
            {showGrid && <><div className="pointer-events-none absolute left-1/2 top-0 z-10 h-full w-px bg-violet-300/60" /><div className="pointer-events-none absolute left-0 top-1/2 z-10 h-px w-full bg-violet-300/60" /></>}
            {showSafeArea && <div className="pointer-events-none absolute z-20 border border-dashed border-emerald-300/70" style={{ inset: `${safeArea}%` }}><span className="absolute -top-5 left-0 text-[8px] font-semibold uppercase tracking-[0.16em] text-emerald-200">safe area</span></div>}

            {layers.map((layer, index) => {
              const active = selectedId === layer.id;
              const fontFamily = layer.fontFamily ? `"${layer.fontFamily}", Inter, Arial, sans-serif` : "var(--vendor-creative-font, Inter, Arial, sans-serif)";
              return (
                <div
                  key={layer.id}
                  onPointerDown={(event) => beginGesture(event, layer, "move")}
                  className={cn("absolute z-30 cursor-move select-none", active && "outline outline-2 outline-violet-400 outline-offset-2", layer.locked && "cursor-not-allowed")}
                  style={{
                    left: `${layer.x}%`,
                    top: `${layer.y}%`,
                    width: `${layer.width}%`,
                    opacity: layer.opacity,
                    transform: `rotate(${layer.rotation}deg) scale(${layer.scale})`,
                    transformOrigin: "top left",
                    zIndex: 30 + index,
                    textAlign: layer.textAlign,
                  }}
                >
                  {layer.type === "image" && layer.url ? (
                    <img src={layer.url} alt="" className="block h-auto w-full object-contain" draggable={false} />
                  ) : (
                    <div style={{ color: layer.color, background: layer.background === "transparent" ? undefined : layer.background, fontFamily, fontWeight: layer.fontWeight ?? 700, fontSize: `clamp(12px, ${Math.max(1.05, layer.fontSize / 18)}vw, ${layer.fontSize}px)`, lineHeight: 1.04, padding: layer.background && layer.background !== "transparent" ? "0.42em 0.62em" : undefined, borderRadius: layer.background && layer.background !== "transparent" ? 10 : undefined }}>
                      {layer.text || layer.name}
                    </div>
                  )}
                  {active && !layer.locked && <button type="button" aria-label="Redimensionar layer" onPointerDown={(event) => beginGesture(event, layer, "resize")} className="absolute -bottom-3 -right-3 z-50 flex h-6 w-6 cursor-se-resize items-center justify-center rounded-full border-2 border-white bg-violet-600 shadow"><span className="h-2 w-2 rounded-sm bg-white" /></button>}
                  {active && layer.locked && <span className="absolute -right-2 -top-2 z-50 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white"><Lock className="h-3 w-3" /></span>}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span>Setas: mover 0,5%</span><span>•</span><span>Shift + setas: 2,5%</span><span>•</span><span>Ctrl/Cmd + D: duplicar</span><span>•</span><span>Delete: excluir</span>
          </div>
        </div>

        <aside className="border-t border-border p-4 xl:border-l xl:border-t-0">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{selected.name}</p><p className="text-[10px] text-muted-foreground">{layerLabel(selected)}</p></div><button type="button" onClick={() => updateLayer(selected.id, { locked: !selected.locked })} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground">{selected.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}</button></div>

              <div className="grid grid-cols-3 gap-1.5">
                <button type="button" disabled={selected.locked} onClick={() => alignSelected("left")} className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"><AlignLeft className="h-4 w-4" /></button>
                <button type="button" disabled={selected.locked} onClick={() => alignSelected("center")} className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"><AlignCenter className="h-4 w-4" /></button>
                <button type="button" disabled={selected.locked} onClick={() => alignSelected("right")} className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"><AlignRight className="h-4 w-4" /></button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {(["x", "y", "width", "fontSize", "rotation", "opacity"] as const).map((field) => <label key={field} className="space-y-1"><span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{field === "fontSize" ? "fonte" : field}</span><input type="number" step={field === "opacity" ? 0.05 : 0.5} min={field === "opacity" ? 0 : undefined} max={field === "opacity" ? 1 : undefined} disabled={selected.locked} value={Number(selected[field].toFixed(field === "opacity" ? 2 : 1))} onChange={(event) => updateLayer(selected.id, { [field]: Number(event.target.value) } as Partial<GraphicLayer>)} className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-violet-500/40 disabled:opacity-50" /></label>)}
              </div>

              {selected.type !== "image" && <label className="block space-y-1"><span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Texto</span><textarea disabled={selected.locked} value={selected.text} onChange={(event) => updateLayer(selected.id, { text: event.target.value })} rows={4} className="w-full resize-y rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-violet-500/40 disabled:opacity-50" /></label>}

              <div className="grid grid-cols-4 gap-1.5">
                <button type="button" onClick={() => reorder(selected.id, 1)} title="Trazer para frente" className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"><ChevronUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => reorder(selected.id, -1)} title="Enviar para trás" className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"><ChevronDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => duplicateLayer(selected.id)} title="Duplicar" className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"><Copy className="h-4 w-4" /></button>
                <button type="button" disabled={selected.locked} onClick={() => removeLayer(selected.id)} title="Excluir" className="flex h-9 items-center justify-center rounded-lg border border-red-500/20 text-red-500 hover:bg-red-500/10 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Direção visual</p><p className="mt-1 text-xs font-medium text-foreground">{String(context?.graphicDesign?.directionName ?? "Direção aprovada")}</p><div className="mt-2 flex flex-wrap gap-1">{palette.map((color) => <span key={color} className="h-5 w-5 rounded-md border border-border" style={{ background: color }} title={color} />)}</div>{Number(context?.graphicDesign?.designScore ?? 0) > 0 && <p className="mt-2 text-[10px] text-muted-foreground">Design Score {Number(context?.graphicDesign?.designScore)}/100</p>}</div>
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-border px-4 text-center"><Move className="h-5 w-5 text-muted-foreground" /><p className="mt-2 text-xs font-semibold text-foreground">Selecione uma layer</p><p className="mt-1 text-[10px] text-muted-foreground">Depois ajuste posição, largura, tipografia, ordem e bloqueio.</p></div>
          )}
        </aside>
      </div>
    </section>
  );
}
