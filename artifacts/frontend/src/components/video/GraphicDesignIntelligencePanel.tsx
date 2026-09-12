import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  LayoutTemplate,
  Loader2,
  Monitor,
  Palette,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Type,
  WandSparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  buildGraphicDesignPlan,
  graphicFormatForChannel,
  type GraphicDesignPlan,
  type GraphicDirectionId,
  type GraphicLayoutId,
} from "@workspace/vendor-brain/graphic-design-director";

const DESIGN_PLAN_KEY = "vendorai_graphic_design_plan_v1";

type StoredDesignPlan = {
  tenantId: string;
  approvedAt: string;
  source: "graphic-design-director";
  brief: {
    product: string;
    headline: string;
    supportingText: string;
    cta: string;
    channel: string;
    directionId: GraphicDirectionId;
    brandColor: string;
  };
  plan: GraphicDesignPlan;
};

type BrandGuardianConfig = {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  headingFont: string;
  bodyFont: string;
  safeAreaPct: number;
  minDesignScore: number;
  minSceneScore: number;
  maxHeadlineChars: number;
  maxSupportingChars: number;
  lockColors: boolean;
  lockTypography: boolean;
};

type BrandKitRow = {
  logo_asset_id?: string | null;
  visual_config?: Record<string, unknown> | null;
};

type AuditResult = {
  overall: number;
  passed: boolean;
  metrics: Array<{ id: string; label: string; score: number }>;
  blockers: string[];
  recommendations: string[];
};

type VariantRecipe = {
  id: string;
  label: string;
  description: string;
  directionId: GraphicDirectionId;
  layouts: [GraphicLayoutId, GraphicLayoutId, GraphicLayoutId];
};

const DEFAULT_GUARDIAN: BrandGuardianConfig = {
  primaryColor: "#F97316",
  accentColor: "#111827",
  backgroundColor: "#FFFFFF",
  headingFont: "Inter",
  bodyFont: "Inter",
  safeAreaPct: 7,
  minDesignScore: 88,
  minSceneScore: 82,
  maxHeadlineChars: 80,
  maxSupportingChars: 150,
  lockColors: true,
  lockTypography: true,
};

const VARIANTS: VariantRecipe[] = [
  { id: "impact", label: "Impacto", description: "Headline dominante, contraste alto e CTA direto.", directionId: "performance-bold", layouts: ["poster", "split-left", "center-hero"] },
  { id: "editorial", label: "Editorial", description: "Espaço negativo, assimetria e leitura premium.", directionId: "premium-editorial", layouts: ["editorial-asym", "split-right", "lower-third"] },
  { id: "product", label: "Produto", description: "Mídia em destaque, prova e hierarquia comercial limpa.", directionId: "product-clean", layouts: ["split-left", "lower-third", "split-right"] },
  { id: "minimal", label: "Minimal", description: "Baixa densidade visual, respiro e autoridade.", directionId: "authority-minimal", layouts: ["center-hero", "lower-third", "split-right"] },
];

const CHANNELS = [
  { id: "reels", label: "Reels / TikTok", channel: "Instagram / Reels", hint: "9:16 · leitura rápida", icon: Smartphone },
  { id: "feed", label: "Feed", channel: "Feed 4:5", hint: "4:5 · presença no feed", icon: Smartphone },
  { id: "youtube", label: "YouTube / Site", channel: "YouTube", hint: "16:9 · composição horizontal", icon: Monitor },
  { id: "square", label: "Quadrado", channel: "Instagram 1:1", hint: "1:1 · peça versátil", icon: Square },
] as const;

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[], fallback = 0) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

function validHex(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : fallback;
}

function validText(value: unknown, fallback: string, max = 120) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized.slice(0, max) : fallback;
}

function validNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
}

function parseStoredPlan(raw: string | null, tenantId: string): StoredDesignPlan | null {
  if (!raw || !tenantId) return null;
  try {
    const parsed = JSON.parse(raw) as StoredDesignPlan;
    if (parsed?.tenantId !== tenantId || parsed?.source !== "graphic-design-director" || !parsed.plan?.approved) return null;
    return parsed;
  } catch {
    return null;
  }
}

function seedGuardian(plan: GraphicDesignPlan | null): BrandGuardianConfig {
  if (!plan) return DEFAULT_GUARDIAN;
  return {
    ...DEFAULT_GUARDIAN,
    primaryColor: validHex(plan.palette?.[0], DEFAULT_GUARDIAN.primaryColor),
    accentColor: validHex(plan.palette?.[1], DEFAULT_GUARDIAN.accentColor),
    backgroundColor: validHex(plan.palette?.[3], DEFAULT_GUARDIAN.backgroundColor),
    headingFont: plan.typography?.headingFamily || DEFAULT_GUARDIAN.headingFont,
    bodyFont: plan.typography?.bodyFamily || DEFAULT_GUARDIAN.bodyFont,
    safeAreaPct: Math.max(DEFAULT_GUARDIAN.safeAreaPct, Number(plan.safeAreaPct || 0)),
  };
}

function normalizeGuardian(value: unknown, fallback: BrandGuardianConfig): BrandGuardianConfig {
  const source = asRecord(value);
  return {
    primaryColor: validHex(source.primaryColor, fallback.primaryColor),
    accentColor: validHex(source.accentColor, fallback.accentColor),
    backgroundColor: validHex(source.backgroundColor, fallback.backgroundColor),
    headingFont: validText(source.headingFont, fallback.headingFont, 100),
    bodyFont: validText(source.bodyFont, fallback.bodyFont, 100),
    safeAreaPct: validNumber(source.safeAreaPct, fallback.safeAreaPct, 4, 14),
    minDesignScore: validNumber(source.minDesignScore, fallback.minDesignScore, 75, 98),
    minSceneScore: validNumber(source.minSceneScore, fallback.minSceneScore, 70, 96),
    maxHeadlineChars: validNumber(source.maxHeadlineChars, fallback.maxHeadlineChars, 40, 140),
    maxSupportingChars: validNumber(source.maxSupportingChars, fallback.maxSupportingChars, 80, 260),
    lockColors: typeof source.lockColors === "boolean" ? source.lockColors : fallback.lockColors,
    lockTypography: typeof source.lockTypography === "boolean" ? source.lockTypography : fallback.lockTypography,
  };
}

function auditPlan(plan: GraphicDesignPlan, guardian: BrandGuardianConfig, logoReady: boolean, channel: string): AuditResult {
  const palette = plan.palette.map((color) => color.toUpperCase());
  const primaryMatch = palette.includes(guardian.primaryColor.toUpperCase());
  const accentMatch = palette.includes(guardian.accentColor.toUpperCase());
  const headingMatch = plan.typography.headingFamily.trim().toLowerCase() === guardian.headingFont.trim().toLowerCase();
  const bodyMatch = plan.typography.bodyFamily.trim().toLowerCase() === guardian.bodyFont.trim().toLowerCase();
  const minScene = plan.scenes.length ? Math.min(...plan.scenes.map((scene) => scene.score)) : 0;
  const longHeadlines = plan.scenes.filter((scene) => scene.headline.length > guardian.maxHeadlineChars);
  const denseSupporting = plan.scenes.filter((scene) => scene.supportingText.length > guardian.maxSupportingChars);
  const expectedFormat = channel.toLowerCase().includes("1:1") ? "1:1" : graphicFormatForChannel(channel);

  const colorScore = guardian.lockColors ? Math.round((primaryMatch ? 100 : 48) * 0.65 + (accentMatch ? 100 : 62) * 0.35) : 100;
  const typographyScore = guardian.lockTypography ? Math.round(((headingMatch ? 100 : 55) + (bodyMatch ? 100 : 65)) / 2) : 100;
  const brandScore = Math.round(colorScore * 0.58 + typographyScore * 0.32 + (logoReady ? 100 : 72) * 0.10);
  const hierarchyScore = Math.round(average(plan.scenes.map((scene) => scene.scores.hierarchy)));
  const contrastScore = Math.round(average(plan.scenes.map((scene) => scene.scores.contrast)));
  const compositionScore = Math.round(average(plan.scenes.flatMap((scene) => [scene.scores.balance, scene.scores.density, scene.scores.safeArea])));
  const readabilityScore = clamp(Math.round(average(plan.scenes.map((scene) => scene.score)) - longHeadlines.length * 10 - denseSupporting.length * 8), 0, 100);
  const channelScore = Math.round((plan.format === expectedFormat ? 100 : 58) * 0.62 + (plan.safeAreaPct >= guardian.safeAreaPct ? 100 : 60) * 0.38);
  const overall = Math.round(brandScore * 0.26 + readabilityScore * 0.20 + hierarchyScore * 0.15 + contrastScore * 0.14 + compositionScore * 0.15 + channelScore * 0.10);

  const blockers: string[] = [];
  const recommendations: string[] = [];
  if (plan.overallScore < guardian.minDesignScore) blockers.push(`Design Score ${plan.overallScore}/100 abaixo do padrão ${guardian.minDesignScore}.`);
  if (minScene < guardian.minSceneScore) blockers.push(`Existe cena com ${minScene}/100; mínimo da marca é ${guardian.minSceneScore}.`);
  if (guardian.lockColors && !primaryMatch) blockers.push("A cor primária da marca não está presente na paleta.");
  if (guardian.lockTypography && (!headingMatch || !bodyMatch)) blockers.push("A tipografia aprovada da marca não está sendo respeitada.");
  if (plan.safeAreaPct < guardian.safeAreaPct) blockers.push(`Safe area precisa ser de pelo menos ${guardian.safeAreaPct}%.`);
  if (longHeadlines.length) blockers.push(`${longHeadlines.length} headline(s) excedem ${guardian.maxHeadlineChars} caracteres.`);
  if (!logoReady) recommendations.push("Cadastre o logo no Brand Video Kit para assinatura visual automática.");
  if (denseSupporting.length) recommendations.push(`Reduza o texto de apoio em ${denseSupporting.length} cena(s).`);
  if (plan.format !== expectedFormat) recommendations.push(`Recomponha para ${expectedFormat} em vez de apenas recortar.`);
  if (guardian.lockColors && !accentMatch) recommendations.push("Use a cor de acento aprovada em CTA, selo ou detalhe gráfico.");
  if (!blockers.length && !recommendations.length) recommendations.push("Direção consistente. Pode seguir para Canvas, motion e render final.");

  return {
    overall,
    passed: overall >= guardian.minDesignScore && blockers.length === 0,
    metrics: [
      { id: "brand", label: "Marca", score: brandScore },
      { id: "readability", label: "Legibilidade", score: readabilityScore },
      { id: "hierarchy", label: "Hierarquia", score: hierarchyScore },
      { id: "contrast", label: "Contraste", score: contrastScore },
      { id: "composition", label: "Composição", score: compositionScore },
      { id: "channel", label: "Canal", score: channelScore },
    ],
    blockers,
    recommendations,
  };
}

function profileFor(directionId: GraphicDirectionId) {
  if (directionId === "product-clean") return "product";
  if (directionId === "premium-editorial") return "institutional";
  if (directionId === "architecture-luxury") return "architecture";
  if (directionId === "authority-minimal") return "educational";
  if (directionId === "tech-modern") return "technology";
  return "performance";
}

function createPlan(stored: StoredDesignPlan, guardian: BrandGuardianConfig, directionId: GraphicDirectionId, channel: string, layouts?: [GraphicLayoutId, GraphicLayoutId, GraphicLayoutId]) {
  const layoutOverrides = layouts ? Object.fromEntries(layouts.map((layout, index) => [index, layout])) as Partial<Record<number, GraphicLayoutId>> : undefined;
  const format = channel.toLowerCase().includes("1:1") ? "1:1" : graphicFormatForChannel(channel);
  const built = buildGraphicDesignPlan({
    directionId,
    channel,
    format,
    profile: profileFor(directionId),
    brandColors: [guardian.primaryColor, guardian.accentColor],
    tags: [stored.brief.product, stored.brief.headline, directionId].join(" ").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 10),
    layoutOverrides,
    scenes: stored.plan.scenes.map((scene) => ({ headline: scene.headline, supportingText: scene.supportingText, cta: scene.cta, hasMedia: true })),
  });
  return {
    ...built,
    palette: guardian.lockColors ? [guardian.primaryColor, guardian.accentColor, guardian.backgroundColor, built.palette[3]] : built.palette,
    typography: guardian.lockTypography ? { headingFamily: guardian.headingFont, bodyFamily: guardian.bodyFont } : built.typography,
    scenes: guardian.lockTypography ? built.scenes.map((scene) => ({ ...scene, headlineFont: guardian.headingFont, bodyFont: guardian.bodyFont })) : built.scenes,
  } as GraphicDesignPlan;
}

function scoreClass(score: number) {
  if (score >= 92) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (score >= 85) return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  if (score >= 75) return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
}

function MiniPlanPreview({ plan }: { plan: GraphicDesignPlan }) {
  const scene = plan.scenes[0];
  if (!scene) return <div className="aspect-[9/16] rounded-xl bg-muted" />;
  const ratio = plan.format === "16:9" ? "16 / 9" : plan.format === "4:5" ? "4 / 5" : plan.format === "1:1" ? "1 / 1" : "9 / 16";
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 shadow-inner" style={{ aspectRatio: ratio, background: `linear-gradient(135deg, ${plan.palette[0]}, ${plan.palette[1]})` }}>
      <div className="absolute inset-0 bg-black/20" />
      <div className="absolute rounded bg-white/20" style={{ left: `${scene.layout.logo.x}%`, top: `${scene.layout.logo.y}%`, width: `${Math.min(18, scene.layout.logo.width)}%`, height: "4%" }} />
      <div className="absolute space-y-1.5" style={{ left: `${scene.layout.headline.x}%`, top: `${scene.layout.headline.y}%`, width: `${scene.layout.headline.width}%` }}><div className="h-2.5 rounded-sm bg-white/95" /><div className="h-2.5 w-4/5 rounded-sm bg-white/80" /><div className="mt-2 h-1.5 w-3/5 rounded-sm bg-white/45" /></div>
      <div className="absolute rounded-md" style={{ left: `${scene.layout.cta.x}%`, top: `${scene.layout.cta.y}%`, width: `${Math.max(18, Math.min(42, scene.layout.cta.width))}%`, height: "7%", background: plan.palette[1] }} />
    </div>
  );
}

export default function GraphicDesignIntelligencePanel() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const lastRaw = useRef("");
  const [stored, setStored] = useState<StoredDesignPlan | null>(null);
  const [guardian, setGuardian] = useState<BrandGuardianConfig>(DEFAULT_GUARDIAN);
  const [brandKit, setBrandKit] = useState<BrandKitRow | null>(null);
  const [visualConfig, setVisualConfig] = useState<Record<string, unknown>>({});
  const [guardianPersisted, setGuardianPersisted] = useState(false);
  const [savingGuardian, setSavingGuardian] = useState(false);
  const [loadingBrand, setLoadingBrand] = useState(false);

  const refreshStoredPlan = useCallback(() => {
    const raw = sessionStorage.getItem(DESIGN_PLAN_KEY) ?? "";
    if (raw === lastRaw.current) return;
    lastRaw.current = raw;
    setStored(parseStoredPlan(raw || null, tenantId));
  }, [tenantId]);

  useEffect(() => {
    lastRaw.current = "";
    refreshStoredPlan();
    const timer = window.setInterval(refreshStoredPlan, 850);
    const onPlan = () => { lastRaw.current = ""; refreshStoredPlan(); };
    window.addEventListener("vendorai:graphic-design-plan-updated", onPlan);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("vendorai:graphic-design-plan-updated", onPlan);
    };
  }, [refreshStoredPlan]);

  const loadBrand = useCallback(async () => {
    if (!tenantId) return;
    setLoadingBrand(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/brand-kit`, { headers: authHeaders(), credentials: "include" });
      const data = await response.json().catch(() => ({})) as { brandKit?: BrandKitRow | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar padrão visual da marca");
      const kit = data.brandKit ?? null;
      const visual = asRecord(kit?.visual_config);
      const rawGuardian = asRecord(visual.graphicBrandGuardian);
      const persisted = Object.keys(rawGuardian).length > 0;
      setBrandKit(kit);
      setVisualConfig(visual);
      setGuardian(normalizeGuardian(rawGuardian, seedGuardian(stored?.plan ?? null)));
      setGuardianPersisted(persisted);
    } catch (error) {
      toast({ title: "Brand Guardian indisponível", description: error instanceof Error ? error.message : "Falha ao carregar marca", variant: "destructive" });
    } finally {
      setLoadingBrand(false);
    }
  }, [tenantId, toast]);

  useEffect(() => { void loadBrand(); }, [loadBrand]);
  useEffect(() => { if (!guardianPersisted && stored?.plan) setGuardian(seedGuardian(stored.plan)); }, [guardianPersisted, stored?.approvedAt]);

  const currentAudit = useMemo(() => stored ? auditPlan(stored.plan, guardian, Boolean(brandKit?.logo_asset_id), stored.brief.channel) : null, [brandKit?.logo_asset_id, guardian, stored]);
  const variantPlans = useMemo(() => stored ? VARIANTS.map((recipe) => { const plan = createPlan(stored, guardian, recipe.directionId, stored.brief.channel, recipe.layouts); return { recipe, plan, audit: auditPlan(plan, guardian, Boolean(brandKit?.logo_asset_id), stored.brief.channel) }; }) : [], [brandKit?.logo_asset_id, guardian, stored]);
  const channelPlans = useMemo(() => stored ? CHANNELS.map((recipe) => { const plan = createPlan(stored, guardian, stored.plan.directionId, recipe.channel); return { recipe, plan, audit: auditPlan(plan, guardian, Boolean(brandKit?.logo_asset_id), recipe.channel) }; }) : [], [brandKit?.logo_asset_id, guardian, stored]);

  const saveGuardian = async () => {
    if (!tenantId) return;
    setSavingGuardian(true);
    try {
      const nextVisual = { ...visualConfig, graphicBrandGuardian: guardian };
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/brand-kit`, { method: "PUT", credentials: "include", headers: authHeaders(true), body: JSON.stringify({ visualConfig: nextVisual }) });
      const data = await response.json().catch(() => ({})) as { brandKit?: BrandKitRow; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Falha ao salvar padrão visual");
      setBrandKit(data.brandKit ?? brandKit);
      setVisualConfig(nextVisual);
      setGuardianPersisted(true);
      toast({ title: "Brand Guardian salvo", description: "Paleta, tipografia, safe area e gates de qualidade agora são regras permanentes do tenant." });
    } catch (error) {
      toast({ title: "Não foi possível salvar o Brand Guardian", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSavingGuardian(false);
    }
  };

  const applyPlan = (plan: GraphicDesignPlan, channel: string, audit: AuditResult, label: string) => {
    if (!stored) return;
    if (!audit.passed) {
      toast({ title: "Direção bloqueada pelo Brand Guardian", description: audit.blockers[0] ?? `A direção precisa atingir ${guardian.minDesignScore}/100.` });
      return;
    }
    const next: StoredDesignPlan = {
      ...stored,
      approvedAt: new Date().toISOString(),
      brief: { ...stored.brief, channel, directionId: plan.directionId, brandColor: guardian.primaryColor },
      plan: { ...plan, approved: true },
    };
    const raw = JSON.stringify(next);
    sessionStorage.setItem(DESIGN_PLAN_KEY, raw);
    lastRaw.current = raw;
    setStored(next);
    window.dispatchEvent(new CustomEvent("vendorai:graphic-design-plan-updated", { detail: { label, channel } }));
    toast({ title: `${label} aplicado`, description: "A direção aprovada foi atualizada e já pode seguir para Canvas e Timeline." });
  };

  if (!stored) {
    return <section className="rounded-3xl border border-dashed border-violet-500/25 bg-violet-500/[0.03] p-5 sm:p-6"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><ShieldCheck className="h-5 w-5" /></div><div><p className="font-semibold text-foreground">Brand Guardian + Design Intelligence</p><p className="mt-1 text-sm text-muted-foreground">Aprove uma direção de arte acima para liberar governança de marca, variações profissionais e adaptação inteligente por canal.</p></div></div></section>;
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-violet-500/20 bg-card shadow-sm" data-testid="graphic-design-intelligence">
      <div className="border-b border-border bg-gradient-to-r from-violet-500/[0.10] via-card to-card px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><BadgeCheck className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-foreground">Brand Guardian + Design Intelligence</h2><span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">Agency-grade gate</span></div><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Regras permanentes da marca, score rigoroso, quatro composições reais e recomposição automática para cada canal.</p></div></div><button type="button" onClick={() => void loadBrand()} disabled={loadingBrand} className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40">{loadingBrand ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Atualizar marca</button></div>
      </div>

      <div className="grid xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="border-b border-border p-5 xl:border-b-0 xl:border-r sm:p-6">
          <div className="flex items-center gap-2"><Palette className="h-4 w-4 text-violet-500" /><p className="text-sm font-semibold text-foreground">Regras da marca</p></div><p className="mt-1 text-xs text-muted-foreground">Persistidas no Brand Video Kit.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">{([["primaryColor", "Primária"], ["accentColor", "Acento"], ["backgroundColor", "Fundo"]] as const).map(([key, label]) => <label key={key} className="space-y-1"><span className="text-[10px] text-muted-foreground">{label}</span><input type="color" value={guardian[key]} onChange={(event) => setGuardian((current) => ({ ...current, [key]: event.target.value.toUpperCase() }))} className="h-10 w-full rounded-lg border border-border bg-background p-1" /></label>)}</div>
          <div className="mt-4 space-y-2"><label className="block space-y-1"><span className="text-[10px] text-muted-foreground">Fonte headline</span><input value={guardian.headingFont} onChange={(event) => setGuardian((current) => ({ ...current, headingFont: event.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs" /></label><label className="block space-y-1"><span className="text-[10px] text-muted-foreground">Fonte corpo</span><input value={guardian.bodyFont} onChange={(event) => setGuardian((current) => ({ ...current, bodyFont: event.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs" /></label></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-[10px] text-muted-foreground">Design mínimo</span><input type="number" value={guardian.minDesignScore} min={75} max={98} onChange={(event) => setGuardian((current) => ({ ...current, minDesignScore: validNumber(event.target.value, current.minDesignScore, 75, 98) }))} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs" /></label><label className="space-y-1"><span className="text-[10px] text-muted-foreground">Cena mínima</span><input type="number" value={guardian.minSceneScore} min={70} max={96} onChange={(event) => setGuardian((current) => ({ ...current, minSceneScore: validNumber(event.target.value, current.minSceneScore, 70, 96) }))} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs" /></label><label className="space-y-1"><span className="text-[10px] text-muted-foreground">Safe area %</span><input type="number" value={guardian.safeAreaPct} min={4} max={14} onChange={(event) => setGuardian((current) => ({ ...current, safeAreaPct: validNumber(event.target.value, current.safeAreaPct, 4, 14) }))} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs" /></label><label className="space-y-1"><span className="text-[10px] text-muted-foreground">Headline máx.</span><input type="number" value={guardian.maxHeadlineChars} min={40} max={140} onChange={(event) => setGuardian((current) => ({ ...current, maxHeadlineChars: validNumber(event.target.value, current.maxHeadlineChars, 40, 140) }))} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs" /></label></div>
          <div className="mt-4 space-y-2 rounded-xl border border-border bg-muted/30 p-3"><label className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-muted-foreground"><Palette className="h-3.5 w-3.5" />Travar paleta</span><input type="checkbox" checked={guardian.lockColors} onChange={(event) => setGuardian((current) => ({ ...current, lockColors: event.target.checked }))} /></label><label className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-muted-foreground"><Type className="h-3.5 w-3.5" />Travar tipografia</span><input type="checkbox" checked={guardian.lockTypography} onChange={(event) => setGuardian((current) => ({ ...current, lockTypography: event.target.checked }))} /></label></div>
          <button type="button" onClick={() => void saveGuardian()} disabled={savingGuardian} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">{savingGuardian ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}{guardianPersisted ? "Atualizar padrão" : "Salvar padrão da marca"}</button>
        </aside>

        <div className="space-y-6 p-5 sm:p-6">
          {currentAudit && <div className={cn("rounded-2xl border p-4", currentAudit.passed ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-amber-500/25 bg-amber-500/[0.05]")}><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2">{currentAudit.passed ? <ShieldCheck className="h-5 w-5 text-emerald-500" /> : <ShieldAlert className="h-5 w-5 text-amber-500" />}<div><p className="text-sm font-semibold text-foreground">Design Gate atual</p><p className="text-[11px] text-muted-foreground">{stored.plan.directionName} · {stored.plan.format} · gate {guardian.minDesignScore}/100</p></div></div><span className={cn("rounded-full border px-3 py-1.5 text-lg font-bold", scoreClass(currentAudit.overall))}>{currentAudit.overall}/100</span></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{currentAudit.metrics.map((metric) => <div key={metric.id} className="rounded-xl border border-border bg-background/70 p-2.5"><p className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{metric.label}</p><p className="mt-1 text-base font-bold text-foreground">{metric.score}</p></div>)}</div>{(currentAudit.blockers.length > 0 || currentAudit.recommendations.length > 0) && <div className="mt-3 grid gap-2 md:grid-cols-2">{currentAudit.blockers.length > 0 && <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-300">Bloqueios</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{currentAudit.blockers.join(" ")}</p></div>}{currentAudit.recommendations.length > 0 && <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">Direção</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{currentAudit.recommendations.join(" ")}</p></div>}</div>}</div>}

          <div><div className="flex items-center gap-2"><WandSparkles className="h-4 w-4 text-violet-500" /><h3 className="text-sm font-semibold text-foreground">4 direções visuais reais</h3></div><p className="mt-1 text-xs text-muted-foreground">Cada opção muda direção, grid e hierarquia; não é apenas troca de cor.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">{variantPlans.map(({ recipe, plan, audit }) => <div key={recipe.id} className="rounded-2xl border border-border bg-background/45 p-3"><MiniPlanPreview plan={plan} /><div className="mt-3 flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-foreground">{recipe.label}</p><p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{recipe.description}</p></div><span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold", scoreClass(audit.overall))}>{audit.overall}</span></div><button type="button" disabled={!audit.passed} onClick={() => applyPlan(plan, stored.brief.channel, audit, `Direção ${recipe.label}`)} className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-violet-500/25 bg-violet-500/[0.07] text-[10px] font-semibold text-violet-700 hover:bg-violet-500/10 disabled:opacity-40 dark:text-violet-300"><Sparkles className="h-3.5 w-3.5" />{audit.passed ? "Aplicar direção" : "Ajuste necessário"}</button></div>)}</div></div>

          <div><div className="flex items-center gap-2"><LayoutTemplate className="h-4 w-4 text-violet-500" /><h3 className="text-sm font-semibold text-foreground">Recomposição inteligente por canal</h3></div><p className="mt-1 text-xs text-muted-foreground">Reconstrói o layout para cada proporção; não faz crop simples.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{channelPlans.map(({ recipe, plan, audit }) => { const Icon = recipe.icon; return <div key={recipe.id} className="rounded-2xl border border-border bg-background/40 p-3"><div className="flex items-start justify-between"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></div><span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-bold", scoreClass(audit.overall))}>{audit.overall}</span></div><p className="mt-2 text-xs font-semibold text-foreground">{recipe.label}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{recipe.hint} · {plan.format}</p><button type="button" disabled={!audit.passed} onClick={() => applyPlan(plan, recipe.channel, audit, `${recipe.label} ${plan.format}`)} className="mt-3 h-8 w-full rounded-lg border border-border text-[10px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40">Aplicar versão</button></div>; })}</div></div>

          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><div><p className="text-xs font-semibold text-foreground">Fluxo de qualidade</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Direção aprovada → Brand Guardian → variante escolhida → Canvas profissional → render WYSIWYG. Só composições aprovadas pelo gate podem substituir a direção atual.</p></div></div>
        </div>
      </div>
    </section>
  );
}
