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
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalDistributeCenter,
  BoxSelect,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Grid3X3,
  Group,
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
  Ungroup,
  Unlock,
  WandSparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Ratio = "9:16" | "4:5" | "1:1" | "16:9";
type DesignRole = "brand" | "headline" | "supporting" | "cta";
type MaskShape = "none" | "rounded" | "circle";
type ShapeKind = "rectangle" | "pill" | "circle" | "line";
type ShadowPreset = "none" | "soft" | "strong" | "glow";
type CompositionPreset = "editorial" | "product" | "impact" | "minimal";

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
  groupId?: string | null;
  shapeKind?: ShapeKind;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadowPreset?: ShadowPreset;
  gradientStart?: string;
  gradientEnd?: string;
  gradientAngle?: number;
  maskShape?: MaskShape;
  imageFit?: "contain" | "cover";
  imagePositionX?: number;
  imagePositionY?: number;
  imageZoom?: number;
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
    editor?: string;
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
  movingIds: string[];
  origins: Record<string, { x: number; y: number }>;
};

type SmartGuides = { x: number[]; y: number[] };

const RATIOS: Array<{ id: Ratio; label: string; icon: typeof Smartphone }> = [
  { id: "9:16", label: "9:16", icon: Smartphone },
  { id: "4:5", label: "4:5", icon: Smartphone },
  { id: "1:1", label: "1:1", icon: Square },
  { id: "16:9", label: "16:9", icon: Monitor },
];

const PRESETS: Array<{ id: CompositionPreset; label: string; hint: string }> = [
  { id: "editorial", label: "Editorial", hint: "Hierarquia elegante e assimétrica" },
  { id: "product", label: "Produto", hint: "Produto em destaque + CTA forte" },
  { id: "impact", label: "Impacto", hint: "Headline grande e contraste alto" },
  { id: "minimal", label: "Minimal", hint: "Espaço negativo e leitura premium" },
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

function layerRole(layer: GraphicLayer): DesignRole | "other" {
  if (layer.designRole) return layer.designRole;
  const normalized = `${layer.name} ${layer.text}`.toLowerCase();
  if (normalized.includes("headline") || normalized.includes("título") || normalized.includes("titulo")) return "headline";
  if (normalized.includes("cta")) return "cta";
  if (normalized.includes("apoio") || normalized.includes("support")) return "supporting";
  if (layer.type === "image" || normalized.includes("logo") || normalized.includes("marca")) return "brand";
  return "other";
}

function layerLabel(layer: GraphicLayer) {
  if (layer.shapeKind) return `Forma · ${layer.shapeKind}`;
  const role = layerRole(layer);
  if (role === "headline") return "Headline";
  if (role === "supporting") return "Texto de apoio";
  if (role === "cta") return "CTA";
  if (role === "brand") return "Marca / logo";
  return layer.type === "image" ? "Imagem" : layer.type === "card" ? "Forma / card" : "Texto";
}

function adaptedLayer(layer: GraphicLayer, ratio: Ratio, safe: number): GraphicLayer {
  const role = layerRole(layer);
  const isLandscape = ratio === "16:9";
  const isSquareish = ratio === "1:1" || ratio === "4:5";
  const left = safe;
  const usable = 100 - safe * 2;
  if (role === "brand") return { ...layer, x: left, y: safe, width: isLandscape ? 16 : 22 };
  if (role === "headline") return { ...layer, x: left, y: isLandscape ? 18 : 17, width: isLandscape ? Math.min(50, usable) : Math.min(84, usable), fontSize: isLandscape ? Math.min(layer.fontSize, 50) : layer.fontSize, textAlign: "left" };
  if (role === "supporting") return { ...layer, x: left, y: isLandscape ? 58 : isSquareish ? 59 : 58, width: isLandscape ? Math.min(46, usable) : Math.min(80, usable), textAlign: "left" };
  if (role === "cta") return { ...layer, x: left, y: isLandscape ? 79 : 81, width: isLandscape ? Math.min(32, usable) : Math.min(58, usable), textAlign: "left" };
  return { ...layer, x: clamp(layer.x, safe, 100 - safe - Math.min(layer.width, usable)), y: clamp(layer.y, safe, 100 - safe), width: Math.min(layer.width, usable) };
}

function shadowValue(preset: ShadowPreset | undefined) {
  if (preset === "soft") return "0 8px 24px rgba(0,0,0,.22)";
  if (preset === "strong") return "0 16px 42px rgba(0,0,0,.42)";
  if (preset === "glow") return "0 0 28px rgba(139,92,246,.48)";
  return undefined;
}

function layerBackground(layer: GraphicLayer) {
  if (layer.gradientStart && layer.gradientEnd) return `linear-gradient(${layer.gradientAngle ?? 135}deg, ${layer.gradientStart}, ${layer.gradientEnd})`;
  return layer.background === "transparent" ? "transparent" : layer.background;
}

function maskRadius(layer: GraphicLayer) {
  if (layer.maskShape === "circle" || layer.shapeKind === "circle") return "9999px";
  if (layer.maskShape === "rounded") return `${Math.max(16, layer.borderRadius ?? 28)}px`;
  if (layer.shapeKind === "pill") return "9999px";
  return `${layer.borderRadius ?? (layer.type === "card" ? 16 : 0)}px`;
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function boundsFor(layers: GraphicLayer[]) {
  if (!layers.length) return null;
  const left = Math.min(...layers.map((layer) => layer.x));
  const top = Math.min(...layers.map((layer) => layer.y));
  const right = Math.max(...layers.map((layer) => layer.x + layer.width));
  const bottom = Math.max(...layers.map((layer) => layer.y + 8));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export default function ProfessionalGraphicCanvasEditorV2() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const projectId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("projectId") ?? "" : "";
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const [projectTitle, setProjectTitle] = useState("");
  const [context, setContext] = useState<GraphicProjectContext | null>(null);
  const [layers, setLayers] = useState<GraphicLayer[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ratio, setRatio] = useState<Ratio>("9:16");
  const [showGrid, setShowGrid] = useState(true);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [smartGuides, setSmartGuides] = useState<SmartGuides>({ x: [], y: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const safeArea = clamp(Number(context?.graphicDesign?.safeAreaPct ?? 7), 4, 14);
  const selectedLayers = useMemo(() => layers.filter((layer) => selectedIds.includes(layer.id)), [layers, selectedIds]);
  const primary = selectedLayers[0] ?? null;
  const backgroundClip = context?.clips?.find((clip) => Boolean(clip.url)) ?? null;
  const isGraphicProject = Boolean(context?.graphicDesign || context?.layers?.some((layer) => layer.designRole));
  const palette = useMemo(() => Array.isArray(context?.graphicDesign?.palette) ? context?.graphicDesign?.palette : [], [context]);

  const load = useCallback(async () => {
    if (!tenantId || !projectId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/projects/${projectId}`, { headers: authHeaders(), cache: "no-store" });
      const data = await response.json().catch(() => ({})) as ProjectPayload & { error?: string };
      if (!response.ok || !data.project) throw new Error(data.error ?? "Projeto não encontrado");
      const nextContext = data.project.context ?? {};
      const nextLayers = Array.isArray(nextContext.layers) ? nextContext.layers : [];
      setProjectTitle(data.project.title ?? "Projeto gráfico");
      setContext(nextContext);
      setLayers(nextLayers);
      setSelectedIds((current) => current.filter((id) => nextLayers.some((layer) => layer.id === id)).slice(0, 1));
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

  const updateSelected = useCallback((patcher: (layer: GraphicLayer) => Partial<GraphicLayer>) => {
    if (!selectedIds.length) return;
    setLayers((current) => current.map((layer) => selectedIds.includes(layer.id) && !layer.locked ? { ...layer, ...patcher(layer) } : layer));
    setDirty(true);
  }, [selectedIds]);

  const selectLayer = (event: ReactPointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>, layer: GraphicLayer) => {
    event.stopPropagation();
    const toggle = event.shiftKey || event.metaKey || event.ctrlKey;
    if (toggle) setSelectedIds((current) => current.includes(layer.id) ? current.filter((id) => id !== layer.id) : [...current, layer.id]);
    else if (layer.groupId) setSelectedIds(layers.filter((item) => item.groupId === layer.groupId).map((item) => item.id));
    else setSelectedIds([layer.id]);
  };

  const removeSelected = useCallback(() => {
    if (!selectedIds.length) return;
    setLayers((current) => current.filter((layer) => !selectedIds.includes(layer.id) || layer.locked));
    setSelectedIds([]);
    setDirty(true);
  }, [selectedIds]);

  const duplicateSelected = useCallback(() => {
    if (!selectedIds.length) return;
    setLayers((current) => {
      const stamp = Date.now().toString(36);
      const clones = current.filter((layer) => selectedIds.includes(layer.id)).map((source, index) => ({
        ...source,
        id: `${source.id}-copy-${stamp}-${index}`,
        name: `${source.name} · cópia`,
        x: clamp(source.x + 2.5, 0, 100 - source.width),
        y: clamp(source.y + 2.5, 0, 96),
        locked: false,
        groupId: source.groupId ? `group-${stamp}` : null,
      }));
      setSelectedIds(clones.map((layer) => layer.id));
      return [...current, ...clones];
    });
    setDirty(true);
  }, [selectedIds]);

  const groupSelected = () => {
    if (selectedIds.length < 2) return;
    const groupId = `group-${Date.now().toString(36)}`;
    updateSelected(() => ({ groupId }));
    toast({ title: "Layers agrupadas", description: `${selectedIds.length} elementos agora se movem como um grupo.` });
  };

  const ungroupSelected = () => {
    if (!selectedIds.length) return;
    updateSelected(() => ({ groupId: null }));
  };

  const reorderPrimary = (direction: -1 | 1) => {
    if (!primary) return;
    setLayers((current) => {
      const index = current.findIndex((layer) => layer.id === primary.id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    setDirty(true);
  };

  const alignSelection = (axis: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    if (!selectedLayers.length) return;
    const bounds = boundsFor(selectedLayers);
    if (!bounds) return;
    if (selectedLayers.length === 1) {
      const layer = selectedLayers[0]!;
      if (layer.locked) return;
      if (axis === "left") updateLayer(layer.id, { x: safeArea, textAlign: "left" });
      else if (axis === "center") updateLayer(layer.id, { x: 50 - layer.width / 2, textAlign: "center" });
      else if (axis === "right") updateLayer(layer.id, { x: 100 - safeArea - layer.width, textAlign: "right" });
      else if (axis === "top") updateLayer(layer.id, { y: safeArea });
      else if (axis === "middle") updateLayer(layer.id, { y: 46 });
      else updateLayer(layer.id, { y: 100 - safeArea - 8 });
      return;
    }
    updateSelected((layer) => {
      if (axis === "left") return { x: bounds.left };
      if (axis === "center") return { x: bounds.left + bounds.width / 2 - layer.width / 2 };
      if (axis === "right") return { x: bounds.right - layer.width };
      if (axis === "top") return { y: bounds.top };
      if (axis === "middle") return { y: bounds.top + bounds.height / 2 - 4 };
      return { y: bounds.bottom - 8 };
    });
  };

  const distribute = (axis: "horizontal" | "vertical") => {
    if (selectedLayers.length < 3) return;
    const sorted = [...selectedLayers].sort((a, b) => axis === "horizontal" ? a.x - b.x : a.y - b.y);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    if (axis === "horizontal") {
      const span = last.x - first.x;
      const step = span / (sorted.length - 1);
      setLayers((current) => current.map((layer) => {
        const index = sorted.findIndex((item) => item.id === layer.id);
        return index >= 0 && !layer.locked ? { ...layer, x: clamp(first.x + index * step, 0, 100 - layer.width) } : layer;
      }));
    } else {
      const span = last.y - first.y;
      const step = span / (sorted.length - 1);
      setLayers((current) => current.map((layer) => {
        const index = sorted.findIndex((item) => item.id === layer.id);
        return index >= 0 && !layer.locked ? { ...layer, y: clamp(first.y + index * step, 0, 96) } : layer;
      }));
    }
    setDirty(true);
  };

  const addShape = (shapeKind: ShapeKind) => {
    const stamp = Date.now().toString(36);
    const color = palette[0] ?? "#7c3aed";
    const layer: GraphicLayer = {
      id: `shape-${shapeKind}-${stamp}`,
      type: "card",
      name: `Forma · ${shapeKind}`,
      text: "",
      start: 0,
      end: Math.max(6, ...layers.map((item) => item.end || 0)),
      x: 30,
      y: 42,
      width: shapeKind === "line" ? 40 : shapeKind === "circle" ? 18 : 34,
      fontSize: 18,
      color: "#ffffff",
      background: color,
      opacity: 1,
      scale: 1,
      rotation: 0,
      easing: "ease-in-out",
      textAlign: "center",
      enterAnimation: "fade",
      exitAnimation: "fade",
      animationDuration: 0.3,
      shapeKind,
      borderRadius: shapeKind === "pill" || shapeKind === "circle" ? 999 : shapeKind === "line" ? 0 : 18,
      borderWidth: 0,
      borderColor: "#ffffff",
      shadowPreset: "none",
      maskShape: shapeKind === "circle" ? "circle" : "none",
    };
    setLayers((current) => [...current, layer]);
    setSelectedIds([layer.id]);
    setDirty(true);
  };

  const applyPreset = (preset: CompositionPreset) => {
    setLayers((current) => current.map((layer) => {
      const role = layerRole(layer);
      if (layer.shapeKind) return layer;
      if (preset === "editorial") {
        if (role === "brand") return { ...layer, x: safeArea, y: safeArea, width: 18 };
        if (role === "headline") return { ...layer, x: safeArea, y: 20, width: ratio === "16:9" ? 52 : 80, textAlign: "left", rotation: 0 };
        if (role === "supporting") return { ...layer, x: 18, y: 62, width: ratio === "16:9" ? 42 : 70 };
        if (role === "cta") return { ...layer, x: 58, y: 82, width: ratio === "16:9" ? 28 : 34, textAlign: "center" };
      }
      if (preset === "product") {
        if (role === "brand") return { ...layer, x: safeArea, y: safeArea, width: 20 };
        if (role === "headline") return { ...layer, x: safeArea, y: 14, width: 84, textAlign: "center" };
        if (role === "supporting") return { ...layer, x: 12, y: 68, width: 76, textAlign: "center" };
        if (role === "cta") return { ...layer, x: 22, y: 83, width: 56, textAlign: "center", shadowPreset: "soft" as const };
      }
      if (preset === "impact") {
        if (role === "brand") return { ...layer, x: safeArea, y: safeArea, width: 24 };
        if (role === "headline") return { ...layer, x: safeArea, y: 18, width: 88, fontSize: Math.max(58, layer.fontSize), textAlign: "left", shadowPreset: "strong" as const };
        if (role === "supporting") return { ...layer, x: safeArea, y: 65, width: 76 };
        if (role === "cta") return { ...layer, x: safeArea, y: 82, width: 62, shadowPreset: "glow" as const };
      }
      if (preset === "minimal") {
        if (role === "brand") return { ...layer, x: safeArea, y: safeArea, width: 14 };
        if (role === "headline") return { ...layer, x: 14, y: 30, width: 72, fontSize: Math.min(layer.fontSize, 48), textAlign: "center", shadowPreset: "none" as const };
        if (role === "supporting") return { ...layer, x: 20, y: 62, width: 60, textAlign: "center" };
        if (role === "cta") return { ...layer, x: 32, y: 82, width: 36, textAlign: "center", shadowPreset: "none" as const };
      }
      return layer;
    }));
    setDirty(true);
    toast({ title: `Composição ${PRESETS.find((item) => item.id === preset)?.label ?? preset} aplicada`, description: "Hierarquia e espaçamentos foram recompostos sem trocar o conteúdo." });
  };

  const adaptToRatio = (nextRatio: Ratio) => {
    setRatio(nextRatio);
    setLayers((current) => current.map((layer) => adaptedLayer(layer, nextRatio, safeArea)));
    setDirty(true);
    toast({ title: `Layout adaptado para ${nextRatio}`, description: "Marca, headline, apoio e CTA foram recompostos para o novo formato." });
  };

  const guideCandidates = useCallback((movingIds: string[]) => {
    const others = layers.filter((layer) => !movingIds.includes(layer.id));
    return {
      x: unique([safeArea, 50, 100 - safeArea, ...others.flatMap((layer) => [layer.x, layer.x + layer.width / 2, layer.x + layer.width])]),
      y: unique([safeArea, 50, 100 - safeArea, ...others.flatMap((layer) => [layer.y, layer.y + 4, layer.y + 8])]),
    };
  }, [layers, safeArea]);

  const snapCoordinate = (value: number, candidates: number[]) => {
    if (!snapEnabled) return { value: clamp(value, 0, 100), guide: null as number | null };
    const nearby = candidates.find((guide) => Math.abs(value - guide) <= 1.1);
    if (nearby != null) return { value: nearby, guide: nearby };
    return { value: Math.round(value / 2.5) * 2.5, guide: null as number | null };
  };

  const beginGesture = (event: ReactPointerEvent<HTMLElement>, layer: GraphicLayer, mode: Gesture["mode"]) => {
    event.preventDefault();
    event.stopPropagation();
    const toggle = event.shiftKey || event.metaKey || event.ctrlKey;
    let movingIds = selectedIds.includes(layer.id) ? selectedIds : [layer.id];
    if (!toggle && layer.groupId) movingIds = layers.filter((item) => item.groupId === layer.groupId).map((item) => item.id);
    if (!selectedIds.includes(layer.id) && !toggle) setSelectedIds(movingIds);
    if (layer.locked) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const origins = Object.fromEntries(layers.filter((item) => movingIds.includes(item.id)).map((item) => [item.id, { x: item.x, y: item.y }]));
    gestureRef.current = { layerId: layer.id, mode, clientX: event.clientX, clientY: event.clientY, x: layer.x, y: layer.y, width: layer.width, movingIds, origins };
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
      const candidates = guideCandidates(gesture.movingIds);
      const xSnap = snapCoordinate(gesture.x + dx, candidates.x);
      const ySnap = snapCoordinate(gesture.y + dy, candidates.y);
      const effectiveDx = xSnap.value - gesture.x;
      const effectiveDy = ySnap.value - gesture.y;
      setSmartGuides({ x: xSnap.guide == null ? [] : [xSnap.guide], y: ySnap.guide == null ? [] : [ySnap.guide] });
      setLayers((current) => current.map((item) => {
        const origin = gesture.origins[item.id];
        if (!origin || item.locked) return item;
        return { ...item, x: clamp(origin.x + effectiveDx, 0, 100 - item.width), y: clamp(origin.y + effectiveDy, 0, 96) };
      }));
    } else {
      const nextWidth = snapCoordinate(gesture.width + dx, [20, 25, 33.3, 50, 66.6, 75, 90]).value;
      setLayers((current) => current.map((item) => item.id === gesture.layerId && !item.locked ? { ...item, width: clamp(nextWidth, 6, 100 - item.x) } : item));
    }
    setDirty(true);
  };

  const finishGesture = () => {
    gestureRef.current = null;
    setSmartGuides({ x: [], y: [] });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!selectedIds.length) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        removeSelected();
        return;
      }
      const step = event.shiftKey ? 2.5 : 0.5;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        updateSelected((layer) => ({
          x: clamp(layer.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), 0, 100 - layer.width),
          y: clamp(layer.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), 0, 96),
        }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [duplicateSelected, removeSelected, selectedIds.length, updateSelected]);

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
          editor: "professional-graphic-canvas-v2",
          lastLayoutEditAt: new Date().toISOString(),
          advancedTools: { groups: true, multiSelect: true, smartGuides: true, shapes: true, effects: true, responsive: true },
          responsiveVariants: {
            ...(context.graphicDesign?.responsiveVariants ?? {}),
            [ratio]: { generatedAt: new Date().toISOString(), layerCount: layers.length },
          },
        },
      };
      const response = await fetch(`/api/tenants/${tenantId}/media/projects/${projectId}`, { method: "PATCH", headers: authHeaders(true), body: JSON.stringify({ context: nextContext }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar layout");
      setContext(nextContext);
      setDirty(false);
      toast({ title: "Design salvo e aplicado", description: "Composição, grupos, efeitos e formato foram persistidos no projeto e seguem para a Timeline." });
      window.setTimeout(() => window.location.reload(), 550);
    } catch (error) {
      toast({ title: "Não foi possível salvar o layout", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!projectId || (!loading && (!context || !isGraphicProject))) return null;

  return (
    <section className="overflow-hidden rounded-3xl border border-violet-500/20 bg-card shadow-sm" data-testid="professional-graphic-canvas-v2">
      <div className="border-b border-border bg-gradient-to-r from-violet-500/[0.09] via-card to-card px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Maximize2 className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-foreground">Canvas gráfico avançado</h2><span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">Multi-layer + smart guides</span></div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Selecione vários elementos, agrupe, distribua, aplique formas e efeitos e adapte a composição por canal antes da Timeline.</p>
              {projectTitle && <p className="mt-1 truncate text-[11px] text-muted-foreground">{projectTitle}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setShowGrid((value) => !value)} className={cn("inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium", showGrid ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border text-muted-foreground")}><Grid3X3 className="h-3.5 w-3.5" />Grid</button>
            <button type="button" onClick={() => setSnapEnabled((value) => !value)} className={cn("inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium", snapEnabled ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border text-muted-foreground")}><Move className="h-3.5 w-3.5" />Smart snap</button>
            <button type="button" onClick={() => setShowSafeArea((value) => !value)} className={cn("inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium", showSafeArea ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border text-muted-foreground")}><ShieldCheck className="h-3.5 w-3.5" />Safe area</button>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />Recarregar</button>
            <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="inline-flex h-9 items-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"><Save className="h-3.5 w-3.5" />{saving ? "Salvando…" : dirty ? "Salvar e aplicar" : "Salvo"}</button>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[250px_minmax(0,1fr)_310px]">
        <aside className="border-b border-border p-3 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-2 px-1"><div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-violet-500" /><p className="text-xs font-semibold text-foreground">Layers</p></div><span className="text-[10px] text-muted-foreground">{layers.length}</span></div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button type="button" onClick={groupSelected} disabled={selectedIds.length < 2} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-border text-[10px] text-muted-foreground disabled:opacity-35"><Group className="h-3.5 w-3.5" />Agrupar</button>
            <button type="button" onClick={ungroupSelected} disabled={!selectedIds.length} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-border text-[10px] text-muted-foreground disabled:opacity-35"><Ungroup className="h-3.5 w-3.5" />Desagrupar</button>
          </div>
          <div className="mt-3 max-h-[420px] space-y-1 overflow-auto pr-1">
            {[...layers].reverse().map((layer) => {
              const index = layers.findIndex((item) => item.id === layer.id);
              const active = selectedIds.includes(layer.id);
              return (
                <button key={layer.id} type="button" onClick={(event) => selectLayer(event, layer)} className={cn("flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition", active ? "border-violet-500/35 bg-violet-500/[0.08]" : "border-transparent hover:bg-muted/60")}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{layer.locked ? <Lock className="h-3.5 w-3.5" /> : layer.shapeKind === "circle" ? <Circle className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold text-foreground">{layer.name}</span><span className="block truncate text-[9px] text-muted-foreground">{layerLabel(layer)} · z {index + 1}{layer.groupId ? " · grupo" : ""}</span></span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 border-t border-border pt-3"><p className="px-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Adicionar forma</p><div className="mt-2 grid grid-cols-2 gap-1.5">{(["rectangle", "pill", "circle", "line"] as ShapeKind[]).map((shape) => <button key={shape} type="button" onClick={() => addShape(shape)} className="h-8 rounded-lg border border-border text-[10px] font-medium text-muted-foreground hover:bg-muted">{shape}</button>)}</div></div>
        </aside>

        <div className="min-w-0 bg-muted/20 p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-sm font-semibold text-foreground">Prancheta · {ratio}</p><p className="text-xs text-muted-foreground">Shift/Ctrl/Cmd + clique seleciona múltiplos. Smart guides usam bordas e centros dos objetos.</p></div>
            <div className="flex flex-wrap gap-1.5">{RATIOS.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => adaptToRatio(item.id)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold", ratio === item.id ? "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border bg-card text-muted-foreground hover:text-foreground")}><Icon className="h-3.5 w-3.5" />{item.label}</button>; })}</div>
          </div>

          <div className="mb-3 grid gap-2 md:grid-cols-4">{PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => applyPreset(preset.id)} className="rounded-xl border border-border bg-card px-3 py-2 text-left hover:border-violet-500/30"><span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground"><WandSparkles className="h-3.5 w-3.5 text-violet-500" />{preset.label}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">{preset.hint}</span></button>)}</div>

          <div ref={stageRef} onPointerMove={onPointerMove} onPointerUp={finishGesture} onPointerCancel={finishGesture} onPointerLeave={(event) => { if (event.buttons === 0) finishGesture(); }} onPointerDown={() => setSelectedIds([])} className="relative mx-auto w-full touch-none overflow-hidden bg-black shadow-[0_24px_70px_rgba(0,0,0,.22)]" style={{ aspectRatio: aspectRatio(ratio), maxHeight: 680, borderRadius: 18 }}>
            {backgroundClip?.url ? <video src={backgroundClip.url} muted playsInline loop autoPlay className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-black" />}
            <div className="absolute inset-0 bg-black/20" />
            {showGrid && <div className="pointer-events-none absolute inset-0 z-10 opacity-25" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.45) 1px, transparent 1px)", backgroundSize: "10% 10%" }} />}
            {showGrid && <><div className="pointer-events-none absolute left-1/2 top-0 z-10 h-full w-px bg-violet-300/60" /><div className="pointer-events-none absolute left-0 top-1/2 z-10 h-px w-full bg-violet-300/60" /></>}
            {showSafeArea && <div className="pointer-events-none absolute z-20 border border-dashed border-emerald-300/70" style={{ inset: `${safeArea}%` }}><span className="absolute -top-5 left-0 text-[8px] font-semibold uppercase tracking-[0.16em] text-emerald-200">safe area</span></div>}
            {smartGuides.x.map((guide) => <div key={`x-${guide}`} className="pointer-events-none absolute top-0 z-[60] h-full w-px bg-fuchsia-300" style={{ left: `${guide}%` }} />)}
            {smartGuides.y.map((guide) => <div key={`y-${guide}`} className="pointer-events-none absolute left-0 z-[60] h-px w-full bg-fuchsia-300" style={{ top: `${guide}%` }} />)}

            {layers.map((layer, index) => {
              const active = selectedIds.includes(layer.id);
              const fontFamily = layer.fontFamily ? `"${layer.fontFamily}", Inter, Arial, sans-serif` : "var(--vendor-creative-font, Inter, Arial, sans-serif)";
              const shapeHeight = layer.shapeKind === "line" ? 4 : layer.shapeKind === "circle" ? undefined : 54;
              return (
                <div key={layer.id} onPointerDown={(event) => { selectLayer(event, layer); beginGesture(event, layer, "move"); }} className={cn("absolute z-30 cursor-move select-none", active && "outline outline-2 outline-violet-400 outline-offset-2", layer.locked && "cursor-not-allowed")} style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, opacity: layer.opacity, transform: `rotate(${layer.rotation}deg) scale(${layer.scale})`, transformOrigin: "top left", zIndex: 30 + index, textAlign: layer.textAlign, filter: layer.shadowPreset === "glow" ? "drop-shadow(0 0 12px rgba(139,92,246,.55))" : undefined }}>
                  {layer.type === "image" && layer.url ? (
                    <div className="w-full overflow-hidden" style={{ borderRadius: maskRadius(layer), boxShadow: shadowValue(layer.shadowPreset), border: layer.borderWidth ? `${layer.borderWidth}px solid ${layer.borderColor ?? "#fff"}` : undefined }}><img src={layer.url} alt="" draggable={false} className="block w-full" style={{ aspectRatio: layer.maskShape === "circle" ? "1 / 1" : undefined, objectFit: layer.imageFit ?? "contain", objectPosition: `${layer.imagePositionX ?? 50}% ${layer.imagePositionY ?? 50}%`, transform: `scale(${layer.imageZoom ?? 1})` }} /></div>
                  ) : layer.shapeKind ? (
                    <div className="w-full" style={{ height: layer.shapeKind === "circle" ? undefined : shapeHeight, aspectRatio: layer.shapeKind === "circle" ? "1 / 1" : undefined, background: layerBackground(layer), borderRadius: maskRadius(layer), border: layer.borderWidth ? `${layer.borderWidth}px solid ${layer.borderColor ?? "#fff"}` : undefined, boxShadow: shadowValue(layer.shadowPreset) }} />
                  ) : (
                    <div style={{ color: layer.color, background: layerBackground(layer), fontFamily, fontWeight: layer.fontWeight ?? 700, fontSize: `clamp(12px, ${Math.max(1.05, layer.fontSize / 18)}vw, ${layer.fontSize}px)`, lineHeight: 1.04, padding: layer.background && layer.background !== "transparent" ? "0.42em 0.62em" : undefined, borderRadius: maskRadius(layer), border: layer.borderWidth ? `${layer.borderWidth}px solid ${layer.borderColor ?? "#fff"}` : undefined, boxShadow: shadowValue(layer.shadowPreset) }}>{layer.text || layer.name}</div>
                  )}
                  {active && !layer.locked && selectedIds.length === 1 && <button type="button" aria-label="Redimensionar layer" onPointerDown={(event) => beginGesture(event, layer, "resize")} className="absolute -bottom-3 -right-3 z-50 flex h-6 w-6 cursor-se-resize items-center justify-center rounded-full border-2 border-white bg-violet-600 shadow"><span className="h-2 w-2 rounded-sm bg-white" /></button>}
                  {active && layer.locked && <span className="absolute -right-2 -top-2 z-50 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white"><Lock className="h-3 w-3" /></span>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground"><span>Shift/Ctrl/Cmd + clique: multiseleção</span><span>•</span><span>Setas: mover</span><span>•</span><span>Ctrl/Cmd + D: duplicar</span><span>•</span><span>Delete: excluir</span></div>
        </div>

        <aside className="border-t border-border p-4 xl:border-l xl:border-t-0">
          {selectedLayers.length ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{selectedLayers.length > 1 ? `${selectedLayers.length} layers selecionadas` : primary?.name}</p><p className="text-[10px] text-muted-foreground">{selectedLayers.length > 1 ? "Edição em grupo" : primary ? layerLabel(primary) : ""}</p></div>{primary && selectedLayers.length === 1 && <button type="button" onClick={() => updateLayer(primary.id, { locked: !primary.locked })} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground">{primary.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}</button>}</div>

              <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Alinhar e distribuir</p><div className="grid grid-cols-3 gap-1.5"><button type="button" onClick={() => alignSelection("left")} className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground"><AlignLeft className="h-4 w-4" /></button><button type="button" onClick={() => alignSelection("center")} className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground"><AlignCenter className="h-4 w-4" /></button><button type="button" onClick={() => alignSelection("right")} className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground"><AlignRight className="h-4 w-4" /></button><button type="button" onClick={() => distribute("horizontal")} disabled={selectedLayers.length < 3} className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground disabled:opacity-35"><AlignHorizontalDistributeCenter className="h-4 w-4" /></button><button type="button" onClick={() => alignSelection("middle")} className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground"><BoxSelect className="h-4 w-4" /></button><button type="button" onClick={() => distribute("vertical")} disabled={selectedLayers.length < 3} className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground disabled:opacity-35"><AlignVerticalDistributeCenter className="h-4 w-4" /></button></div></div>

              {primary && selectedLayers.length === 1 && <>
                <div className="grid grid-cols-2 gap-2">{(["x", "y", "width", "fontSize", "rotation", "opacity"] as const).map((field) => <label key={field} className="space-y-1"><span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{field === "fontSize" ? "fonte" : field}</span><input type="number" step={field === "opacity" ? 0.05 : 0.5} min={field === "opacity" ? 0 : undefined} max={field === "opacity" ? 1 : undefined} disabled={primary.locked} value={Number(primary[field].toFixed(field === "opacity" ? 2 : 1))} onChange={(event) => updateLayer(primary.id, { [field]: Number(event.target.value) } as Partial<GraphicLayer>)} className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-violet-500/40 disabled:opacity-50" /></label>)}</div>
                {primary.type !== "image" && !primary.shapeKind && <label className="block space-y-1"><span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Texto</span><textarea disabled={primary.locked} value={primary.text} onChange={(event) => updateLayer(primary.id, { text: event.target.value })} rows={3} className="w-full resize-y rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-violet-500/40 disabled:opacity-50" /></label>}
                <div className="rounded-xl border border-border p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Efeitos</p><div className="mt-2 grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-[9px] text-muted-foreground">Sombra</span><select value={primary.shadowPreset ?? "none"} onChange={(event) => updateLayer(primary.id, { shadowPreset: event.target.value as ShadowPreset })} className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[10px]"><option value="none">Nenhuma</option><option value="soft">Suave</option><option value="strong">Forte</option><option value="glow">Glow</option></select></label><label className="space-y-1"><span className="text-[9px] text-muted-foreground">Máscara</span><select value={primary.maskShape ?? "none"} onChange={(event) => updateLayer(primary.id, { maskShape: event.target.value as MaskShape })} className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[10px]"><option value="none">Nenhuma</option><option value="rounded">Arredondada</option><option value="circle">Circular</option></select></label></div><div className="mt-2 grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-[9px] text-muted-foreground">Raio</span><input type="number" value={primary.borderRadius ?? 0} onChange={(event) => updateLayer(primary.id, { borderRadius: Number(event.target.value) })} className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[10px]" /></label><label className="space-y-1"><span className="text-[9px] text-muted-foreground">Borda px</span><input type="number" min={0} max={12} value={primary.borderWidth ?? 0} onChange={(event) => updateLayer(primary.id, { borderWidth: Number(event.target.value) })} className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[10px]" /></label></div></div>
                {primary.type === "image" && <div className="rounded-xl border border-border p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Crop da imagem</p><div className="mt-2 grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-[9px] text-muted-foreground">Fit</span><select value={primary.imageFit ?? "contain"} onChange={(event) => updateLayer(primary.id, { imageFit: event.target.value as "contain" | "cover" })} className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[10px]"><option value="contain">Conter</option><option value="cover">Cobrir</option></select></label><label className="space-y-1"><span className="text-[9px] text-muted-foreground">Zoom</span><input type="number" min={0.5} max={3} step={0.05} value={primary.imageZoom ?? 1} onChange={(event) => updateLayer(primary.id, { imageZoom: Number(event.target.value) })} className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[10px]" /></label><label className="space-y-1"><span className="text-[9px] text-muted-foreground">Posição X</span><input type="range" min={0} max={100} value={primary.imagePositionX ?? 50} onChange={(event) => updateLayer(primary.id, { imagePositionX: Number(event.target.value) })} className="w-full" /></label><label className="space-y-1"><span className="text-[9px] text-muted-foreground">Posição Y</span><input type="range" min={0} max={100} value={primary.imagePositionY ?? 50} onChange={(event) => updateLayer(primary.id, { imagePositionY: Number(event.target.value) })} className="w-full" /></label></div></div>}
                <div className="grid grid-cols-4 gap-1.5"><button type="button" onClick={() => reorderPrimary(1)} title="Trazer para frente" className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground"><ChevronUp className="h-4 w-4" /></button><button type="button" onClick={() => reorderPrimary(-1)} title="Enviar para trás" className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground"><ChevronDown className="h-4 w-4" /></button><button type="button" onClick={duplicateSelected} title="Duplicar" className="flex h-9 items-center justify-center rounded-lg border border-border text-muted-foreground"><Copy className="h-4 w-4" /></button><button type="button" onClick={removeSelected} title="Excluir" className="flex h-9 items-center justify-center rounded-lg border border-red-500/20 text-red-500 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button></div>
              </>}

              {selectedLayers.length > 1 && <div className="grid grid-cols-2 gap-2"><button type="button" onClick={groupSelected} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border text-xs text-muted-foreground"><Group className="h-4 w-4" />Agrupar</button><button type="button" onClick={duplicateSelected} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border text-xs text-muted-foreground"><Copy className="h-4 w-4" />Duplicar</button></div>}

              <div className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Direção visual</p><p className="mt-1 text-xs font-medium text-foreground">{String(context?.graphicDesign?.directionName ?? "Direção aprovada")}</p><div className="mt-2 flex flex-wrap gap-1">{palette.map((color) => <span key={color} className="h-5 w-5 rounded-md border border-border" style={{ background: color }} title={color} />)}</div>{Number(context?.graphicDesign?.designScore ?? 0) > 0 && <p className="mt-2 text-[10px] text-muted-foreground">Design Score {Number(context?.graphicDesign?.designScore)}/100</p>}</div>
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-border px-4 text-center"><Move className="h-5 w-5 text-muted-foreground" /><p className="mt-2 text-xs font-semibold text-foreground">Selecione uma ou mais layers</p><p className="mt-1 text-[10px] text-muted-foreground">Use Shift/Ctrl/Cmd para multiseleção e depois alinhe, distribua ou agrupe.</p></div>
          )}
        </aside>
      </div>
    </section>
  );
}
