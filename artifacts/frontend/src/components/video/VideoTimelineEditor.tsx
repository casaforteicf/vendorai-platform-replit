import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Captions,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Film,
  GripVertical,
  Image as ImageIcon,
  Layers3,
  Library,
  Loader2,
  Music2,
  Pause,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Scissors,
  Settings2,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import AiMusicGenerator from "@/components/video/AiMusicGenerator";
import { useMediaVideoHandoff } from "@/hooks/useMediaVideoHandoff";

type Ratio = "9:16" | "16:9" | "1:1" | "4:5";
type Quality = "720p" | "1080p";
type ToolPanel = "media" | "text" | "cards" | "stickers" | "audio" | "captions" | "ai" | "settings";
type LayerType = "text" | "card" | "image";
type MusicMode = "none" | "brand" | "library" | "upload" | "ai";
type MusicBrandUse = "institutional" | "reels" | "ads" | "product" | "stories" | "presentation";
type JobStatus = "idle" | "rendering" | "processing" | "done" | "error";
type LayerGestureMode = "move" | "trim-start" | "trim-end";
type ClipGestureMode = "trim-in" | "trim-out";
type StageGestureMode = "move" | "resize";
type TransitionType = "cut" | "fade" | "crossfade" | "zoom" | "slide-left" | "slide-right";
type ClipMotion = "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
type EasingType = "linear" | "ease-in" | "ease-out" | "ease-in-out";
type LayerAnimation = "none" | "fade" | "pop" | "zoom" | "slide-up" | "slide-down" | "slide-left" | "slide-right";
type TextAlign = "left" | "center" | "right";
type CaptionStylePreset = "impact" | "highlight" | "clean" | "minimal";
type CaptionMotion = "none" | "word-pop" | "word-bounce" | "pulse" | "karaoke";

type CaptionWord = {
  word: string;
  start: number;
  end: number;
};

type TranscriptChunk = {
  start: number;
  end: number;
  text: string;
  words: CaptionWord[];
};

type TranscriptPayload = {
  text: string;
  words: CaptionWord[];
  chunks: TranscriptChunk[];
  language?: string;
  captionPreset?: string;
};

type LayerKeyframe = {
  time: number;
  x: number;
  y: number;
  width: number;
  opacity: number;
  scale: number;
  rotation: number;
};

type ClipVisualState = {
  opacity: number;
  scale: number;
  translateX: number;
  translateY: number;
};

type EditorLayer = {
  id: string;
  type: LayerType;
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
  easing: EasingType;
  textAlign: TextAlign;
  enterAnimation: LayerAnimation;
  exitAnimation: LayerAnimation;
  animationDuration: number;
  contentKind?: "text" | "caption" | "sticker";
  captionStyle?: CaptionStylePreset;
  captionMotion?: CaptionMotion;
  captionWords?: CaptionWord[];
  activeWordColor?: string;
  activeWordBackground?: string;
  keyframes?: LayerKeyframe[];
  url?: string;
  assetId?: string;
  localFile?: File;
};

type VideoClip = {
  id: string;
  name: string;
  url: string;
  assetId?: string;
  localFile?: File;
  sourceDuration: number;
  trimIn: number;
  trimOut: number;
  transitionOut?: TransitionType;
  transitionDuration?: number;
  motion?: ClipMotion;
  beatLocked?: boolean;
};

type SfxCue = {
  id: string;
  assetId: string;
  name: string;
  url: string;
  start: number;
  duration: number;
  trimIn: number;
  volume: number;
  category: string;
};

type IntensityPoint = {
  time: number;
  score: number;
  reasons: string[];
};

type SfxSuggestion = {
  id: string;
  asset: MediaAsset;
  start: number;
  duration: number;
  volume: number;
  reason: string;
  category: string;
};

type EditorSnapshot = {
  clips: VideoClip[];
  layers: EditorLayer[];
  sfxCues?: SfxCue[];
};

type MediaAsset = {
  id: string;
  type: "video" | "image" | "audio" | "document";
  role?: string | null;
  storageUrl?: string | null;
  storage_url?: string | null;
  originalFilename?: string | null;
  original_filename?: string | null;
  mimeType?: string | null;
  mime_type?: string | null;
  metadata?: Record<string, unknown> | null;
};

type LibraryTrack = MediaAsset & {
  usage?: {
    organicAllowed?: boolean;
    paidAdsAllowed?: boolean;
    expired?: boolean;
    reasons?: string[];
  };
};

type BrandKitPayload = {
  brandKit?: {
    default_music_asset_id?: string | null;
  } | null;
};

type AiEditSuggestion = {
  id: string;
  type: "sticker" | "cta" | "caption_motion" | "clip_motion";
  start: number;
  end: number;
  reason: string;
  layerId?: string;
  clipId?: string;
  text?: string;
  emoji?: string;
  motion?: CaptionMotion | ClipMotion;
};

type AiEditPlan = {
  goal: string;
  summary: string;
  suggestions: AiEditSuggestion[];
  source?: "ai" | "fallback";
};

type MusicRecommendationProfile = {
  targetUses: MusicBrandUse[];
  paidCampaign: boolean;
  moodTerms: string[];
  genreTerms: string[];
  bpmMin: number;
  bpmMax: number;
  label: string;
};

type MusicRecommendation = {
  track: LibraryTrack;
  score: number;
  compatibility: number;
  reasons: string[];
};

type AutoEditPreset = {
  id: string;
  label: string;
  hint: string;
  goal: string;
  captionStyle: CaptionStylePreset;
  beatStrength: BeatSyncStrength;
  beatStep: BeatStep;
  audioMix: AudioMixPreset;
  syncVisualAccents: boolean;
  instruction: string;
};

type BeatStep = 1 | 2 | 4;
type BeatSyncStrength = "light" | "balanced" | "aggressive";
type AudioMixPreset = "voice" | "balanced" | "institutional" | "music";

type BeatCutPreview = {
  clipId: string;
  nextClipId: string;
  index: number;
  boundary: number;
  target: number;
  delta: number;
  downbeat: boolean;
  manual: boolean;
};

type MusicVolumePoint = {
  id: string;
  time: number;
  value: number;
};

type BeatAnalysis = {
  trackKey: string;
  bpm: number;
  offset: number;
  confidence: number;
  source: "audio" | "metadata" | "server";
  waveform: number[];
  downbeatIndex: number;
};

type LocatedClip = {
  clip: VideoClip;
  index: number;
  start: number;
  end: number;
  sourceTime: number;
};

const CHANNELS: Array<{ id: string; label: string; hint: string; ratio: Ratio }> = [
  { id: "reels", label: "Reels", hint: "Instagram · 9:16", ratio: "9:16" },
  { id: "stories", label: "Stories", hint: "Instagram/Facebook · 9:16", ratio: "9:16" },
  { id: "shorts", label: "Shorts", hint: "YouTube · 9:16", ratio: "9:16" },
  { id: "feed", label: "Feed", hint: "Instagram/Meta · 4:5", ratio: "4:5" },
  { id: "youtube", label: "YouTube", hint: "Vídeo · 16:9", ratio: "16:9" },
  { id: "site", label: "Site / LP", hint: "Hero e seções · 16:9", ratio: "16:9" },
  { id: "whatsapp", label: "WhatsApp", hint: "Status e envio · 9:16", ratio: "9:16" },
];

const MUSIC_BRAND_USE_LABELS: Record<MusicBrandUse, string> = {
  institutional: "Institucional",
  reels: "Reels / Shorts",
  ads: "Anúncios",
  product: "Produto",
  stories: "Stories",
  presentation: "Apresentações",
};

const MUSIC_BPM_BY_CHANNEL: Record<string, [number, number]> = {
  reels: [100, 135],
  shorts: [100, 135],
  stories: [95, 130],
  feed: [90, 125],
  whatsapp: [90, 125],
  youtube: [80, 120],
  site: [80, 115],
};

const AUDIO_MIX_PRESETS: Array<{ id: AudioMixPreset; label: string; hint: string; original: number; music: number; duck: number; fadeIn: number; fadeOut: number; lufs: number }> = [
  { id: "voice", label: "Voz em foco", hint: "Locução sempre à frente", original: 1, music: 0.16, duck: 72, fadeIn: 0.6, fadeOut: 1.2, lufs: -16 },
  { id: "balanced", label: "Social", hint: "Reels e anúncios equilibrados", original: 0.95, music: 0.24, duck: 58, fadeIn: 0.35, fadeOut: 0.8, lufs: -14 },
  { id: "institutional", label: "Institucional", hint: "Trilha discreta e suave", original: 1, music: 0.14, duck: 66, fadeIn: 1, fadeOut: 1.8, lufs: -16 },
  { id: "music", label: "Música forte", hint: "Conteúdo visual sem muita fala", original: 0.72, music: 0.42, duck: 35, fadeIn: 0.25, fadeOut: 0.7, lufs: -14 },
];

const TOOL_ITEMS: Array<{ id: ToolPanel; label: string; icon: typeof Film }> = [
  { id: "media", label: "Mídia", icon: Library },
  { id: "text", label: "Texto", icon: Type },
  { id: "cards", label: "Cards", icon: Square },
  { id: "stickers", label: "Stickers", icon: WandSparkles },
  { id: "audio", label: "Áudio", icon: Music2 },
  { id: "captions", label: "Legendas", icon: Captions },
  { id: "ai", label: "Assistente IA", icon: WandSparkles },
  { id: "settings", label: "Ajustes", icon: Settings2 },
];

const AI_EDIT_GOALS = [
  { id: "commercial", label: "Mais comercial", hint: "Oferta, benefício e CTA com ritmo de venda" },
  { id: "dynamic", label: "Mais dinâmico", hint: "Movimento, destaques e variação visual" },
  { id: "reel", label: "Reel rápido", hint: "Gancho forte e retenção para vídeo curto" },
  { id: "offer", label: "Destacar oferta", hint: "Preço, condição, urgência e chamada final" },
  { id: "clean", label: "Profissional e clean", hint: "Ênfases discretas e acabamento institucional" },
  { id: "product", label: "Produto / demonstração", hint: "Valoriza produto, benefícios e demonstração sem inventar claims" },
  { id: "testimonial", label: "Depoimento / prova", hint: "Prioriza voz, credibilidade e leitura confortável" },
];

const AUTO_EDIT_PRESETS: AutoEditPreset[] = [
  { id: "sales", label: "Conversão", hint: "Venda e geração de lead", goal: "commercial", captionStyle: "impact", beatStrength: "balanced", beatStep: 2, audioMix: "balanced", syncVisualAccents: true, instruction: "Priorize benefício, clareza comercial e CTA. Preserve a fala e não invente preço, condição ou prova." },
  { id: "offer", label: "Oferta", hint: "Condição e chamada forte", goal: "offer", captionStyle: "highlight", beatStrength: "balanced", beatStep: 2, audioMix: "balanced", syncVisualAccents: true, instruction: "Destaque somente ofertas e condições realmente mencionadas. Termine com CTA claro e mantenha leitura rápida." },
  { id: "fast-reel", label: "Reel rápido", hint: "Retenção e ritmo alto", goal: "reel", captionStyle: "highlight", beatStrength: "aggressive", beatStep: 1, audioMix: "music", syncVisualAccents: true, instruction: "Priorize gancho nos primeiros segundos, ritmo visual forte e poucos elementos por vez. Preserve a compreensão da fala." },
  { id: "premium", label: "Premium", hint: "Elegante e discreto", goal: "clean", captionStyle: "minimal", beatStrength: "light", beatStep: 4, audioMix: "institutional", syncVisualAccents: false, instruction: "Use movimentos sutis, poucos elementos e acabamento premium. Evite excesso de stickers, zooms e cortes." },
  { id: "product", label: "Produto", hint: "Demonstração e benefícios", goal: "product", captionStyle: "impact", beatStrength: "balanced", beatStep: 2, audioMix: "balanced", syncVisualAccents: true, instruction: "Valorize o produto, demonstrações e benefícios realmente presentes no conteúdo. Não invente especificações ou resultados." },
  { id: "testimonial", label: "Depoimento", hint: "Voz e credibilidade", goal: "testimonial", captionStyle: "clean", beatStrength: "light", beatStep: 4, audioMix: "voice", syncVisualAccents: false, instruction: "Priorize a voz, pausas naturais e credibilidade. Use movimentos discretos e legendas fáceis de acompanhar." },
];

const CARD_TEMPLATES = [
  { name: "Oferta", text: "OFERTA ESPECIAL\nFale com nossa equipe", background: "#111827", color: "#ffffff" },
  { name: "Benefício", text: "MAIS BENEFÍCIO\nResultado que faz diferença", background: "#0f766e", color: "#ffffff" },
  { name: "CTA", text: "QUERO SABER MAIS\nChame no WhatsApp", background: "#b91c1c", color: "#ffffff" },
  { name: "Destaque", text: "NOVIDADE\nConheça esta solução", background: "#6d28d9", color: "#ffffff" },
];

const STICKER_PRESETS = [
  { label: "Destaque", glyph: "✨" },
  { label: "Fogo", glyph: "🔥" },
  { label: "Aprovado", glyph: "✅" },
  { label: "Atenção", glyph: "⚡" },
  { label: "Alvo", glyph: "🎯" },
  { label: "Lançamento", glyph: "🚀" },
  { label: "Ideia", glyph: "💡" },
  { label: "Favorito", glyph: "⭐" },
  { label: "Clique abaixo", glyph: "👇" },
  { label: "Local", glyph: "📍" },
  { label: "Oferta", glyph: "🛒" },
  { label: "Preço", glyph: "💰" },
  { label: "Contato", glyph: "📞" },
  { label: "Resultado", glyph: "🏆" },
  { label: "Coração", glyph: "❤️" },
  { label: "Anúncio", glyph: "📣" },
];

const CAPTION_MOTIONS: Record<CaptionMotion, string> = {
  none: "Sem movimento",
  "word-pop": "Pop por palavra",
  "word-bounce": "Bounce por palavra",
  pulse: "Pulso por palavra",
  karaoke: "Karaokê / sublinhado",
};

const CAPTION_TEMPLATES: Array<{
  name: string;
  text: string;
  fontSize: number;
  y: number;
  color: string;
  background: string;
  textAlign: TextAlign;
  enterAnimation: LayerAnimation;
}> = [
  { name: "Impacto Reels", text: "SUA LEGENDA AQUI", fontSize: 48, y: 70, color: "#ffffff", background: "#111827", textAlign: "center", enterAnimation: "pop" },
  { name: "Destaque", text: "PALAVRA-CHAVE", fontSize: 46, y: 72, color: "#111827", background: "#facc15", textAlign: "center", enterAnimation: "slide-up" },
  { name: "Minimal", text: "Mensagem clara e direta", fontSize: 42, y: 76, color: "#ffffff", background: "#1f2937", textAlign: "center", enterAnimation: "fade" },
  { name: "CTA Social", text: "FALE COM A GENTE", fontSize: 44, y: 80, color: "#ffffff", background: "#b91c1c", textAlign: "center", enterAnimation: "zoom" },
];

const AUTO_CAPTION_STYLES: Record<CaptionStylePreset, {
  label: string;
  fontSize: number;
  y: number;
  color: string;
  background: string;
  activeWordColor: string;
  activeWordBackground: string;
  enterAnimation: LayerAnimation;
  motion: CaptionMotion;
}> = {
  impact: { label: "Impacto Reels", fontSize: 48, y: 70, color: "#ffffff", background: "#111827", activeWordColor: "#111827", activeWordBackground: "#facc15", enterAnimation: "pop", motion: "word-pop" },
  highlight: { label: "Destaque palavra", fontSize: 46, y: 72, color: "#ffffff", background: "#111827", activeWordColor: "#111827", activeWordBackground: "#22d3ee", enterAnimation: "slide-up", motion: "word-bounce" },
  clean: { label: "Clean", fontSize: 40, y: 76, color: "#ffffff", background: "#000000", activeWordColor: "#facc15", activeWordBackground: "transparent", enterAnimation: "fade", motion: "karaoke" },
  minimal: { label: "Minimal", fontSize: 36, y: 80, color: "#ffffff", background: "transparent", activeWordColor: "#facc15", activeWordBackground: "transparent", enterAnimation: "fade", motion: "none" },
};

function tokenHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function assetUrl(asset: Pick<MediaAsset, "storageUrl" | "storage_url">): string {
  const value = asset.storageUrl ?? asset.storage_url ?? "";
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("blob:")) return value;
  if (value.startsWith("/api/")) return value;
  if (value.startsWith("/objects/")) return `/api/storage${value}`;
  return value;
}

function assetName(asset: MediaAsset): string {
  return asset.originalFilename ?? asset.original_filename ?? "Mídia sem nome";
}

function metadataRecord(asset: MediaAsset): Record<string, unknown> {
  return asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? asset.metadata : {};
}

function audioAssetKind(asset: MediaAsset): string {
  return normalizedText(metadataRecord(asset).audioKind || asset.role || "");
}

function sfxCategoryFor(asset: MediaAsset): string {
  const metadata = metadataRecord(asset);
  const haystack = normalizedText(`${assetName(asset)} ${metadata.category ?? ""} ${metadata.tags ?? ""} ${metadata.mood ?? ""}`);
  if (/(riser|rise|build|crescendo|sweep up)/.test(haystack)) return "riser";
  if (/(whoosh|woosh|swish|swoosh|sweep|transition)/.test(haystack)) return "whoosh";
  if (/(impact|hit|punch|boom|slam|kick)/.test(haystack)) return "impact";
  if (/(click|tap|pop|button|ui)/.test(haystack)) return "click";
  if (/(success|win|sparkle|chime|bell|ding)/.test(haystack)) return "success";
  return "other";
}

function sfxAutomationAllowed(asset: MediaAsset): boolean {
  const metadata = metadataRecord(asset);
  const raw = metadata.rights;
  const rights = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const status = normalizedText(rights.status);
  const origin = normalizedText(rights.origin);
  if (status === "restricted") return false;
  if (status === "cleared") return true;
  return (origin === "tenant_owned" || origin === "generated") && rights.commercialUse === true;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function normalizedText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function trackBrandUses(track: LibraryTrack): MusicBrandUse[] {
  const valid = new Set<MusicBrandUse>(Object.keys(MUSIC_BRAND_USE_LABELS) as MusicBrandUse[]);
  return stringList(metadataRecord(track).brandUse).filter((value): value is MusicBrandUse => valid.has(value as MusicBrandUse));
}

function numberMetadata(track: LibraryTrack, key: string): number | null {
  const value = Number(metadataRecord(track)[key]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildMusicRecommendationProfile(channel: string, projectTitle: string, layers: EditorLayer[], goal: string): MusicRecommendationProfile {
  const content = normalizedText(`${projectTitle} ${layers.map((layer) => layer.text).join(" ")}`);
  const targetUses = new Set<MusicBrandUse>();
  if (channel === "reels" || channel === "shorts") targetUses.add("reels");
  if (channel === "stories") targetUses.add("stories");
  if (channel === "site" || channel === "youtube") targetUses.add("institutional");

  const paidCampaign = /(anuncio|ads|patrocin|campanha paga|trafego pago|performance max|google ads|meta ads)/.test(content);
  if (paidCampaign) targetUses.add("ads");
  if (/(produto|servico|oferta|promoc|lancamento|catalogo|colecao)/.test(content) || goal === "product" || goal === "offer") targetUses.add("product");
  if (/(institucional|empresa|marca|quem somos|corporativ|apresentacao)/.test(content) || goal === "clean" || goal === "testimonial") targetUses.add("institutional");

  const moodTerms: string[] = [];
  const genreTerms: string[] = [];
  if (/(premium|luxo|sofistic|arquitet|design|elegan)/.test(content) || goal === "clean") {
    moodTerms.push("elegante", "premium", "sofisticado", "cinematic", "cinematografico");
    genreTerms.push("cinematic", "ambient", "corporate", "instrumental");
  }
  if (/(oferta|promoc|lancamento|impacto|energia|novidade|rapido)/.test(content) || ["commercial", "dynamic", "reel", "offer", "product"].includes(goal)) {
    moodTerms.push("energetico", "energetic", "upbeat", "dynamic", "dinamico", "confiante");
    genreTerms.push("pop", "electronic", "corporate", "hip hop", "funk");
  }
  if (/(institucional|corporativ|profissional|empresa)/.test(content)) {
    moodTerms.push("institucional", "corporativo", "professional", "corporate");
    genreTerms.push("corporate", "ambient", "instrumental");
  }
  if (goal === "testimonial" || /(calmo|suave|bem-estar|relax|tranquil)/.test(content)) {
    moodTerms.push("calmo", "suave", "relax", "calm", "warm", "acolhedor", "authentic");
    genreTerms.push("acoustic", "ambient", "soft", "instrumental");
  }
  if (/(alegre|celebr|feliz|divert)/.test(content)) moodTerms.push("alegre", "feliz", "upbeat", "happy");

  const [bpmMin, bpmMax] = MUSIC_BPM_BY_CHANNEL[channel] ?? [85, 125];
  const adjustedMin = goal === "reel" || goal === "dynamic" ? Math.max(100, bpmMin) : goal === "clean" || goal === "testimonial" ? Math.min(bpmMin, 82) : bpmMin;
  const adjustedMax = goal === "reel" || goal === "dynamic" ? Math.max(132, bpmMax) : goal === "clean" || goal === "testimonial" ? Math.min(bpmMax, 112) : bpmMax;
  const channelLabel = CHANNELS.find((item) => item.id === channel)?.label ?? "Vídeo";
  return {
    targetUses: Array.from(targetUses),
    paidCampaign,
    moodTerms: Array.from(new Set(moodTerms)),
    genreTerms: Array.from(new Set(genreTerms)),
    bpmMin: adjustedMin,
    bpmMax: adjustedMax,
    label: channelLabel,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function timeLabel(seconds: number): string {
  const safe = Math.max(0, seconds || 0);
  const min = Math.floor(safe / 60);
  const sec = Math.floor(safe % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clipDuration(clip: VideoClip): number {
  return Math.max(0.1, clip.trimOut - clip.trimIn);
}

function transitionOverlapAfter(index: number, clips: VideoClip[]): number {
  const clip = clips[index];
  const next = clips[index + 1];
  if (!clip || !next || (clip.transitionOut ?? "cut") !== "crossfade") return 0;
  return Math.min(
    Math.max(0.1, clip.transitionDuration ?? 0.45),
    clipDuration(clip) / 2,
    clipDuration(next) / 2,
  );
}

function projectDurationFor(clips: VideoClip[]): number {
  if (!clips.length) return 0;
  let total = clips.reduce((sum, clip) => sum + clipDuration(clip), 0);
  for (let index = 0; index < clips.length - 1; index += 1) total -= transitionOverlapAfter(index, clips);
  return Math.max(0.1, total);
}

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    clips: snapshot.clips.map((clip) => ({ ...clip })),
    layers: snapshot.layers.map((layer) => ({ ...layer, captionWords: layer.captionWords?.map((word) => ({ ...word })), keyframes: layer.keyframes?.map((frame) => ({ ...frame })) })),
    sfxCues: (snapshot.sfxCues ?? []).map((cue) => ({ ...cue })),
  };
}

function clipStartAt(index: number, clips: VideoClip[]): number {
  let cursor = 0;
  for (let clipIndex = 0; clipIndex < index; clipIndex += 1) {
    const clip = clips[clipIndex];
    if (!clip) continue;
    cursor += clipDuration(clip) - transitionOverlapAfter(clipIndex, clips);
  }
  return cursor;
}

function locateClip(time: number, clips: VideoClip[]): LocatedClip | null {
  if (!clips.length) return null;
  const total = projectDurationFor(clips);
  const safeTime = clamp(time, 0, Math.max(0, total - 0.001));
  let located: LocatedClip | null = null;
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index];
    if (!clip) continue;
    const start = clipStartAt(index, clips);
    const duration = clipDuration(clip);
    const end = start + duration;
    if (safeTime >= start && (safeTime < end || index === clips.length - 1)) {
      located = {
        clip,
        index,
        start,
        end,
        sourceTime: clip.trimIn + clamp(safeTime - start, 0, duration),
      };
    }
  }
  return located;
}

function transitionLabel(type: TransitionType | undefined): string {
  if (type === "fade") return "Fade";
  if (type === "crossfade") return "Crossfade";
  if (type === "zoom") return "Zoom";
  if (type === "slide-left") return "Deslizar ←";
  if (type === "slide-right") return "Deslizar →";
  return "Corte seco";
}

function clipVisualState(index: number, time: number, clips: VideoClip[]): ClipVisualState {
  const clip = clips[index];
  if (!clip) return { opacity: 1, scale: 1, translateX: 0, translateY: 0 };
  const start = clipStartAt(index, clips);
  const duration = clipDuration(clip);
  const local = clamp(time - start, 0, duration);
  const progress = clamp(local / Math.max(0.1, duration), 0, 1);
  const previous = clips[index - 1];
  const entryType = previous?.transitionOut ?? "cut";
  const exitType = clip.transitionOut ?? "cut";
  const entryDuration = Math.min(duration / 2, Math.max(0.1, previous?.transitionDuration ?? 0.45));
  const exitDuration = Math.min(duration / 2, Math.max(0.1, clip.transitionDuration ?? 0.45));
  const entry = entryType === "cut" ? 1 : clamp(local / entryDuration, 0, 1);
  const exit = exitType === "cut" ? 1 : clamp((duration - local) / exitDuration, 0, 1);
  const state: ClipVisualState = { opacity: 1, scale: 1, translateX: 0, translateY: 0 };

  const applyTransition = (type: TransitionType, amount: number, entering: boolean) => {
    if (type === "fade") state.opacity *= amount;
    if (type === "crossfade" && entering) state.opacity *= amount;
    if (type === "zoom") state.scale *= entering ? 1.08 - 0.08 * amount : 1 + 0.08 * (1 - amount);
    if (type === "slide-left") state.translateX += entering ? 0.12 * (1 - amount) : -0.12 * (1 - amount);
    if (type === "slide-right") state.translateX += entering ? -0.12 * (1 - amount) : 0.12 * (1 - amount);
  };

  if (entryType !== "cut") applyTransition(entryType, entry, true);
  if (exitType !== "cut") applyTransition(exitType, exit, false);

  const motion = clip.motion ?? "none";
  if (motion === "zoom-in") state.scale *= 1 + progress * 0.08;
  if (motion === "zoom-out") state.scale *= 1.08 - progress * 0.08;
  if (motion === "pan-left") state.translateX += 0.04 - progress * 0.08;
  if (motion === "pan-right") state.translateX += -0.04 + progress * 0.08;
  return state;
}

function applyEasing(progress: number, easing: EasingType): number {
  const p = clamp(progress, 0, 1);
  if (easing === "ease-in") return p * p;
  if (easing === "ease-out") return 1 - (1 - p) * (1 - p);
  if (easing === "ease-in-out") return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  return p;
}

function resolveLayerAtTime(layer: EditorLayer, time: number): EditorLayer {
  const frames = [...(layer.keyframes ?? [])].sort((a, b) => a.time - b.time);
  if (!frames.length) return layer;
  if (time <= frames[0]!.time) return { ...layer, ...frames[0] };
  if (time >= frames[frames.length - 1]!.time) return { ...layer, ...frames[frames.length - 1] };
  for (let index = 0; index < frames.length - 1; index += 1) {
    const left = frames[index];
    const right = frames[index + 1];
    if (!left || !right || time < left.time || time > right.time) continue;
    const linear = clamp((time - left.time) / Math.max(0.001, right.time - left.time), 0, 1);
    const progress = applyEasing(linear, layer.easing ?? "ease-in-out");
    const lerp = (a: number, b: number) => a + (b - a) * progress;
    return {
      ...layer,
      x: lerp(left.x, right.x),
      y: lerp(left.y, right.y),
      width: lerp(left.width, right.width),
      opacity: lerp(left.opacity, right.opacity),
      scale: lerp(left.scale, right.scale),
      rotation: lerp(left.rotation, right.rotation),
    };
  }
  return layer;
}

function resolveAnimatedLayerAtTime(layer: EditorLayer, time: number): EditorLayer {
  const resolved = resolveLayerAtTime(layer, time);
  const layerDuration = Math.max(0.1, layer.end - layer.start);
  const duration = Math.min(layerDuration / 2, Math.max(0.1, layer.animationDuration ?? 0.35));
  const enter = applyEasing(clamp((time - layer.start) / duration, 0, 1), layer.easing ?? "ease-in-out");
  const exit = applyEasing(clamp((layer.end - time) / duration, 0, 1), layer.easing ?? "ease-in-out");
  const next: EditorLayer = { ...resolved };

  const applyAnimation = (type: LayerAnimation, amount: number, entering: boolean) => {
    if (type === "none") return;
    if (type === "fade") next.opacity *= amount;
    if (type === "pop") next.scale *= entering ? 0.82 + 0.18 * amount : 0.9 + 0.1 * amount;
    if (type === "zoom") next.scale *= entering ? 0.68 + 0.32 * amount : 0.82 + 0.18 * amount;
    const offset = (1 - amount) * 8;
    if (type === "slide-up") next.y += entering ? offset : -offset;
    if (type === "slide-down") next.y += entering ? -offset : offset;
    if (type === "slide-left") next.x += entering ? offset : -offset;
    if (type === "slide-right") next.x += entering ? -offset : offset;
  };

  applyAnimation(layer.enterAnimation ?? "none", enter, true);
  applyAnimation(layer.exitAnimation ?? "none", exit, false);
  return next;
}

type CrossfadeWindow = {
  previous: VideoClip;
  next: VideoClip;
  previousIndex: number;
  nextIndex: number;
  start: number;
  end: number;
  progress: number;
  previousSourceTime: number;
  nextSourceTime: number;
};

function crossfadeWindowAt(time: number, clips: VideoClip[]): CrossfadeWindow | null {
  for (let index = 0; index < clips.length - 1; index += 1) {
    const overlap = transitionOverlapAfter(index, clips);
    if (overlap <= 0) continue;
    const previous = clips[index];
    const next = clips[index + 1];
    if (!previous || !next) continue;
    const start = clipStartAt(index + 1, clips);
    const end = start + overlap;
    if (time < start || time > end) continue;
    const progress = clamp((time - start) / Math.max(0.001, overlap), 0, 1);
    return {
      previous,
      next,
      previousIndex: index,
      nextIndex: index + 1,
      start,
      end,
      progress,
      previousSourceTime: previous.trimOut - overlap + progress * overlap,
      nextSourceTime: next.trimIn + progress * overlap,
    };
  }
  return null;
}

function outputDimensions(ratio: Ratio, quality: Quality): { width: number; height: number } {
  const long = quality === "1080p" ? 1920 : 1280;
  const short = quality === "1080p" ? 1080 : 720;
  if (ratio === "9:16") return { width: short, height: long };
  if (ratio === "16:9") return { width: long, height: short };
  if (ratio === "1:1") return { width: short, height: short };
  return { width: short, height: Math.round(short * 1.25) };
}

function drawContainedVideo(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, width: number, height: number, visual?: ClipVisualState, clear = true) {
  const videoRatio = (video.videoWidth || width) / (video.videoHeight || height);
  const canvasRatio = width / height;
  let dw = width;
  let dh = height;
  let dx = 0;
  let dy = 0;
  if (videoRatio > canvasRatio) {
    dh = width / videoRatio;
    dy = (height - dh) / 2;
  } else {
    dw = height * videoRatio;
    dx = (width - dw) / 2;
  }
  const state = visual ?? { opacity: 1, scale: 1, translateX: 0, translateY: 0 };
  if (clear) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.save();
  ctx.globalAlpha = clamp(state.opacity, 0, 1);
  ctx.translate(width / 2 + width * state.translateX, height / 2 + height * state.translateY);
  ctx.scale(state.scale, state.scale);
  ctx.drawImage(video, dx - width / 2, dy - height / 2, dw, dh);
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = words[0] ?? "";
    for (let index = 1; index < words.length; index += 1) {
      const next = `${line} ${words[index]}`;
      if (ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = words[index] ?? "";
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines.slice(0, 8);
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar uma imagem da timeline."));
    image.src = url;
  });
}

async function probeVideo(url: string): Promise<number> {
  return await new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
    };
    video.preload = "metadata";
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      cleanup();
      if (duration > 0) resolve(duration);
      else reject(new Error("Não foi possível identificar a duração do vídeo."));
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Não foi possível abrir o vídeo."));
    };
    video.src = url;
  });
}

function buildBeatTimes(bpm: number, offset: number, duration: number): number[] {
  if (!Number.isFinite(bpm) || bpm <= 0 || !Number.isFinite(duration) || duration <= 0) return [];
  const interval = 60 / bpm;
  const normalizedOffset = ((offset % interval) + interval) % interval;
  const beats: number[] = [];
  for (let time = normalizedOffset; time <= duration + 0.001 && beats.length < 1200; time += interval) beats.push(time);
  return beats;
}

function buildWaveformSamples(buffer: AudioBuffer, bins = 96): number[] {
  const channel = buffer.getChannelData(0);
  if (!channel.length) return [];
  const samples: number[] = [];
  const span = Math.max(1, Math.floor(channel.length / bins));
  let maxPeak = 0;
  for (let bin = 0; bin < bins; bin += 1) {
    const start = bin * span;
    const end = bin === bins - 1 ? channel.length : Math.min(channel.length, start + span);
    let peak = 0;
    for (let index = start; index < end; index += Math.max(1, Math.floor((end - start) / 180))) {
      peak = Math.max(peak, Math.abs(channel[index] ?? 0));
    }
    samples.push(peak);
    maxPeak = Math.max(maxPeak, peak);
  }
  return samples.map((peak) => Math.round((maxPeak > 0 ? peak / maxPeak : 0) * 1000) / 1000);
}

function smartLoopBounds(buffer: AudioBuffer): { start: number; end: number } {
  const channel = buffer.getChannelData(0);
  if (!channel.length || buffer.duration < 1.5) return { start: 0, end: buffer.duration };
  const sampleRate = buffer.sampleRate;
  const findCrossing = (target: number, radiusSeconds: number) => {
    const center = clamp(Math.round(target * sampleRate), 1, channel.length - 2);
    const radius = Math.max(1, Math.round(radiusSeconds * sampleRate));
    let best = center;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = Math.max(1, center - radius); index <= Math.min(channel.length - 2, center + radius); index += 1) {
      const current = channel[index] ?? 0;
      const previous = channel[index - 1] ?? 0;
      const crossing = (previous <= 0 && current >= 0) || (previous >= 0 && current <= 0);
      const score = Math.abs(current) + (crossing ? 0 : 0.4);
      if (score < bestScore) { best = index; bestScore = score; }
    }
    return best / sampleRate;
  };
  const start = findCrossing(Math.min(0.35, buffer.duration * 0.05), 0.2);
  const end = findCrossing(Math.max(start + 1, buffer.duration - 0.15), 0.25);
  return end > start + 0.75 ? { start, end } : { start: 0, end: buffer.duration };
}

function volumeAtTime(points: MusicVolumePoint[], time: number, fallback: number): number {
  if (!points.length) return fallback;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index]!;
    const right = sorted[index + 1]!;
    if (time < left.time || time > right.time) continue;
    const progress = (time - left.time) / Math.max(0.001, right.time - left.time);
    return left.value + (right.value - left.value) * progress;
  }
  return fallback;
}

function fadeMultiplier(time: number, start: number, end: number, fadeIn: number, fadeOut: number): number {
  if (time < start || time > end) return 0;
  const inMultiplier = fadeIn > 0 ? clamp((time - start) / fadeIn, 0, 1) : 1;
  const outMultiplier = fadeOut > 0 ? clamp((end - time) / fadeOut, 0, 1) : 1;
  return Math.min(inMultiplier, outMultiplier);
}

function analyzeAudioBufferBeats(buffer: AudioBuffer, bpmHint?: number | null): Omit<BeatAnalysis, "trackKey"> {
  const sampleRate = buffer.sampleRate;
  const maxSamples = Math.min(buffer.length, Math.floor(sampleRate * 120));
  const windowSize = Math.max(256, Math.round(sampleRate / 100));
  const windowDuration = windowSize / sampleRate;
  const windowCount = Math.max(1, Math.floor(maxSamples / windowSize));
  const energies = new Float32Array(windowCount);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));

  let totalEnergy = 0;
  for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
    const start = windowIndex * windowSize;
    const end = Math.min(maxSamples, start + windowSize);
    let sum = 0;
    let samples = 0;
    for (const channel of channels) {
      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        const sample = channel[sampleIndex] ?? 0;
        sum += sample * sample;
        samples += 1;
      }
    }
    const rms = Math.sqrt(sum / Math.max(1, samples));
    energies[windowIndex] = rms;
    totalEnergy += rms;
  }

  const mean = totalEnergy / Math.max(1, energies.length);
  let bpm = bpmHint && Number.isFinite(bpmHint) && bpmHint > 0 ? bpmHint : 0;
  let correlationConfidence = bpm ? 0.7 : 0;

  if (!bpm && energies.length > 20) {
    const minLag = Math.max(1, Math.floor((60 / 180) / windowDuration));
    const maxLag = Math.min(energies.length - 2, Math.ceil((60 / 70) / windowDuration));
    let bestLag = 0;
    let bestCorrelation = Number.NEGATIVE_INFINITY;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let score = 0;
      let normLeft = 0;
      let normRight = 0;
      for (let index = lag; index < energies.length; index += 1) {
        const left = (energies[index] ?? 0) - mean;
        const right = (energies[index - lag] ?? 0) - mean;
        score += left * right;
        normLeft += left * left;
        normRight += right * right;
      }
      const correlation = score / Math.max(1e-9, Math.sqrt(normLeft * normRight));
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }
    if (bestLag > 0) {
      bpm = 60 / (bestLag * windowDuration);
      while (bpm < 80) bpm *= 2;
      while (bpm > 160) bpm /= 2;
      correlationConfidence = clamp((bestCorrelation + 1) / 2, 0.2, 0.95);
    }
  }

  if (!bpm || !Number.isFinite(bpm)) bpm = 110;
  bpm = clamp(bpm, 60, 200);
  const period = 60 / bpm;
  const duration = Math.min(buffer.duration, 120);
  let bestOffset = 0;
  let bestPhaseScore = Number.NEGATIVE_INFINITY;
  const phaseSteps = 48;
  for (let phaseIndex = 0; phaseIndex < phaseSteps; phaseIndex += 1) {
    const offset = period * phaseIndex / phaseSteps;
    let score = 0;
    let count = 0;
    for (let time = offset; time < duration; time += period) {
      const index = Math.min(energies.length - 1, Math.max(0, Math.round(time / windowDuration)));
      score += Math.max(0, (energies[index] ?? 0) - mean);
      count += 1;
    }
    const normalizedScore = score / Math.max(1, count);
    if (normalizedScore > bestPhaseScore) {
      bestPhaseScore = normalizedScore;
      bestOffset = offset;
    }
  }

  const beatBuckets = [0, 0, 0, 0];
  const beatCounts = [0, 0, 0, 0];
  let beatOrdinal = 0;
  for (let time = bestOffset; time < duration; time += period) {
    const index = Math.min(energies.length - 1, Math.max(0, Math.round(time / windowDuration)));
    const bucket = beatOrdinal % 4;
    beatBuckets[bucket] += Math.max(0, (energies[index] ?? 0) - mean);
    beatCounts[bucket] += 1;
    beatOrdinal += 1;
  }
  let downbeatIndex = 0;
  let downbeatScore = Number.NEGATIVE_INFINITY;
  for (let bucket = 0; bucket < 4; bucket += 1) {
    const score = beatBuckets[bucket] / Math.max(1, beatCounts[bucket]);
    if (score > downbeatScore) { downbeatScore = score; downbeatIndex = bucket; }
  }
  return {
    bpm: Math.round(bpm * 10) / 10,
    offset: Math.round(bestOffset * 1000) / 1000,
    confidence: Math.round(clamp(correlationConfidence, 0.2, 0.98) * 100) / 100,
    source: "audio",
    waveform: buildWaveformSamples(buffer),
    downbeatIndex,
  };
}

function layerIsVisible(layer: EditorLayer, time: number): boolean {
  return time >= layer.start && time <= layer.end;
}

function retimeCaptionWords(text: string, start: number, end: number, existing: CaptionWord[] = []): CaptionWord[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  if (tokens.length === existing.length) {
    return existing.map((word, index) => ({ ...word, word: tokens[index] ?? word.word }));
  }
  const duration = Math.max(0.1, end - start);
  const step = duration / tokens.length;
  return tokens.map((word, index) => ({
    word,
    start: start + step * index,
    end: index === tokens.length - 1 ? end : start + step * (index + 1),
  }));
}

function splitCaptionWordLines(ctx: CanvasRenderingContext2D, words: CaptionWord[], maxWidth: number): CaptionWord[][] {
  const lines: CaptionWord[][] = [];
  let current: CaptionWord[] = [];
  let width = 0;
  const gap = ctx.measureText(" ").width;
  for (const word of words) {
    const wordWidth = ctx.measureText(word.word).width;
    const nextWidth = width + (current.length ? gap : 0) + wordWidth;
    if (current.length && nextWidth > maxWidth) {
      lines.push(current);
      current = [];
      width = 0;
    }
    current.push(word);
    width += (current.length > 1 ? gap : 0) + wordWidth;
  }
  if (current.length) lines.push(current);
  return lines.slice(0, 4);
}

function captionWordMotionState(word: CaptionWord, time: number, motion: CaptionMotion = "word-pop") {
  const active = time >= word.start && time <= word.end;
  if (!active || motion === "none") return { active, scale: 1, translateY: 0 };
  const duration = Math.max(0.04, word.end - word.start);
  const progress = clamp((time - word.start) / duration, 0, 1);
  const wave = Math.sin(Math.PI * progress);
  if (motion === "word-pop") return { active, scale: 1 + 0.22 * wave, translateY: 0 };
  if (motion === "word-bounce") return { active, scale: 1 + 0.08 * wave, translateY: -0.18 * wave };
  if (motion === "pulse") return { active, scale: 1 + 0.12 * (0.5 + 0.5 * Math.sin(progress * Math.PI * 4)), translateY: 0 };
  return { active, scale: 1.04, translateY: 0 };
}

function drawCaptionWordsOnCanvas(
  ctx: CanvasRenderingContext2D,
  layer: EditorLayer,
  time: number,
  maxWidth: number,
  fontSize: number,
  padding: number,
) {
  const words = layer.captionWords ?? [];
  if (!words.length) return;
  const contentWidth = Math.max(40, maxWidth - padding * 2);
  const lines = splitCaptionWordLines(ctx, words, contentWidth);
  const lineHeight = fontSize * 1.22;
  const blockHeight = lines.length * lineHeight + padding * 2;
  if (layer.background && layer.background !== "transparent") {
    ctx.fillStyle = layer.background;
    ctx.fillRect(0, 0, maxWidth, blockHeight);
  }
  const gap = ctx.measureText(" ").width;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? [];
    const widths = line.map((word) => ctx.measureText(word.word).width);
    const lineWidth = widths.reduce((sum, value) => sum + value, 0) + Math.max(0, line.length - 1) * gap;
    const align = layer.textAlign ?? "center";
    let cursorX = align === "center" ? (maxWidth - lineWidth) / 2 : align === "right" ? maxWidth - padding - lineWidth : padding;
    const y = padding + lineIndex * lineHeight;
    for (let index = 0; index < line.length; index += 1) {
      const word = line[index]!;
      const wordWidth = widths[index] ?? 0;
      const motion = captionWordMotionState(word, time, layer.captionMotion ?? "word-pop");
      if (motion.active) {
        ctx.save();
        ctx.translate(cursorX + wordWidth / 2, y + lineHeight / 2 + motion.translateY * fontSize);
        ctx.scale(motion.scale, motion.scale);
        if (layer.activeWordBackground && layer.activeWordBackground !== "transparent") {
          ctx.fillStyle = layer.activeWordBackground;
          ctx.fillRect(-wordWidth / 2 - padding * 0.22, -lineHeight / 2 - padding * 0.12, wordWidth + padding * 0.44, lineHeight * 0.95);
        }
        ctx.fillStyle = layer.activeWordColor || layer.color;
        ctx.textAlign = "left";
        ctx.fillText(word.word, -wordWidth / 2, -lineHeight / 2);
        if (layer.captionMotion === "karaoke") {
          ctx.fillRect(-wordWidth / 2, lineHeight * 0.34, wordWidth, Math.max(2, fontSize * 0.06));
        }
        ctx.restore();
      } else {
        ctx.fillStyle = layer.color;
        ctx.textAlign = "left";
        ctx.fillText(word.word, cursorX, y);
      }
      cursorX += wordWidth + gap;
    }
  }
}

function RangeField({ label, value, min, max, step = 1, suffix = "", onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">{Number.isInteger(value) ? value : value.toFixed(1)}{suffix}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-primary" />
    </label>
  );
}

export default function VideoTimelineEditor() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const videoInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const previewOverlapRef = useRef<HTMLVideoElement>(null);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const autosaveTimer = useRef<number | null>(null);
  const clipsRef = useRef<VideoClip[]>([]);
  const layersRef = useRef<EditorLayer[]>([]);
  const sfxCuesRef = useRef<SfxCue[]>([]);
  const historyRef = useRef<EditorSnapshot[]>([{ clips: [], layers: [], sfxCues: [] }]);
  const historyIndexRef = useRef(0);
  const desiredPreviewSourceTimeRef = useRef<number | null>(null);
  const resumeAfterClipChangeRef = useRef(false);
  const handoffAddedRef = useRef("");
  const draggedClipIdRef = useRef("");

  const [tool, setTool] = useState<ToolPanel>("media");
  const [channel, setChannel] = useState("reels");
  const [ratio, setRatio] = useState<Ratio>("9:16");
  const [quality, setQuality] = useState<Quality>("720p");
  const [projectTitle, setProjectTitle] = useState("Novo projeto de vídeo");
  const [projectId, setProjectId] = useState(new URLSearchParams(window.location.search).get("projectId") ?? "");
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  const [clips, setClips] = useState<VideoClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState("");
  const [activeClipId, setActiveClipId] = useState("");
  const [timelineTime, setTimelineTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [layers, setLayers] = useState<EditorLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState("");
  const [sfxCues, setSfxCues] = useState<SfxCue[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);

  const requestedMusicAssetId = useRef(new URLSearchParams(window.location.search).get("musicAssetId") ?? "");
  const [musicMode, setMusicMode] = useState<MusicMode>(requestedMusicAssetId.current ? "library" : "none");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicAssetId, setMusicAssetId] = useState(requestedMusicAssetId.current);
  const [musicTracks, setMusicTracks] = useState<LibraryTrack[]>([]);
  const [brandDefaultTrackId, setBrandDefaultTrackId] = useState("");
  const [musicVolume, setMusicVolume] = useState(0.22);
  const [originalVolume, setOriginalVolume] = useState(1);
  const [musicStart, setMusicStart] = useState(0);
  const [musicEnd, setMusicEnd] = useState(30);
  const [beatAnalysis, setBeatAnalysis] = useState<BeatAnalysis | null>(null);
  const [beatAnalyzing, setBeatAnalyzing] = useState(false);
  const [beatStep, setBeatStep] = useState<BeatStep>(2);
  const [showBeatMarkers, setShowBeatMarkers] = useState(true);
  const [beatSyncStrength, setBeatSyncStrength] = useState<BeatSyncStrength>("balanced");
  const [manualBeatMarkers, setManualBeatMarkers] = useState<number[]>([]);
  const [syncVisualAccents, setSyncVisualAccents] = useState(true);
  const [duckingEnabled, setDuckingEnabled] = useState(true);
  const [duckingReduction, setDuckingReduction] = useState(62);
  const [duckingThresholdPct, setDuckingThresholdPct] = useState(5);
  const [duckingAttackMs, setDuckingAttackMs] = useState(120);
  const [duckingReleaseMs, setDuckingReleaseMs] = useState(480);
  const [musicFadeIn, setMusicFadeIn] = useState(0.5);
  const [musicFadeOut, setMusicFadeOut] = useState(1);
  const [smartMusicLoop, setSmartMusicLoop] = useState(true);
  const [musicVolumePoints, setMusicVolumePoints] = useState<MusicVolumePoint[]>([]);
  const [loudnessTarget, setLoudnessTarget] = useState(-14);

  const [normalizeAudio, setNormalizeAudio] = useState(true);
  const [speed, setSpeed] = useState("1.0");
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [jobMessage, setJobMessage] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [autoCaptionStyle, setAutoCaptionStyle] = useState<CaptionStylePreset>("impact");
  const [aiGoal, setAiGoal] = useState("commercial");
  const [selectedAutoPresetId, setSelectedAutoPresetId] = useState("sales");
  const [aiInstructions, setAiInstructions] = useState(AUTO_EDIT_PRESETS[0]?.instruction ?? "");
  const [aiPlan, setAiPlan] = useState<AiEditPlan | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiSelectedIds, setAiSelectedIds] = useState<Set<string>>(new Set());

  const [handoffFile, setHandoffFile] = useState<File | null>(null);
  const [handoffPreview, setHandoffPreview] = useState<string | null>(null);
  const handoff = useMediaVideoHandoff({ tenantId, setVideoFile: setHandoffFile, setVideoPreview: setHandoffPreview });

  const projectDuration = Math.max(0.1, projectDurationFor(clips));
  const realProjectDuration = projectDurationFor(clips);
  const locatedPreview = locateClip(timelineTime, clips);
  const activeClip = clips.find((clip) => clip.id === activeClipId) ?? locatedPreview?.clip ?? clips[0] ?? null;
  const selectedClip = clips.find((clip) => clip.id === selectedClipId) ?? null;
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const selectedTrack = musicTracks.find((track) => track.id === musicAssetId) ?? null;
  const currentMusicKey = musicMode === "upload" && musicFile
    ? `upload:${musicFile.name}:${musicFile.size}:${musicFile.lastModified}`
    : musicAssetId;
  const activeBeatAnalysis = beatAnalysis?.trackKey === currentMusicKey ? beatAnalysis : null;
  const logEditorEvent = useCallback((event: "beat_analyzed" | "beat_fallback_server" | "render_started" | "render_completed" | "render_failed" | "auto_edit_applied" | "sfx_applied", metadata: Record<string, unknown> = {}) => {
    if (!tenantId) return;
    void fetch(`/api/tenants/${tenantId}/content-studio/video/editor-events`, {
      method: "POST",
      headers: tokenHeaders(true),
      body: JSON.stringify({ event, projectId: projectId || null, metadata }),
    }).catch(() => undefined);
  }, [projectId, tenantId]);
  const applyAudioMixPreset = useCallback((presetId: AudioMixPreset) => {
    const preset = AUDIO_MIX_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setOriginalVolume(preset.original);
    setMusicVolume(preset.music);
    setDuckingReduction(preset.duck);
    setMusicFadeIn(preset.fadeIn);
    setMusicFadeOut(preset.fadeOut);
    setLoudnessTarget(preset.lufs);
    setDuckingEnabled(true);
    setNormalizeAudio(true);
    toast({ title: `Mix ${preset.label} aplicado`, description: "Volumes, ducking, fades e loudness foram ajustados." });
  }, [toast]);

  const applyAutoEditPreset = useCallback((presetId: string) => {
    const preset = AUTO_EDIT_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setSelectedAutoPresetId(preset.id);
    setAiGoal(preset.goal);
    setAiInstructions(preset.instruction);
    setAutoCaptionStyle(preset.captionStyle);
    setBeatSyncStrength(preset.beatStrength);
    setBeatStep(preset.beatStep);
    setSyncVisualAccents(preset.syncVisualAccents);
    const mix = AUDIO_MIX_PRESETS.find((item) => item.id === preset.audioMix);
    if (mix) {
      setOriginalVolume(mix.original);
      setMusicVolume(mix.music);
      setDuckingReduction(mix.duck);
      setMusicFadeIn(mix.fadeIn);
      setMusicFadeOut(mix.fadeOut);
      setLoudnessTarget(mix.lufs);
      setDuckingEnabled(true);
      setNormalizeAudio(true);
    }
    setAiPlan(null);
    setAiSelectedIds(new Set<string>());
    toast({ title: `Preset ${preset.label} aplicado`, description: "IA, legenda, Beat Sync e mix foram preparados para este objetivo." });
  }, [toast]);

  const addMusicVolumePoint = useCallback(() => {
    const time = clamp(timelineTime, musicStart, Math.max(musicStart, musicEnd));
    setMusicVolumePoints((current) => [...current.filter((point) => Math.abs(point.time - time) > 0.08), { id: uid("music-volume"), time, value: musicVolume }].sort((a, b) => a.time - b.time));
  }, [musicEnd, musicStart, musicVolume, timelineTime]);

  const rawBeatTimes = useMemo(() => {
    if (!activeBeatAnalysis || musicMode === "none") return [];
    const sourceDuration = Math.max(0.1, musicEnd - musicStart, realProjectDuration - musicStart);
    return buildBeatTimes(activeBeatAnalysis.bpm, activeBeatAnalysis.offset, sourceDuration)
      .map((time) => musicStart + time)
      .filter((time) => time >= 0 && time <= realProjectDuration + 0.001 && time <= musicEnd + 0.001);
  }, [activeBeatAnalysis, musicEnd, musicMode, musicStart, realProjectDuration]);
  const beatTimes = useMemo(() => rawBeatTimes.filter((_, index) => index % beatStep === 0), [beatStep, rawBeatTimes]);
  const downbeatTimes = useMemo(() => activeBeatAnalysis ? rawBeatTimes.filter((_, index) => index % 4 === activeBeatAnalysis.downbeatIndex) : [], [activeBeatAnalysis, rawBeatTimes]);
  const effectiveBeatCandidates = useMemo(() => {
    const values = [...beatTimes, ...downbeatTimes, ...manualBeatMarkers]
      .filter((time) => time >= 0 && time <= realProjectDuration)
      .sort((a, b) => a - b);
    return values.filter((time, index) => index === 0 || Math.abs(time - values[index - 1]!) > 0.012);
  }, [beatTimes, downbeatTimes, manualBeatMarkers, realProjectDuration]);
  const beatCutPreview = useMemo<BeatCutPreview[]>(() => {
    if (!activeBeatAnalysis || effectiveBeatCandidates.length === 0 || clips.length < 2) return [];
    const working = clips.map((clip) => ({ ...clip }));
    const period = 60 / activeBeatAnalysis.bpm;
    const config = beatSyncStrength === "light"
      ? { cap: 0.18, factor: 0.24 }
      : beatSyncStrength === "aggressive"
        ? { cap: 0.5, factor: 0.62 }
        : { cap: 0.34, factor: 0.42 };
    const tolerance = Math.min(config.cap, period * beatStep * config.factor);
    const preview: BeatCutPreview[] = [];
    for (let index = 0; index < working.length - 1; index += 1) {
      const previous = working[index];
      const nextClip = working[index + 1];
      if (!previous || !nextClip || previous.beatLocked || nextClip.beatLocked) continue;
      const boundary = clipStartAt(index + 1, working);
      let target = effectiveBeatCandidates[0] ?? boundary;
      let distance = Math.abs(target - boundary);
      for (const candidate of effectiveBeatCandidates) {
        const candidateDistance = Math.abs(candidate - boundary);
        if (candidateDistance < distance) { target = candidate; distance = candidateDistance; }
      }
      if (distance > tolerance) continue;
      const proposedTrimOut = clamp(previous.trimOut + (target - boundary), previous.trimIn + 0.25, previous.sourceDuration);
      const delta = proposedTrimOut - previous.trimOut;
      if (Math.abs(delta) < 0.015) continue;
      const appliedTarget = boundary + delta;
      preview.push({
        clipId: previous.id,
        nextClipId: nextClip.id,
        index,
        boundary,
        target: appliedTarget,
        delta,
        downbeat: downbeatTimes.some((time) => Math.abs(time - target) < 0.025),
        manual: manualBeatMarkers.some((time) => Math.abs(time - target) < 0.025),
      });
      working[index] = { ...previous, trimOut: proposedTrimOut };
    }
    return preview;
  }, [activeBeatAnalysis, beatStep, beatSyncStrength, clips, downbeatTimes, effectiveBeatCandidates, manualBeatMarkers]);
  const musicRecommendationProfile = useMemo(
    () => buildMusicRecommendationProfile(channel, projectTitle, layers, aiGoal),
    [aiGoal, channel, layers, projectTitle],
  );
  const recommendedMusicTracks = useMemo<MusicRecommendation[]>(() => {
    const projectLength = Math.max(0, realProjectDuration);
    return musicTracks
      .flatMap((track) => {
        const usage = track.usage;
        const allowed = musicRecommendationProfile.paidCampaign
          ? usage?.paidAdsAllowed === true
          : usage?.organicAllowed === true;
        if (!allowed || usage?.expired === true) return [];

        const metadata = metadataRecord(track);
        const reasons: string[] = [];
        let score = 0;
        if (metadata.brandOfficial === true) { score += 14; reasons.push("Oficial da marca"); }
        if (track.id === brandDefaultTrackId) { score += 8; reasons.push("Brand Kit"); }

        const uses = trackBrandUses(track);
        const matchedUses = musicRecommendationProfile.targetUses.filter((use) => uses.includes(use));
        if (matchedUses.length) {
          score += 14 + Math.min(8, Math.max(0, matchedUses.length - 1) * 4);
          reasons.push(matchedUses.map((use) => MUSIC_BRAND_USE_LABELS[use]).join(" + "));
        }

        const mood = normalizedText(metadata.mood);
        if (mood && musicRecommendationProfile.moodTerms.some((term) => mood.includes(normalizedText(term)))) {
          score += 16;
          reasons.push(`Mood · ${String(metadata.mood)}`);
        }

        const genre = Array.isArray(metadata.genre)
          ? normalizedText(stringList(metadata.genre).join(" "))
          : normalizedText(metadata.genre);
        if (genre && musicRecommendationProfile.genreTerms.some((term) => genre.includes(normalizedText(term)))) {
          score += 12;
          reasons.push(`Gênero · ${Array.isArray(metadata.genre) ? stringList(metadata.genre).join(", ") : String(metadata.genre)}`);
        }

        const bpm = numberMetadata(track, "bpm");
        if (bpm !== null) {
          if (bpm >= musicRecommendationProfile.bpmMin && bpm <= musicRecommendationProfile.bpmMax) {
            score += 18;
            reasons.push(`${Math.round(bpm)} BPM`);
          } else {
            const distance = bpm < musicRecommendationProfile.bpmMin ? musicRecommendationProfile.bpmMin - bpm : bpm - musicRecommendationProfile.bpmMax;
            score += Math.max(0, 10 - distance / 3);
          }
        }

        if (metadata.favorite === true) score += 4;
        const duration = numberMetadata(track, "durationSeconds");
        if (duration !== null && projectLength > 0) {
          if (duration >= projectLength) score += 6;
          else if (duration >= projectLength * 0.6) score += 3;
        }

        const compatibility = clamp(Math.round(score), 0, 100);
        if (!reasons.length) reasons.push("Direitos compatíveis; faltam metadados criativos para pontuação maior");
        return [{ track, score: compatibility, compatibility, reasons: reasons.slice(0, 4) }];
      })
      .sort((left, right) => right.compatibility - left.compatibility || assetName(left.track).localeCompare(assetName(right.track), "pt-BR"))
      .slice(0, 3);
  }, [brandDefaultTrackId, musicRecommendationProfile, musicTracks, realProjectDuration]);
  const soundEffectAssets = useMemo(() => assets.filter((asset) => asset.type === "audio" && audioAssetKind(asset) === "sound_effect"), [assets]);
  const autoEligibleSfx = useMemo(() => soundEffectAssets.filter(sfxAutomationAllowed), [soundEffectAssets]);
  const intensityMap = useMemo<IntensityPoint[]>(() => {
    const duration = realProjectDuration;
    if (!duration || duration <= 0) return [];
    const bins = Math.min(48, Math.max(14, Math.round(duration * 1.4)));
    const boundaries = clips.slice(1).map((_, index) => clipStartAt(index + 1, clips));
    const points: IntensityPoint[] = [];
    for (let index = 0; index < bins; index += 1) {
      const time = bins === 1 ? 0 : duration * index / (bins - 1);
      let score = 16;
      const reasons: string[] = [];
      if (activeBeatAnalysis?.waveform.length) {
        const waveIndex = Math.min(activeBeatAnalysis.waveform.length - 1, Math.round(index / Math.max(1, bins - 1) * (activeBeatAnalysis.waveform.length - 1)));
        const energy = activeBeatAnalysis.waveform[waveIndex] ?? 0;
        score += energy * 34;
        if (energy > 0.72) reasons.push("energia da trilha");
      }
      if (downbeatTimes.some((beat) => Math.abs(beat - time) < 0.14)) { score += 12; reasons.push("downbeat"); }
      if (boundaries.some((boundary) => Math.abs(boundary - time) < 0.3)) { score += 10; reasons.push("corte/transição"); }
      const activeLayers = layers.filter((layer) => time >= layer.start && time <= layer.end);
      const nearbyVisual = layers.some((layer) => Math.abs(layer.start - time) < 0.25 || Math.abs(layer.end - time) < 0.2);
      if (nearbyVisual) { score += 7; reasons.push("entrada visual"); }
      const speech = activeLayers.filter((layer) => layer.contentKind === "caption").map((layer) => normalizedText(layer.text)).join(" ");
      if (speech) {
        score += 5;
        if (/(oferta|desconto|agora|hoje|novo|novidade|resultado|beneficio|garantia|econom|importante|melhor|exclusiv|chamada|whatsapp)/.test(speech)) {
          score += 19;
          reasons.push("fala de impacto");
        }
      }
      const narrativePeak = duration * 0.72;
      const narrativeDistance = Math.abs(time - narrativePeak) / Math.max(0.1, duration);
      score += Math.max(0, 7 * (1 - narrativeDistance * 7));
      points.push({ time, score: clamp(Math.round(score), 0, 100), reasons: Array.from(new Set(reasons)).slice(0, 3) });
    }
    return points;
  }, [activeBeatAnalysis, clips, downbeatTimes, layers, realProjectDuration]);
  const climaxPoint = useMemo(() => intensityMap.reduce<IntensityPoint | null>((best, point) => !best || point.score > best.score ? point : best, null), [intensityMap]);
  const sfxSuggestions = useMemo<SfxSuggestion[]>(() => {
    if (!autoEligibleSfx.length || !climaxPoint || realProjectDuration <= 0) return [];
    const pick = (categories: string[]) => autoEligibleSfx.find((asset) => categories.includes(sfxCategoryFor(asset))) ?? null;
    const result: SfxSuggestion[] = [];
    const impact = pick(["impact", "success", "click"]);
    if (impact) result.push({ id: `impact-${impact.id}-${climaxPoint.time.toFixed(2)}`, asset: impact, start: clamp(climaxPoint.time, 0, realProjectDuration), duration: Math.min(2.2, numberMetadata(impact as LibraryTrack, "durationSeconds") ?? 1.4), volume: 0.68, reason: `Clímax ${climaxPoint.score}/100`, category: sfxCategoryFor(impact) });
    const transitionTime = clips.length > 1 ? clipStartAt(1, clips) : layers.find((layer) => layer.type === "card")?.start;
    const whoosh = pick(["whoosh"]);
    if (whoosh && Number.isFinite(Number(transitionTime))) result.push({ id: `whoosh-${whoosh.id}-${Number(transitionTime).toFixed(2)}`, asset: whoosh, start: clamp(Number(transitionTime), 0, realProjectDuration), duration: Math.min(1.8, numberMetadata(whoosh as LibraryTrack, "durationSeconds") ?? 1), volume: 0.5, reason: "Entrada de corte/elemento visual", category: "whoosh" });
    const riser = pick(["riser"]);
    if (riser && climaxPoint.time > 0.7) result.push({ id: `riser-${riser.id}-${climaxPoint.time.toFixed(2)}`, asset: riser, start: clamp(climaxPoint.time - 0.8, 0, realProjectDuration), duration: Math.min(1.4, numberMetadata(riser as LibraryTrack, "durationSeconds") ?? 1.2), volume: 0.42, reason: "Construção antes do clímax", category: "riser" });
    return result.slice(0, 3);
  }, [autoEligibleSfx, climaxPoint, clips, layers, realProjectDuration]);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;
  const canSplit = Boolean(locatedPreview && timelineTime - locatedPreview.start > 0.1 && locatedPreview.end - timelineTime > 0.1);
  void historyTick;

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { sfxCuesRef.current = sfxCues; }, [sfxCues]);

  const recordHistory = useCallback((snapshot: EditorSnapshot) => {
    const clean = cloneSnapshot(snapshot);
    const previous = historyRef.current[historyIndexRef.current] ?? { clips: [], layers: [], sfxCues: [] };
    const serialize = (value: EditorSnapshot) => JSON.stringify({
      clips: value.clips.map(({ localFile: _localFile, ...clip }) => clip),
      layers: value.layers.map(({ localFile: _localFile, ...layer }) => layer),
      sfxCues: value.sfxCues ?? [],
    });
    if (serialize(previous) === serialize(clean)) return;
    const nextHistory = [...historyRef.current.slice(0, historyIndexRef.current + 1), clean].slice(-60);
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setHistoryTick((value) => value + 1);
  }, []);

  const commitEditor = useCallback((nextClips: VideoClip[], nextLayers: EditorLayer[], nextSfxCues: SfxCue[] = sfxCuesRef.current) => {
    clipsRef.current = nextClips;
    layersRef.current = nextLayers;
    sfxCuesRef.current = nextSfxCues;
    setClips(nextClips);
    setLayers(nextLayers);
    setSfxCues(nextSfxCues);
    recordHistory({ clips: nextClips, layers: nextLayers, sfxCues: nextSfxCues });
  }, [recordHistory]);

  const resetEditorHistory = useCallback((nextClips: VideoClip[], nextLayers: EditorLayer[], nextSfxCues: SfxCue[] = []) => {
    const snapshot = cloneSnapshot({ clips: nextClips, layers: nextLayers, sfxCues: nextSfxCues });
    clipsRef.current = snapshot.clips;
    layersRef.current = snapshot.layers;
    sfxCuesRef.current = snapshot.sfxCues ?? [];
    setClips(snapshot.clips);
    setLayers(snapshot.layers);
    setSfxCues(snapshot.sfxCues ?? []);
    historyRef.current = [snapshot];
    historyIndexRef.current = 0;
    setHistoryTick((value) => value + 1);
  }, []);

  const restoreSnapshot = useCallback((snapshot: EditorSnapshot) => {
    const next = cloneSnapshot(snapshot);
    clipsRef.current = next.clips;
    layersRef.current = next.layers;
    sfxCuesRef.current = next.sfxCues ?? [];
    setClips(next.clips);
    setLayers(next.layers);
    setSfxCues(next.sfxCues ?? []);
    setTimelineTime((time) => clamp(time, 0, Math.max(0, projectDurationFor(next.clips))));
    if (selectedLayerId && !next.layers.some((layer) => layer.id === selectedLayerId)) setSelectedLayerId("");
    if (selectedClipId && !next.clips.some((clip) => clip.id === selectedClipId)) setSelectedClipId("");
    if (activeClipId && !next.clips.some((clip) => clip.id === activeClipId)) setActiveClipId(next.clips[0]?.id ?? "");
  }, [activeClipId, selectedClipId, selectedLayerId]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    restoreSnapshot(historyRef.current[historyIndexRef.current] ?? { clips: [], layers: [], sfxCues: [] });
    setHistoryTick((value) => value + 1);
  }, [restoreSnapshot]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    restoreSnapshot(historyRef.current[historyIndexRef.current] ?? { clips: [], layers: [], sfxCues: [] });
    setHistoryTick((value) => value + 1);
  }, [restoreSnapshot]);

  const selectLayer = useCallback((id: string) => {
    setSelectedLayerId(id);
    setSelectedClipId("");
  }, []);

  const selectClip = useCallback((id: string) => {
    setSelectedClipId(id);
    setSelectedLayerId("");
  }, []);

  const duplicateLayer = useCallback((id = selectedLayerId) => {
    const source = layersRef.current.find((layer) => layer.id === id);
    if (!source) return;
    const duration = Math.max(0.1, source.end - source.start);
    const total = Math.max(0.1, projectDurationFor(clipsRef.current));
    const nextStart = clamp(source.start + 0.35, 0, Math.max(0, total - duration));
    const copy: EditorLayer = {
      ...source,
      id: uid(source.type),
      name: `${source.name} · cópia`,
      start: nextStart,
      end: Math.min(total, nextStart + duration),
      x: clamp(source.x + 2, 0, 95),
      y: clamp(source.y + 2, 0, 95),
    };
    commitEditor(clipsRef.current, [...layersRef.current, copy]);
    selectLayer(copy.id);
  }, [commitEditor, selectLayer, selectedLayerId]);

  const removeLayer = useCallback((id: string) => {
    commitEditor(clipsRef.current, layersRef.current.filter((layer) => layer.id !== id));
    if (selectedLayerId === id) setSelectedLayerId("");
  }, [commitEditor, selectedLayerId]);

  const duplicateClip = useCallback((id = selectedClipId) => {
    const index = clipsRef.current.findIndex((clip) => clip.id === id);
    const source = clipsRef.current[index];
    if (!source) return;
    const copy: VideoClip = { ...source, id: uid("clip"), name: `${source.name} · cópia` };
    const next = [...clipsRef.current];
    next.splice(index + 1, 0, copy);
    commitEditor(next, layersRef.current);
    selectClip(copy.id);
  }, [commitEditor, selectClip, selectedClipId]);

  const commitSfxCues = useCallback((next: SfxCue[]) => {
    commitEditor(clipsRef.current, layersRef.current, next.sort((a, b) => a.start - b.start));
  }, [commitEditor]);

  const addSfxCue = useCallback((asset: MediaAsset, at = timelineTime, options?: Partial<Pick<SfxCue, "duration" | "volume" | "category">>) => {
    const url = assetUrl(asset);
    if (!url) return;
    const duration = clamp(options?.duration ?? numberMetadata(asset as LibraryTrack, "durationSeconds") ?? 1.4, 0.12, Math.max(0.12, realProjectDuration - at));
    const cue: SfxCue = {
      id: uid("sfx"), assetId: asset.id, name: assetName(asset), url,
      start: clamp(at, 0, Math.max(0, realProjectDuration - 0.05)), duration, trimIn: 0,
      volume: clamp(options?.volume ?? 0.58, 0, 1.2), category: options?.category ?? sfxCategoryFor(asset),
    };
    commitSfxCues([...sfxCuesRef.current, cue]);
  }, [commitSfxCues, realProjectDuration, timelineTime]);

  const updateSfxCue = useCallback((id: string, patch: Partial<SfxCue>) => {
    commitSfxCues(sfxCuesRef.current.map((cue) => cue.id === id ? { ...cue, ...patch, start: clamp(patch.start ?? cue.start, 0, Math.max(0, realProjectDuration)), duration: clamp(patch.duration ?? cue.duration, 0.12, Math.max(0.12, realProjectDuration)) } : cue));
  }, [commitSfxCues, realProjectDuration]);

  const removeSfxCue = useCallback((id: string) => {
    commitSfxCues(sfxCuesRef.current.filter((cue) => cue.id !== id));
  }, [commitSfxCues]);

  const applySuggestedSfx = useCallback(() => {
    if (!sfxSuggestions.length) return;
    const existingKeys = new Set(sfxCuesRef.current.map((cue) => `${cue.assetId}:${cue.start.toFixed(2)}`));
    const additions = sfxSuggestions.filter((item) => !existingKeys.has(`${item.asset.id}:${item.start.toFixed(2)}`)).map((item) => ({
      id: uid("sfx-auto"), assetId: item.asset.id, name: assetName(item.asset), url: assetUrl(item.asset), start: item.start,
      duration: item.duration, trimIn: 0, volume: item.volume, category: item.category,
    })).filter((cue) => cue.url);
    if (!additions.length) { toast({ title: "SFX já aplicados", description: "As sugestões atuais já estão na timeline." }); return; }
    commitSfxCues([...sfxCuesRef.current, ...additions]);
    logEditorEvent("sfx_applied", { count: additions.length, climaxScore: climaxPoint?.score ?? null });
    toast({ title: "SFX inteligentes aplicados", description: `${additions.length} efeito${additions.length === 1 ? "" : "s"} entrou${additions.length === 1 ? "" : "aram"} nos momentos de maior impacto.` });
  }, [climaxPoint?.score, commitSfxCues, logEditorEvent, sfxSuggestions, toast]);

  const previewSfxAsset = useCallback(async (asset: MediaAsset) => {
    const url = assetUrl(asset);
    if (!url) return;
    try {
      const response = await fetch(url, { headers: url.startsWith("/api/") ? tokenHeaders() : undefined });
      if (!response.ok) throw new Error("Não foi possível carregar o efeito.");
      const blobUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(blobUrl);
      audio.volume = 0.65;
      audio.onended = () => URL.revokeObjectURL(blobUrl);
      audio.onerror = () => URL.revokeObjectURL(blobUrl);
      await audio.play();
    } catch (error) {
      toast({ title: "Prévia indisponível", description: error instanceof Error ? error.message : "Falha ao reproduzir SFX", variant: "destructive" });
    }
  }, [toast]);

  const addManualBeatMarker = useCallback(() => {
    const marker = Math.round(clamp(timelineTime, 0, realProjectDuration) * 1000) / 1000;
    setManualBeatMarkers((current) => [...current.filter((time) => Math.abs(time - marker) > 0.04), marker].sort((a, b) => a - b));
  }, [realProjectDuration, timelineTime]);

  const syncCutsToBeats = useCallback(() => {
    if (!activeBeatAnalysis || effectiveBeatCandidates.length === 0) {
      toast({ title: "Analise a trilha primeiro", description: "Detecte as batidas antes de sincronizar os cortes." });
      return;
    }
    if (clipsRef.current.length < 2) {
      toast({ title: "Adicione mais clipes", description: "O Beat Sync precisa de pelo menos dois clipes para alinhar cortes." });
      return;
    }
    if (!beatCutPreview.length) {
      toast({ title: "Nenhum ajuste necessário", description: "Os cortes já estão no ritmo, estão bloqueados ou ficaram fora da tolerância escolhida." });
      return;
    }

    const nextClips = clipsRef.current.map((clip) => ({ ...clip }));
    for (const item of beatCutPreview) {
      const clip = nextClips[item.index];
      if (!clip || clip.id !== item.clipId || clip.beatLocked) continue;
      const boundary = clipStartAt(item.index + 1, nextClips);
      const nextTrimOut = clamp(clip.trimOut + (item.target - boundary), clip.trimIn + 0.25, clip.sourceDuration);
      const accent: Partial<VideoClip> = {};
      if (syncVisualAccents && item.downbeat) {
        if (beatSyncStrength === "light") { accent.transitionOut = "fade"; accent.transitionDuration = 0.2; }
        else if (beatSyncStrength === "aggressive") { accent.transitionOut = "zoom"; accent.transitionDuration = 0.34; }
        else { accent.transitionOut = "crossfade"; accent.transitionDuration = 0.28; }
      }
      nextClips[item.index] = { ...clip, trimOut: nextTrimOut, ...accent };
      if (syncVisualAccents && item.downbeat && beatSyncStrength === "aggressive") {
        const following = nextClips[item.index + 1];
        if (following && !following.beatLocked && (following.motion ?? "none") === "none") {
          nextClips[item.index + 1] = { ...following, motion: item.index % 2 === 0 ? "zoom-in" : "zoom-out" };
        }
      }
    }

    const visualTolerance = beatSyncStrength === "light" ? 0.12 : beatSyncStrength === "aggressive" ? 0.34 : 0.22;
    let visualAccents = 0;
    const nextLayers = layersRef.current.map((layer) => {
      if (!syncVisualAccents) return layer;
      let nearest = effectiveBeatCandidates[0] ?? layer.start;
      let distance = Math.abs(nearest - layer.start);
      for (const candidate of effectiveBeatCandidates) {
        const d = Math.abs(candidate - layer.start);
        if (d < distance) { nearest = candidate; distance = d; }
      }
      if (distance > visualTolerance) return layer;
      const strong = downbeatTimes.some((time) => Math.abs(time - nearest) < 0.03);
      if (layer.contentKind === "caption") {
        if (!strong) return layer;
        visualAccents += 1;
        return { ...layer, enterAnimation: "pop" as LayerAnimation, animationDuration: Math.min(layer.animationDuration ?? 0.35, 0.22) };
      }
      const duration = Math.max(0.1, layer.end - layer.start);
      const shiftedStart = clamp(nearest, 0, Math.max(0, projectDurationFor(nextClips) - duration));
      if (Math.abs(shiftedStart - layer.start) < 0.01 && !strong) return layer;
      visualAccents += 1;
      return {
        ...layer,
        start: shiftedStart,
        end: shiftedStart + duration,
        enterAnimation: strong ? (beatSyncStrength === "aggressive" ? "zoom" : "pop") as LayerAnimation : layer.enterAnimation,
        animationDuration: strong ? Math.min(layer.animationDuration ?? 0.35, 0.24) : layer.animationDuration,
      };
    });

    commitEditor(nextClips, nextLayers);
    const nextDuration = projectDurationFor(nextClips);
    setTimelineTime((time) => clamp(time, 0, Math.max(0, nextDuration)));
    setMusicEnd((current) => Math.min(current, Math.max(0.1, nextDuration)));
    toast({ title: "Beat Sync avançado aplicado", description: `${beatCutPreview.length} corte${beatCutPreview.length === 1 ? "" : "s"} alinhado${beatCutPreview.length === 1 ? "" : "s"}${visualAccents ? ` · ${visualAccents} acento${visualAccents === 1 ? "" : "s"} visual${visualAccents === 1 ? "" : "is"}` : ""}.` });
  }, [activeBeatAnalysis, beatCutPreview, beatSyncStrength, commitEditor, downbeatTimes, effectiveBeatCandidates, syncVisualAccents, toast]);

  const removeClip = useCallback((id: string) => {
    const current = clipsRef.current;
    const index = current.findIndex((clip) => clip.id === id);
    if (index < 0) return;
    const next = current.filter((clip) => clip.id !== id);
    commitEditor(next, layersRef.current);
    const nextSelected = next[Math.min(index, next.length - 1)] ?? next[0];
    setSelectedClipId(nextSelected?.id ?? "");
    setActiveClipId(nextSelected?.id ?? "");
    const nextDuration = projectDurationFor(next);
    setTimelineTime((time) => clamp(time, 0, Math.max(0, nextDuration)));
  }, [commitEditor]);

  const moveClip = useCallback((id: string, direction: -1 | 1) => {
    const current = [...clipsRef.current];
    const index = current.findIndex((clip) => clip.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    const [clip] = current.splice(index, 1);
    if (!clip) return;
    current.splice(nextIndex, 0, clip);
    commitEditor(current, layersRef.current);
  }, [commitEditor]);

  const reorderClip = useCallback((draggedId: string, targetId: string) => {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const current = [...clipsRef.current];
    const from = current.findIndex((clip) => clip.id === draggedId);
    const to = current.findIndex((clip) => clip.id === targetId);
    if (from < 0 || to < 0) return;
    const [clip] = current.splice(from, 1);
    if (!clip) return;
    current.splice(to, 0, clip);
    commitEditor(current, layersRef.current);
  }, [commitEditor]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches("input, textarea, select") || target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && !isEditing) {
        event.preventDefault();
        if (selectedLayerId) duplicateLayer(selectedLayerId);
        else if (selectedClipId) duplicateClip(selectedClipId);
        return;
      }
      if (!isEditing && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        if (selectedLayerId) removeLayer(selectedLayerId);
        else if (selectedClipId) removeClip(selectedClipId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [duplicateClip, duplicateLayer, redo, removeClip, removeLayer, selectedClipId, selectedLayerId, undo]);

  const serializedContext = useMemo(() => ({
    editorVersion: 15,
    channel,
    ratio,
    quality,
    sourceAssetId: clips[0]?.assetId ?? null,
    trimStart: clips[0]?.trimIn ?? 0,
    trimEnd: clips[0]?.trimOut ?? 0,
    clips: clips.map(({ localFile: _localFile, ...clip }) => clip),
    layers: layers.map(({ localFile: _localFile, ...layer }) => layer),
    aiEditPlan: aiPlan,
    aiGoal,
    aiInstructions,
    autoEditPresetId: selectedAutoPresetId || null,
    sfx: sfxCues,
    audio: {
      mode: musicMode,
      assetId: musicAssetId || null,
      volume: musicVolume,
      originalVolume,
      start: musicStart,
      end: musicEnd,
      ducking: { enabled: duckingEnabled, reduction: duckingReduction, thresholdPct: duckingThresholdPct, attackMs: duckingAttackMs, releaseMs: duckingReleaseMs },
      fadeIn: musicFadeIn,
      fadeOut: musicFadeOut,
      smartLoop: smartMusicLoop,
      volumePoints: musicVolumePoints,
      loudnessTarget,
      beatSync: activeBeatAnalysis ? {
        bpm: activeBeatAnalysis.bpm,
        offset: activeBeatAnalysis.offset,
        confidence: activeBeatAnalysis.confidence,
        source: activeBeatAnalysis.source,
        step: beatStep,
        showMarkers: showBeatMarkers,
        waveform: activeBeatAnalysis.waveform,
        downbeatIndex: activeBeatAnalysis.downbeatIndex,
        strength: beatSyncStrength,
        manualMarkers: manualBeatMarkers,
        syncVisualAccents,
      } : null,
    },
  }), [channel, ratio, quality, clips, layers, aiPlan, aiGoal, aiInstructions, selectedAutoPresetId, sfxCues, musicMode, musicAssetId, musicVolume, originalVolume, musicStart, musicEnd, duckingEnabled, duckingReduction, duckingThresholdPct, duckingAttackMs, duckingReleaseMs, musicFadeIn, musicFadeOut, smartMusicLoop, musicVolumePoints, loudnessTarget, activeBeatAnalysis, beatStep, showBeatMarkers, beatSyncStrength, manualBeatMarkers, syncVisualAccents]);

  const ensureProject = useCallback(async (): Promise<string> => {
    if (projectId) return projectId;
    if (!tenantId) throw new Error("Tenant não definido");
    const response = await fetch(`/api/tenants/${tenantId}/media/projects`, {
      method: "POST",
      headers: tokenHeaders(true),
      body: JSON.stringify({ title: projectTitle, kind: "video", source: "content_studio_editor", context: serializedContext }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o projeto");
    const id = String(data.project?.id ?? "");
    if (!id) throw new Error("Projeto criado sem identificação");
    setProjectId(id);
    window.history.replaceState(null, "", `${window.location.pathname}?projectId=${encodeURIComponent(id)}`);
    return id;
  }, [projectId, projectTitle, serializedContext, tenantId]);

  const saveProject = useCallback(async (silent = false) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const id = await ensureProject();
      const response = await fetch(`/api/tenants/${tenantId}/media/projects/${id}`, {
        method: "PATCH",
        headers: tokenHeaders(true),
        body: JSON.stringify({ title: projectTitle, context: serializedContext }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar o projeto");
      setLastSavedAt(new Date());
      if (!silent) toast({ title: "Projeto salvo", description: "Clipes, timeline e configurações foram salvos na Central de Mídias." });
    } catch (error) {
      if (!silent) toast({ title: "Erro ao salvar", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [ensureProject, projectTitle, serializedContext, tenantId, toast]);

  useEffect(() => {
    if (!projectId) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => { void saveProject(true); }, 900);
    return () => {
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [projectId, projectTitle, saveProject, serializedContext]);

  const loadAssets = useCallback(async () => {
    if (!tenantId) return;
    setAssetsLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, { headers: tokenHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao carregar biblioteca");
      setAssets(Array.isArray(data.assets) ? data.assets : []);
    } catch (error) {
      toast({ title: "Biblioteca indisponível", description: error instanceof Error ? error.message : "Falha ao carregar mídias", variant: "destructive" });
    } finally {
      setAssetsLoading(false);
    }
  }, [tenantId, toast]);

  const loadMusic = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [tracksResponse, kitResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/media/tracks?limit=120`, { headers: tokenHeaders() }),
        fetch(`/api/tenants/${tenantId}/media-engine/brand-kit`, { headers: tokenHeaders() }),
      ]);
      const tracksData = await tracksResponse.json();
      const kitData = await kitResponse.json() as BrandKitPayload;
      setMusicTracks(Array.isArray(tracksData.tracks) ? tracksData.tracks : []);
      setBrandDefaultTrackId(kitData.brandKit?.default_music_asset_id ?? "");
    } catch {
      setMusicTracks([]);
    }
  }, [tenantId]);

  const analyzeMusicBeats = useCallback(async () => {
    if (!currentMusicKey || beatAnalyzing) return;
    const bpmHint = selectedTrack ? numberMetadata(selectedTrack, "bpm") : null;
    const loadAnalysisBlob = async (): Promise<Blob> => {
      if (musicMode === "upload" && musicFile) return musicFile;
      if (selectedTrack) {
        const url = assetUrl(selectedTrack);
        if (!url) throw new Error("A trilha selecionada não possui arquivo de áudio.");
        const response = await fetch(url, { headers: url.startsWith("/api/") ? tokenHeaders() : undefined });
        if (!response.ok) throw new Error("Não foi possível carregar a trilha para análise.");
        return await response.blob();
      }
      throw new Error("Selecione uma trilha antes de analisar as batidas.");
    };

    setBeatAnalyzing(true);
    let browserError: unknown = null;
    try {
      const blob = await loadAnalysisBlob();
      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("Seu navegador não oferece análise de áudio compatível.");
      const audioContext = new AudioContextCtor();
      try {
        const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
        const analysis = analyzeAudioBufferBeats(buffer, bpmHint);
        setBeatAnalysis({ ...analysis, trackKey: currentMusicKey });
        setShowBeatMarkers(true);
        logEditorEvent("beat_analyzed", { bpm: analysis.bpm, confidence: analysis.confidence, source: "browser" });
        toast({ title: "Batidas detectadas", description: `${analysis.bpm.toFixed(1)} BPM · grade sincronizada com a trilha.` });
        return;
      } finally {
        await audioContext.close().catch(() => undefined);
      }
    } catch (error) {
      browserError = error;
    }

    try {
      const blob = await loadAnalysisBlob();
      const form = new FormData();
      form.append("audio", new File([blob], musicFile?.name ?? (selectedTrack ? assetName(selectedTrack) : "trilha-audio"), { type: blob.type || "audio/mpeg" }));
      if (bpmHint) form.append("bpmHint", String(bpmHint));
      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/analyze-audio`, { method: "POST", headers: tokenHeaders(), body: form });
      const data = await response.json() as { analysis?: Omit<BeatAnalysis, "trackKey">; error?: string };
      if (!response.ok || !data.analysis) throw new Error(data.error ?? "O servidor não conseguiu analisar a trilha");
      const analysis: BeatAnalysis = { ...data.analysis, source: "server", trackKey: currentMusicKey };
      setBeatAnalysis(analysis);
      setShowBeatMarkers(true);
      logEditorEvent("beat_fallback_server", { bpm: analysis.bpm, confidence: analysis.confidence, browserError: browserError instanceof Error ? browserError.message : String(browserError ?? "") });
      toast({ title: "Batidas detectadas no servidor", description: `${analysis.bpm.toFixed(1)} BPM · fallback seguro aplicado.` });
    } catch (serverError) {
      if (bpmHint && bpmHint > 0) {
        setBeatAnalysis({ trackKey: currentMusicKey, bpm: bpmHint, offset: 0, confidence: 0.35, source: "metadata", waveform: [], downbeatIndex: 0 });
        setShowBeatMarkers(true);
        toast({ title: "Grade criada pelo BPM", description: "A análise de áudio falhou, então usei o BPM cadastrado no Music Hub." });
      } else {
        const message = serverError instanceof Error ? serverError.message : browserError instanceof Error ? browserError.message : "Falha na análise da trilha";
        toast({ title: "Não foi possível detectar as batidas", description: message, variant: "destructive" });
      }
    } finally {
      setBeatAnalyzing(false);
    }
  }, [beatAnalyzing, currentMusicKey, logEditorEvent, musicFile, musicMode, selectedTrack, tenantId, toast]);

  useEffect(() => {
    void loadAssets();
    void loadMusic();
  }, [loadAssets, loadMusic]);

  useEffect(() => {
    const requested = requestedMusicAssetId.current;
    if (!requested || musicTracks.length === 0) return;
    if (musicTracks.some((track) => track.id === requested)) {
      setMusicMode("library");
      setMusicAssetId(requested);
      setTool("audio");
      requestedMusicAssetId.current = "";
    }
  }, [musicTracks]);

  useEffect(() => {
    if (!projectId || !tenantId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/media/projects/${projectId}`, { headers: tokenHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Projeto não encontrado");
        if (cancelled) return;
        const project = data.project ?? {};
        const context = project.context ?? {};
        const projectAssets = Array.isArray(data.assets) ? data.assets as MediaAsset[] : [];
        setProjectTitle(project.title ?? "Projeto de vídeo");
        if (context.channel) setChannel(context.channel);
        if (["9:16", "16:9", "1:1", "4:5"].includes(context.ratio)) setRatio(context.ratio);
        if (["720p", "1080p"].includes(context.quality)) setQuality(context.quality);
        if (typeof context.aiGoal === "string" && AI_EDIT_GOALS.some((goal) => goal.id === context.aiGoal)) setAiGoal(context.aiGoal);
        if (typeof context.aiInstructions === "string") setAiInstructions(context.aiInstructions.slice(0, 800));
        if (typeof context.autoEditPresetId === "string" && AUTO_EDIT_PRESETS.some((preset) => preset.id === context.autoEditPresetId)) setSelectedAutoPresetId(context.autoEditPresetId);
        if (context.aiEditPlan && Array.isArray(context.aiEditPlan.suggestions)) {
          const restoredPlan = context.aiEditPlan as AiEditPlan;
          setAiPlan(restoredPlan);
          setAiSelectedIds(new Set(restoredPlan.suggestions.map((item) => item.id)));
        }

        let nextClips: VideoClip[] = [];
        if (Array.isArray(context.clips)) {
          nextClips = context.clips.map((raw: Partial<VideoClip>, index: number) => {
            const stored = projectAssets.find((asset) => asset.id === raw.assetId);
            const sourceDuration = Math.max(0.1, Number(raw.sourceDuration) || Number(raw.trimOut) || 0.1);
            const trimIn = clamp(Number(raw.trimIn) || 0, 0, Math.max(0, sourceDuration - 0.1));
            const trimOut = clamp(Number(raw.trimOut) || sourceDuration, trimIn + 0.1, sourceDuration);
            return {
              id: String(raw.id || uid("clip")),
              name: String(raw.name || (stored ? assetName(stored) : `Clipe ${index + 1}`)),
              url: stored ? assetUrl(stored) : String(raw.url || ""),
              assetId: raw.assetId || stored?.id,
              sourceDuration,
              trimIn,
              trimOut,
              transitionOut: (["cut", "fade", "crossfade", "zoom", "slide-left", "slide-right"] as string[]).includes(String(raw.transitionOut)) ? raw.transitionOut as TransitionType : "cut",
              transitionDuration: clamp(Number(raw.transitionDuration) || 0.45, 0.1, 1.5),
              motion: (["none", "zoom-in", "zoom-out", "pan-left", "pan-right"] as string[]).includes(String(raw.motion)) ? raw.motion as ClipMotion : "none",
              beatLocked: raw.beatLocked === true,
            };
          }).filter((clip: VideoClip) => Boolean(clip.url));
        }
        if (!nextClips.length) {
          const sourceId = typeof context.sourceAssetId === "string" ? context.sourceAssetId : "";
          const source = projectAssets.find((asset) => asset.id === sourceId) ?? projectAssets.find((asset) => asset.type === "video" && asset.role === "source");
          if (source) {
            const legacyStart = Math.max(0, Number(context.trimStart) || 0);
            const legacyEnd = Math.max(legacyStart + 0.1, Number(context.trimEnd) || 30);
            nextClips = [{
              id: uid("clip"),
              name: assetName(source),
              url: assetUrl(source),
              assetId: source.id,
              sourceDuration: legacyEnd,
              trimIn: legacyStart,
              trimOut: legacyEnd,
              transitionOut: "cut",
              transitionDuration: 0.45,
              motion: "none",
            }];
          }
        }
        const nextLayers: EditorLayer[] = Array.isArray(context.layers) ? (context.layers as EditorLayer[]).map((layer) => ({
          ...layer,
          scale: Number.isFinite(Number(layer.scale)) ? Number(layer.scale) : 1,
          rotation: Number.isFinite(Number(layer.rotation)) ? Number(layer.rotation) : 0,
          easing: (["linear", "ease-in", "ease-out", "ease-in-out"] as string[]).includes(String(layer.easing)) ? layer.easing as EasingType : "ease-in-out",
          textAlign: (["left", "center", "right"] as string[]).includes(String(layer.textAlign)) ? layer.textAlign as TextAlign : "left",
          enterAnimation: (["none", "fade", "pop", "zoom", "slide-up", "slide-down", "slide-left", "slide-right"] as string[]).includes(String(layer.enterAnimation)) ? layer.enterAnimation as LayerAnimation : "none",
          exitAnimation: (["none", "fade", "pop", "zoom", "slide-up", "slide-down", "slide-left", "slide-right"] as string[]).includes(String(layer.exitAnimation)) ? layer.exitAnimation as LayerAnimation : "none",
          animationDuration: clamp(Number(layer.animationDuration) || 0.35, 0.1, 1.5),
          contentKind: layer.contentKind === "caption" ? "caption" : layer.contentKind === "sticker" ? "sticker" : "text",
          captionStyle: (["impact", "highlight", "clean", "minimal"] as string[]).includes(String(layer.captionStyle)) ? layer.captionStyle as CaptionStylePreset : undefined,
          captionMotion: layer.contentKind === "caption" && (["none", "word-pop", "word-bounce", "pulse", "karaoke"] as string[]).includes(String(layer.captionMotion)) ? layer.captionMotion as CaptionMotion : layer.contentKind === "caption" ? "word-pop" : undefined,
          captionWords: Array.isArray(layer.captionWords) ? layer.captionWords.map((word) => ({
            word: String(word.word ?? "").trim(),
            start: Math.max(0, Number(word.start) || 0),
            end: Math.max(0, Number(word.end) || 0),
          })).filter((word) => word.word && word.end >= word.start).sort((a, b) => a.start - b.start) : [],
          activeWordColor: typeof layer.activeWordColor === "string" ? layer.activeWordColor : "#111827",
          activeWordBackground: typeof layer.activeWordBackground === "string" ? layer.activeWordBackground : "#facc15",
          keyframes: Array.isArray(layer.keyframes) ? layer.keyframes.map((frame) => ({
            time: Number(frame.time) || 0,
            x: Number(frame.x) || 0,
            y: Number(frame.y) || 0,
            width: Number(frame.width) || 10,
            opacity: Number.isFinite(Number(frame.opacity)) ? Number(frame.opacity) : 1,
            scale: Number.isFinite(Number(frame.scale)) ? Number(frame.scale) : 1,
            rotation: Number.isFinite(Number(frame.rotation)) ? Number(frame.rotation) : 0,
          })).sort((a, b) => a.time - b.time) : [],
        })) : [];
        const restoredSfx: SfxCue[] = Array.isArray(context.sfx) ? context.sfx.map((raw: Partial<SfxCue>) => ({
          id: String(raw.id || uid("sfx-restored")), assetId: String(raw.assetId || ""), name: String(raw.name || "SFX"), url: String(raw.url || ""),
          start: clamp(Number(raw.start) || 0, 0, Math.max(0, projectDurationFor(nextClips))), duration: clamp(Number(raw.duration) || 1, 0.12, Math.max(0.12, projectDurationFor(nextClips))),
          trimIn: Math.max(0, Number(raw.trimIn) || 0), volume: clamp(Number(raw.volume) || 0.55, 0, 1.2), category: String(raw.category || "other"),
        })).filter((cue: SfxCue) => cue.assetId && cue.url) : [];
        resetEditorHistory(nextClips, nextLayers, restoredSfx);
        setActiveClipId(nextClips[0]?.id ?? "");
        setSelectedClipId(nextClips[0]?.id ?? "");
        setTimelineTime(0);

        const audio = context.audio ?? {};
        if (["none", "brand", "library", "upload", "ai"].includes(audio.mode)) setMusicMode(audio.mode);
        if (audio.assetId) setMusicAssetId(audio.assetId);
        if (Number.isFinite(Number(audio.volume))) setMusicVolume(Number(audio.volume));
        if (Number.isFinite(Number(audio.originalVolume))) setOriginalVolume(Number(audio.originalVolume));
        if (Number.isFinite(Number(audio.start))) setMusicStart(Number(audio.start));
        if (Number.isFinite(Number(audio.end))) setMusicEnd(Number(audio.end));
        const savedDucking = audio.ducking && typeof audio.ducking === "object" ? audio.ducking : null;
        if (savedDucking) {
          if (typeof savedDucking.enabled === "boolean") setDuckingEnabled(savedDucking.enabled);
          if (Number.isFinite(Number(savedDucking.reduction))) setDuckingReduction(clamp(Number(savedDucking.reduction), 0, 90));
          if (Number.isFinite(Number(savedDucking.thresholdPct))) setDuckingThresholdPct(clamp(Number(savedDucking.thresholdPct), 1, 30));
          if (Number.isFinite(Number(savedDucking.attackMs))) setDuckingAttackMs(clamp(Number(savedDucking.attackMs), 20, 600));
          if (Number.isFinite(Number(savedDucking.releaseMs))) setDuckingReleaseMs(clamp(Number(savedDucking.releaseMs), 80, 1800));
        }
        if (Number.isFinite(Number(audio.fadeIn))) setMusicFadeIn(clamp(Number(audio.fadeIn), 0, 5));
        if (Number.isFinite(Number(audio.fadeOut))) setMusicFadeOut(clamp(Number(audio.fadeOut), 0, 8));
        if (typeof audio.smartLoop === "boolean") setSmartMusicLoop(audio.smartLoop);
        if (Array.isArray(audio.volumePoints)) setMusicVolumePoints(audio.volumePoints.map((point: Partial<MusicVolumePoint>) => ({ id: String(point.id || uid("music-volume")), time: Math.max(0, Number(point.time) || 0), value: clamp(Number(point.value) || 0, 0, 1) })).sort((a: MusicVolumePoint, b: MusicVolumePoint) => a.time - b.time));
        if (Number.isFinite(Number(audio.loudnessTarget))) setLoudnessTarget(clamp(Number(audio.loudnessTarget), -24, -8));
        const savedBeatSync = audio.beatSync && typeof audio.beatSync === "object" ? audio.beatSync : null;
        if (savedBeatSync && Number.isFinite(Number(savedBeatSync.bpm)) && Number(savedBeatSync.bpm) > 0 && audio.assetId) {
          setBeatAnalysis({
            trackKey: String(audio.assetId),
            bpm: Number(savedBeatSync.bpm),
            offset: Math.max(0, Number(savedBeatSync.offset) || 0),
            confidence: clamp(Number(savedBeatSync.confidence) || 0.35, 0, 1),
            source: savedBeatSync.source === "audio" ? "audio" : "metadata",
            waveform: Array.isArray(savedBeatSync.waveform) ? savedBeatSync.waveform.map((value: unknown) => clamp(Number(value) || 0, 0, 1)).slice(0, 160) : [],
            downbeatIndex: [0, 1, 2, 3].includes(Number(savedBeatSync.downbeatIndex)) ? Number(savedBeatSync.downbeatIndex) : 0,
          });
          if ([1, 2, 4].includes(Number(savedBeatSync.step))) setBeatStep(Number(savedBeatSync.step) as BeatStep);
          if (typeof savedBeatSync.showMarkers === "boolean") setShowBeatMarkers(savedBeatSync.showMarkers);
          if (["light", "balanced", "aggressive"].includes(String(savedBeatSync.strength))) setBeatSyncStrength(savedBeatSync.strength as BeatSyncStrength);
          if (Array.isArray(savedBeatSync.manualMarkers)) setManualBeatMarkers(savedBeatSync.manualMarkers.map((time: unknown) => Math.max(0, Number(time) || 0)).slice(0, 80).sort((a: number, b: number) => a - b));
          if (typeof savedBeatSync.syncVisualAccents === "boolean") setSyncVisualAccents(savedBeatSync.syncVisualAccents);
        }
      } catch (error) {
        toast({ title: "Não foi possível abrir o projeto", description: error instanceof Error ? error.message : "Projeto inválido", variant: "destructive" });
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, resetEditorHistory, tenantId, toast]);

  const uploadAsset = useCallback(async (file: File, type: "video" | "image" | "audio", role: "source" | "reference" | "music"): Promise<MediaAsset | null> => {
    if (!tenantId) return null;
    try {
      const id = await ensureProject();
      const request = await fetch(`/api/tenants/${tenantId}/media/assets/request-upload`, {
        method: "POST",
        headers: tokenHeaders(true),
        body: JSON.stringify({ projectId: id, name: file.name, contentType: file.type || "application/octet-stream", type, size: file.size }),
      });
      const prepared = await request.json();
      if (!request.ok) throw new Error(prepared.error ?? "Falha ao preparar upload");
      const uploadResponse = await fetch(prepared.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("Falha ao enviar arquivo para a Central de Mídias");
      const register = await fetch(`/api/tenants/${tenantId}/media/assets`, {
        method: "POST",
        headers: tokenHeaders(true),
        body: JSON.stringify({
          projectId: id,
          type,
          role,
          source: "upload",
          storageUrl: prepared.objectPath,
          originalFilename: file.name,
          mimeType: file.type,
          fileSize: file.size,
          metadata: type === "audio"
            ? {
                audioKind: "music",
                rights: {
                  status: "pending",
                  origin: "unknown",
                  commercialUse: false,
                  paidAds: false,
                  territories: ["*"],
                  expiresAt: null,
                  attributionRequired: false,
                  attributionText: null,
                  licenseReference: null,
                  evidenceAssetId: null,
                },
              }
            : {},
        }),
      });
      const registered = await register.json();
      if (!register.ok) throw new Error(registered.error ?? "Falha ao registrar mídia");
      await loadAssets();
      if (type === "audio") await loadMusic();
      return registered.asset ?? null;
    } catch (error) {
      toast({ title: "Mídia usada no editor, mas não foi salva na biblioteca", description: error instanceof Error ? error.message : "Falha no upload", variant: "destructive" });
      return null;
    }
  }, [ensureProject, loadAssets, loadMusic, tenantId, toast]);

  const appendClip = useCallback(async ({ name, url, assetId, localFile, sourceDuration }: {
    name: string;
    url: string;
    assetId?: string;
    localFile?: File;
    sourceDuration?: number;
  }) => {
    const duration = sourceDuration && sourceDuration > 0 ? sourceDuration : await probeVideo(url);
    const clip: VideoClip = {
      id: uid("clip"),
      name,
      url,
      assetId,
      localFile,
      sourceDuration: duration,
      trimIn: 0,
      trimOut: duration,
      transitionOut: "cut",
      transitionDuration: 0.45,
      motion: "none",
    };
    commitEditor([...clipsRef.current, clip], layersRef.current);
    setActiveClipId((current) => current || clip.id);
    selectClip(clip.id);
    setMusicEnd((current) => current <= 0 || current === 30 || current < projectDurationFor([...clipsRef.current, clip]) ? projectDurationFor([...clipsRef.current, clip]) : current);
    return clip;
  }, [commitEditor, selectClip]);

  const addUploadedClip = useCallback(async (file: File) => {
    handoff.clearSource();
    const localUrl = URL.createObjectURL(file);
    try {
      const duration = await probeVideo(localUrl);
      const clip = await appendClip({ name: file.name, url: localUrl, localFile: file, sourceDuration: duration });
      setProjectTitle((title) => title === "Novo projeto de vídeo" ? file.name.replace(/\.[^.]+$/, "") : title);
      const stored = await uploadAsset(file, "video", clipsRef.current.length <= 1 ? "source" : "reference");
      if (stored?.id) {
        const next = clipsRef.current.map((item) => item.id === clip.id ? { ...item, assetId: stored.id, url: assetUrl(stored) || item.url, localFile: undefined } : item);
        commitEditor(next, layersRef.current);
      }
      setResultUrl("");
      setJobStatus("idle");
    } catch (error) {
      URL.revokeObjectURL(localUrl);
      toast({ title: "Vídeo inválido", description: error instanceof Error ? error.message : "Não foi possível adicionar o clipe", variant: "destructive" });
    }
  }, [appendClip, commitEditor, handoff, toast, uploadAsset]);

  const addLibraryClip = useCallback(async (asset: MediaAsset) => {
    handoff.clearSource();
    const url = assetUrl(asset);
    if (!url) return;
    try {
      await appendClip({ name: assetName(asset), url, assetId: asset.id });
      setResultUrl("");
      setJobStatus("idle");
      toast({ title: "Clipe adicionado", description: `${assetName(asset)} entrou no final da sequência.` });
    } catch (error) {
      toast({ title: "Não foi possível adicionar o clipe", description: error instanceof Error ? error.message : "Vídeo inválido", variant: "destructive" });
    }
  }, [appendClip, handoff, toast]);

  useEffect(() => {
    if (!handoff.sourceMediaAssetId || !handoffPreview || handoffAddedRef.current === handoff.sourceMediaAssetId) return;
    handoffAddedRef.current = handoff.sourceMediaAssetId;
    void (async () => {
      try {
        await appendClip({
          name: handoffFile?.name ?? "Vídeo da Biblioteca",
          url: handoffPreview,
          assetId: handoff.sourceMediaAssetId,
          localFile: handoffFile ?? undefined,
        });
        handoff.clearSource();
      } catch (error) {
        toast({ title: "Não foi possível abrir o vídeo da Biblioteca", description: error instanceof Error ? error.message : "Falha ao carregar", variant: "destructive" });
      }
    })();
  }, [appendClip, handoff, handoffFile, handoffPreview, toast]);

  const addTextLayer = (kind: "title" | "subtitle" | "cta" = "title") => {
    const defaults = kind === "title"
      ? { text: "Seu título aqui", fontSize: 54, y: 12 }
      : kind === "subtitle"
        ? { text: "Adicione uma mensagem de apoio", fontSize: 34, y: 70 }
        : { text: "Fale com nossa equipe", fontSize: 38, y: 82 };
    const total = Math.max(0.1, projectDurationFor(clipsRef.current));
    const layer: EditorLayer = {
      id: uid("text"),
      type: "text",
      name: kind === "cta" ? "CTA" : kind === "subtitle" ? "Subtítulo" : "Título",
      text: defaults.text,
      start: 0,
      end: Math.min(total, kind === "cta" ? total : 5),
      x: 8,
      y: defaults.y,
      width: 84,
      fontSize: defaults.fontSize,
      color: "#ffffff",
      background: "#000000",
      opacity: 1,
      scale: 1,
      rotation: 0,
      easing: "ease-in-out",
      textAlign: "center",
      enterAnimation: kind === "cta" ? "pop" : kind === "title" ? "slide-up" : "fade",
      exitAnimation: "fade",
      animationDuration: 0.35,
    };
    commitEditor(clipsRef.current, [...layersRef.current, layer]);
    selectLayer(layer.id);
  };

  const addStickerLayer = (sticker: { label: string; glyph: string }) => {
    const total = Math.max(0.1, projectDurationFor(clipsRef.current));
    const at = clamp(timelineTime, 0, Math.max(0, total - 0.1));
    const layer: EditorLayer = {
      id: uid("sticker"),
      type: "text",
      name: `Sticker · ${sticker.label}`,
      text: sticker.glyph,
      start: at,
      end: Math.min(total, at + 3),
      x: 70,
      y: 12,
      width: 18,
      fontSize: 72,
      color: "#ffffff",
      background: "transparent",
      opacity: 1,
      scale: 1,
      rotation: 0,
      easing: "ease-out",
      textAlign: "center",
      enterAnimation: "pop",
      exitAnimation: "fade",
      animationDuration: 0.2,
      contentKind: "sticker",
    };
    commitEditor(clipsRef.current, [...layersRef.current, layer]);
    selectLayer(layer.id);
  };

  const addCaptionLayer = (template = CAPTION_TEMPLATES[0]) => {
    if (!template) return;
    const total = Math.max(0.1, projectDurationFor(clipsRef.current));
    const at = clamp(timelineTime, 0, Math.max(0, total - 0.1));
    const layer: EditorLayer = {
      id: uid("caption"),
      type: "text",
      name: `Legenda · ${template.name}`,
      text: template.text,
      start: at,
      end: Math.min(total, at + 3),
      x: 7,
      y: template.y,
      width: 86,
      fontSize: template.fontSize,
      color: template.color,
      background: template.background,
      opacity: 1,
      scale: 1,
      rotation: 0,
      easing: "ease-out",
      textAlign: template.textAlign,
      enterAnimation: template.enterAnimation,
      exitAnimation: "fade",
      animationDuration: 0.28,
      contentKind: "caption",
      captionStyle: template.name === "Destaque" ? "highlight" : template.name === "Minimal" ? "minimal" : "impact",
      captionMotion: template.name === "Destaque" ? "word-bounce" : template.name === "Minimal" ? "none" : "word-pop",
      activeWordColor: "#111827",
      activeWordBackground: "#facc15",
    };
    commitEditor(clipsRef.current, [...layersRef.current, layer]);
    selectLayer(layer.id);
  };

  const addCardLayer = (template = CARD_TEMPLATES[0]) => {
    if (!template) return;
    const total = Math.max(0.1, projectDurationFor(clipsRef.current));
    const at = clamp(timelineTime, 0, Math.max(0, total - 0.1));
    const layer: EditorLayer = {
      id: uid("card"), type: "card", name: `Card · ${template.name}`, text: template.text,
      start: at, end: Math.min(total, at + 4), x: 8, y: 62, width: 84, fontSize: 36,
      color: template.color, background: template.background, opacity: 0.94, scale: 1, rotation: 0, easing: "ease-in-out", textAlign: "left", enterAnimation: "slide-up", exitAnimation: "fade", animationDuration: 0.35,
    };
    commitEditor(clipsRef.current, [...layersRef.current, layer]);
    selectLayer(layer.id);
  };

  const addImageFile = async (file: File) => {
    const total = Math.max(0.1, projectDurationFor(clipsRef.current));
    const layer: EditorLayer = {
      id: uid("image"), type: "image", name: file.name, text: "", start: timelineTime, end: Math.min(total, timelineTime + 6),
      x: 60, y: 8, width: 32, fontSize: 32, color: "#ffffff", background: "#000000", opacity: 1, scale: 1, rotation: 0, easing: "ease-in-out", textAlign: "left", enterAnimation: "fade", exitAnimation: "fade", animationDuration: 0.35,
      url: URL.createObjectURL(file), localFile: file,
    };
    commitEditor(clipsRef.current, [...layersRef.current, layer]);
    selectLayer(layer.id);
    const stored = await uploadAsset(file, "image", "reference");
    if (stored?.id) {
      const next = layersRef.current.map((item) => item.id === layer.id ? { ...item, assetId: stored.id, url: assetUrl(stored) || item.url, localFile: undefined } : item);
      commitEditor(clipsRef.current, next);
    }
  };

  const addLibraryImage = (asset: MediaAsset) => {
    const total = Math.max(0.1, projectDurationFor(clipsRef.current));
    const layer: EditorLayer = {
      id: uid("image"), type: "image", name: assetName(asset), text: "", start: timelineTime, end: Math.min(total, timelineTime + 6),
      x: 60, y: 8, width: 32, fontSize: 32, color: "#ffffff", background: "#000000", opacity: 1, scale: 1, rotation: 0, easing: "ease-in-out", textAlign: "left", enterAnimation: "fade", exitAnimation: "fade", animationDuration: 0.35,
      url: assetUrl(asset), assetId: asset.id,
    };
    commitEditor(clipsRef.current, [...layersRef.current, layer]);
    selectLayer(layer.id);
  };

  const updateLayer = (patch: Partial<EditorLayer>) => {
    if (!selectedLayerId) return;
    commitEditor(clipsRef.current, layersRef.current.map((layer) => layer.id === selectedLayerId ? { ...layer, ...patch } : layer));
  };

  const updateSelectedLayerText = (text: string) => {
    if (!selectedLayer) return;
    updateLayer({
      text,
      captionWords: selectedLayer.contentKind === "caption" && selectedLayer.captionWords?.length
        ? retimeCaptionWords(text, selectedLayer.start, selectedLayer.end, selectedLayer.captionWords)
        : selectedLayer.captionWords,
    });
  };

  const updateCaptionWordTiming = useCallback((index: number, field: "start" | "end", value: number) => {
    const layer = layersRef.current.find((item) => item.id === selectedLayerId);
    if (!layer || layer.contentKind !== "caption" || !layer.captionWords?.length) return;
    const words = layer.captionWords.map((word) => ({ ...word }));
    const word = words[index];
    if (!word) return;
    const previous = words[index - 1];
    const next = words[index + 1];
    if (field === "start") {
      const min = previous ? previous.end + 0.01 : 0;
      word.start = clamp(value, min, word.end - 0.01);
    } else {
      const max = next ? next.start - 0.01 : Math.max(word.start + 0.01, projectDurationFor(clipsRef.current));
      word.end = clamp(value, word.start + 0.01, max);
    }
    const nextLayer = {
      ...layer,
      captionWords: words,
      text: words.map((item) => item.word).join(" "),
      start: words[0]?.start ?? layer.start,
      end: words[words.length - 1]?.end ?? layer.end,
    };
    commitEditor(clipsRef.current, layersRef.current.map((item) => item.id === layer.id ? nextLayer : item));
  }, [commitEditor, selectedLayerId]);

  const splitSelectedCaptionAtPlayhead = useCallback(() => {
    const layer = layersRef.current.find((item) => item.id === selectedLayerId);
    if (!layer || layer.contentKind !== "caption") return;
    const words = (layer.captionWords?.length ? layer.captionWords.map((word) => ({ ...word })) : retimeCaptionWords(layer.text, layer.start, layer.end))
      .sort((a, b) => a.start - b.start);
    if (words.length < 2 || timelineTime <= layer.start + 0.01 || timelineTime >= layer.end - 0.01) {
      toast({ title: "Posicione o cursor dentro da legenda", description: "O cursor precisa ficar entre o começo e o fim da frase." });
      return;
    }
    let splitIndex = words.findIndex((word) => timelineTime < (word.start + word.end) / 2);
    if (splitIndex <= 0) splitIndex = words.findIndex((word) => word.start >= timelineTime);
    if (splitIndex <= 0 || splitIndex >= words.length) {
      toast({ title: "Não há duas partes válidas", description: "Mova o cursor para outra palavra e tente novamente." });
      return;
    }
    const leftWords = words.slice(0, splitIndex);
    const rightWords = words.slice(splitIndex);
    const left: EditorLayer = {
      ...layer,
      text: leftWords.map((word) => word.word).join(" "),
      start: leftWords[0]!.start,
      end: leftWords[leftWords.length - 1]!.end,
      captionWords: leftWords,
      name: layer.name.replace(/ · parte \d+$/, "") + " · parte 1",
    };
    const right: EditorLayer = {
      ...layer,
      id: uid("caption-split"),
      text: rightWords.map((word) => word.word).join(" "),
      start: rightWords[0]!.start,
      end: rightWords[rightWords.length - 1]!.end,
      captionWords: rightWords,
      name: layer.name.replace(/ · parte \d+$/, "") + " · parte 2",
    };
    const nextLayers = layersRef.current.flatMap((item) => item.id === layer.id ? [left, right] : [item]);
    commitEditor(clipsRef.current, nextLayers);
    selectLayer(right.id);
    setTimelineTime(right.start);
    toast({ title: "Legenda dividida", description: "As duas frases continuam com os tempos de palavra preservados." });
  }, [commitEditor, selectLayer, selectedLayerId, timelineTime, toast]);

  const joinSelectedCaptionWithNext = useCallback(() => {
    const layer = layersRef.current.find((item) => item.id === selectedLayerId);
    if (!layer || layer.contentKind !== "caption") return;
    const nextCaption = layersRef.current
      .filter((item) => item.contentKind === "caption" && item.id !== layer.id && item.start >= layer.start)
      .sort((a, b) => a.start - b.start)[0];
    if (!nextCaption) {
      toast({ title: "Não há próxima legenda", description: "Selecione outra frase ou mantenha este bloco separado." });
      return;
    }
    const leftWords = layer.captionWords?.length ? layer.captionWords.map((word) => ({ ...word })) : retimeCaptionWords(layer.text, layer.start, layer.end);
    const rightWords = nextCaption.captionWords?.length ? nextCaption.captionWords.map((word) => ({ ...word })) : retimeCaptionWords(nextCaption.text, nextCaption.start, nextCaption.end);
    const words = [...leftWords, ...rightWords].sort((a, b) => a.start - b.start);
    const merged: EditorLayer = {
      ...layer,
      name: "Legenda combinada",
      start: Math.min(layer.start, nextCaption.start),
      end: Math.max(layer.end, nextCaption.end),
      text: words.map((word) => word.word).join(" "),
      captionWords: words,
    };
    const nextLayers = layersRef.current
      .filter((item) => item.id !== nextCaption.id)
      .map((item) => item.id === layer.id ? merged : item);
    commitEditor(clipsRef.current, nextLayers);
    selectLayer(layer.id);
    setTimelineTime(merged.start);
    toast({ title: "Legendas unidas", description: "O bloco combinado preserva os tempos individuais de cada palavra." });
  }, [commitEditor, selectLayer, selectedLayerId, toast]);

  const updateClip = (patch: Partial<VideoClip>) => {
    if (!selectedClipId) return;
    const next = clipsRef.current.map((clip) => clip.id === selectedClipId ? { ...clip, ...patch } : clip);
    commitEditor(next, layersRef.current);
  };

  const addLayerKeyframe = useCallback(() => {
    const layer = layersRef.current.find((item) => item.id === selectedLayerId);
    if (!layer) return;
    const time = clamp(timelineTime, layer.start, layer.end);
    const frame: LayerKeyframe = { time, x: layer.x, y: layer.y, width: layer.width, opacity: layer.opacity, scale: layer.scale ?? 1, rotation: layer.rotation ?? 0 };
    const frames = [...(layer.keyframes ?? [])].filter((item) => Math.abs(item.time - time) > 0.05);
    frames.push(frame);
    frames.sort((a, b) => a.time - b.time);
    const nextLayers = layersRef.current.map((item) => item.id === layer.id ? { ...item, keyframes: frames } : item);
    commitEditor(clipsRef.current, nextLayers);
    toast({ title: "Keyframe adicionado", description: `Posição e aparência registradas em ${timeLabel(time)}.` });
  }, [commitEditor, selectedLayerId, timelineTime, toast]);

  const removeLayerKeyframe = useCallback((time: number) => {
    if (!selectedLayerId) return;
    const nextLayers = layersRef.current.map((item) => item.id === selectedLayerId ? { ...item, keyframes: (item.keyframes ?? []).filter((frame) => Math.abs(frame.time - time) > 0.01) } : item);
    commitEditor(clipsRef.current, nextLayers);
  }, [commitEditor, selectedLayerId]);

  const splitAtPlayhead = useCallback(() => {
    const located = locateClip(timelineTime, clipsRef.current);
    if (!located) return;
    const cut = located.clip.trimIn + (timelineTime - located.start);
    if (cut - located.clip.trimIn <= 0.1 || located.clip.trimOut - cut <= 0.1) return;
    const left: VideoClip = { ...located.clip, id: uid("clip"), name: `${located.clip.name} · 1`, trimOut: cut };
    const right: VideoClip = { ...located.clip, id: uid("clip"), name: `${located.clip.name} · 2`, trimIn: cut };
    const next = [...clipsRef.current];
    next.splice(located.index, 1, left, right);
    commitEditor(next, layersRef.current);
    selectClip(right.id);
    setActiveClipId(right.id);
    desiredPreviewSourceTimeRef.current = right.trimIn;
  }, [commitEditor, selectClip, timelineTime]);

  const startStageGesture = (event: ReactPointerEvent<HTMLElement>, layer: EditorLayer, mode: StageGestureMode) => {
    event.preventDefault();
    event.stopPropagation();
    const stage = previewStageRef.current;
    if (!stage) return;
    selectLayer(layer.id);
    const rect = stage.getBoundingClientRect();
    const before = cloneSnapshot({ clips: clipsRef.current, layers: layersRef.current });
    const startX = event.clientX;
    const startY = event.clientY;
    const original = { ...layer };
    const handleMove = (pointerEvent: PointerEvent) => {
      const dx = (pointerEvent.clientX - startX) / Math.max(1, rect.width) * 100;
      const dy = (pointerEvent.clientY - startY) / Math.max(1, rect.height) * 100;
      const nextLayers = layersRef.current.map((item) => {
        if (item.id !== layer.id) return item;
        if (mode === "resize") return { ...item, width: clamp(original.width + dx, 10, Math.max(10, 100 - original.x)) };
        return { ...item, x: clamp(original.x + dx, 0, Math.max(0, 100 - original.width)), y: clamp(original.y + dy, 0, 95) };
      });
      layersRef.current = nextLayers;
      setLayers(nextLayers);
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      const after = { clips: clipsRef.current, layers: layersRef.current };
      if (JSON.stringify(before.layers) !== JSON.stringify(after.layers)) recordHistory(after);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const startLayerTimelineGesture = (event: ReactPointerEvent<HTMLElement>, layer: EditorLayer, mode: LayerGestureMode) => {
    event.preventDefault();
    event.stopPropagation();
    selectLayer(layer.id);
    const track = mode === "move" ? event.currentTarget.parentElement : event.currentTarget.parentElement?.parentElement;
    if (!(track instanceof HTMLElement)) return;
    const rect = track.getBoundingClientRect();
    const total = Math.max(0.1, projectDurationFor(clipsRef.current));
    const before = cloneSnapshot({ clips: clipsRef.current, layers: layersRef.current });
    const startX = event.clientX;
    const original = { ...layer };
    const originalDuration = Math.max(0.1, original.end - original.start);
    const handleMove = (pointerEvent: PointerEvent) => {
      const delta = (pointerEvent.clientX - startX) / Math.max(1, rect.width) * total;
      const nextLayers = layersRef.current.map((item) => {
        if (item.id !== layer.id) return item;
        if (mode === "trim-start") return { ...item, start: clamp(original.start + delta, 0, original.end - 0.1) };
        if (mode === "trim-end") return { ...item, end: clamp(original.end + delta, original.start + 0.1, total) };
        const start = clamp(original.start + delta, 0, Math.max(0, total - originalDuration));
        const shift = start - original.start;
        return {
          ...item,
          start,
          end: start + originalDuration,
          captionWords: item.captionWords?.map((word) => ({ ...word, start: word.start + shift, end: word.end + shift })),
        };
      });
      layersRef.current = nextLayers;
      setLayers(nextLayers);
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (JSON.stringify(before.layers) !== JSON.stringify(layersRef.current)) recordHistory({ clips: clipsRef.current, layers: layersRef.current });
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const startClipTrimGesture = (event: ReactPointerEvent<HTMLElement>, clip: VideoClip, mode: ClipGestureMode) => {
    event.preventDefault();
    event.stopPropagation();
    selectClip(clip.id);
    const track = event.currentTarget.parentElement?.parentElement;
    if (!(track instanceof HTMLElement)) return;
    const rect = track.getBoundingClientRect();
    const before = cloneSnapshot({ clips: clipsRef.current, layers: layersRef.current });
    const initialTotal = Math.max(0.1, projectDurationFor(clipsRef.current));
    const startX = event.clientX;
    const original = { ...clip };
    const handleMove = (pointerEvent: PointerEvent) => {
      const delta = (pointerEvent.clientX - startX) / Math.max(1, rect.width) * initialTotal;
      const nextClips = clipsRef.current.map((item) => {
        if (item.id !== clip.id) return item;
        if (mode === "trim-in") return { ...item, trimIn: clamp(original.trimIn + delta, 0, original.trimOut - 0.1) };
        return { ...item, trimOut: clamp(original.trimOut + delta, original.trimIn + 0.1, original.sourceDuration) };
      });
      clipsRef.current = nextClips;
      setClips(nextClips);
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      if (JSON.stringify(before.clips) !== JSON.stringify(clipsRef.current)) recordHistory({ clips: clipsRef.current, layers: layersRef.current });
      setTimelineTime((time) => clamp(time, 0, Math.max(0, projectDurationFor(clipsRef.current))));
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  const selectChannel = (id: string) => {
    const preset = CHANNELS.find((item) => item.id === id);
    if (!preset) return;
    setChannel(id);
    setRatio(preset.ratio);
  };

  const seekTimeline = useCallback((seconds: number, resume = false) => {
    const currentClips = clipsRef.current;
    const total = projectDurationFor(currentClips);
    if (!currentClips.length || total <= 0) return;
    const time = clamp(seconds, 0, Math.max(0, total - 0.001));
    const located = locateClip(time, currentClips);
    if (!located) return;
    setTimelineTime(time);
    desiredPreviewSourceTimeRef.current = located.sourceTime;
    const video = previewRef.current;
    const shouldResume = resume || Boolean(video && !video.paused);
    if (activeClipId !== located.clip.id) {
      resumeAfterClipChangeRef.current = shouldResume;
      setActiveClipId(located.clip.id);
      return;
    }
    if (video) {
      video.currentTime = located.sourceTime;
      if (shouldResume) void video.play();
    }
  }, [activeClipId]);

  const advancePreview = useCallback((fromIndex: number) => {
    const next = clipsRef.current[fromIndex + 1];
    if (!next) {
      previewRef.current?.pause();
      setPlaying(false);
      seekTimeline(0, false);
      return;
    }
    const start = clipStartAt(fromIndex + 1, clipsRef.current);
    setTimelineTime(start);
    desiredPreviewSourceTimeRef.current = next.trimIn;
    resumeAfterClipChangeRef.current = true;
    setActiveClipId(next.id);
  }, [seekTimeline]);

  const onPreviewLoadedMetadata = () => {
    const video = previewRef.current;
    const clip = clipsRef.current.find((item) => item.id === activeClipId);
    if (!video || !clip) return;
    const duration = Number.isFinite(video.duration) ? video.duration : clip.sourceDuration;
    if (duration > 0 && (Math.abs(duration - clip.sourceDuration) > 0.05 || clip.trimOut > duration)) {
      const next = clipsRef.current.map((item) => item.id === clip.id ? {
        ...item,
        sourceDuration: duration,
        trimOut: clamp(item.trimOut || duration, item.trimIn + 0.1, duration),
      } : item);
      clipsRef.current = next;
      setClips(next);
    }
    const sourceTime = desiredPreviewSourceTimeRef.current ?? clip.trimIn;
    desiredPreviewSourceTimeRef.current = null;
    video.currentTime = clamp(sourceTime, clip.trimIn, Math.max(clip.trimIn, clip.trimOut - 0.001));
    if (resumeAfterClipChangeRef.current) {
      resumeAfterClipChangeRef.current = false;
      void video.play();
    }
  };

  const onPreviewTimeUpdate = () => {
    const video = previewRef.current;
    const currentClips = clipsRef.current;
    const index = currentClips.findIndex((clip) => clip.id === activeClipId);
    const clip = currentClips[index];
    if (!video || !clip || index < 0) return;
    const start = clipStartAt(index, currentClips);
    const local = clamp(video.currentTime - clip.trimIn, 0, clipDuration(clip));
    setTimelineTime(start + local);
    const outgoingOverlap = transitionOverlapAfter(index, currentClips);
    if (!video.paused && outgoingOverlap > 0 && video.currentTime >= clip.trimOut - outgoingOverlap - 0.025) {
      const next = currentClips[index + 1];
      if (next) {
        const crossfadeStart = clipStartAt(index + 1, currentClips);
        setTimelineTime(crossfadeStart);
        desiredPreviewSourceTimeRef.current = next.trimIn;
        resumeAfterClipChangeRef.current = true;
        setActiveClipId(next.id);
        return;
      }
    }
    if (!video.paused && video.currentTime >= clip.trimOut - 0.025) advancePreview(index);
  };

  useEffect(() => {
    const overlapVideo = previewOverlapRef.current;
    if (!overlapVideo) return;
    const crossfade = crossfadeWindowAt(timelineTime, clips);
    if (!crossfade) {
      overlapVideo.pause();
      return;
    }
    const expectedTime = clamp(crossfade.previousSourceTime, crossfade.previous.trimIn, crossfade.previous.trimOut - 0.001);
    if (Math.abs(overlapVideo.currentTime - expectedTime) > 0.12) overlapVideo.currentTime = expectedTime;
    if (playing) void overlapVideo.play().catch(() => undefined);
    else overlapVideo.pause();
  }, [clips, playing, timelineTime]);

  const togglePlayback = () => {
    const video = previewRef.current;
    if (!video || !clipsRef.current.length) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    const total = projectDurationFor(clipsRef.current);
    if (timelineTime >= total - 0.02) {
      seekTimeline(0, true);
      return;
    }
    seekTimeline(timelineTime, true);
  };

  const pollJob = async (jobId: string): Promise<string> => {
    setJobStatus("processing");
    setJobMessage("Convertendo para MP4 e registrando na Biblioteca Audiovisual…");
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 4000));
      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/job/${jobId}`, { headers: tokenHeaders() });
      const data = await response.json();
      if (data.status === "done") return String(data.videoUrl ?? "");
      if (data.status === "error") throw new Error(data.error ?? "Erro no processamento do vídeo");
    }
    throw new Error("O processamento excedeu o tempo esperado.");
  };

  const pollTranscriptJob = async (jobId: string): Promise<TranscriptPayload> => {
    setJobStatus("processing");
    setJobMessage("Transcrevendo fala e sincronizando cada palavra…");
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/job/${jobId}`, { headers: tokenHeaders() });
      const data = await response.json();
      if (data.status === "done" && data.transcript) return data.transcript as TranscriptPayload;
      if (data.status === "error") throw new Error(data.error ?? "Erro na transcrição do vídeo");
    }
    throw new Error("A transcrição excedeu o tempo esperado.");
  };

  const finalizeWebm = async (blob: Blob): Promise<string> => {
    const form = new FormData();
    form.append("video", new File([blob], `${projectTitle || "vendorai-video"}.webm`, { type: blob.type || "video/webm" }));
    form.append("removeSilence", "false");
    form.append("normalize", String(normalizeAudio));
    form.append("loudnessTarget", String(loudnessTarget));
    form.append("speed", speed);
    const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/edit`, {
      method: "POST",
      headers: tokenHeaders(),
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Não foi possível finalizar o vídeo");
    return await pollJob(String(data.jobId));
  };

  const renderTimeline = async () => {
    const renderClips = clipsRef.current.map((clip) => ({ ...clip }));
    if (!tenantId || !renderClips.length || jobStatus === "rendering" || jobStatus === "processing") return;
    setJobStatus("rendering");
    setJobMessage("Preparando sequência de clipes…");
    setResultUrl("");
    logEditorEvent("render_started", { clips: renderClips.length, sfx: sfxCuesRef.current.length, ratio, quality });
    try {
      await saveProject(true);
      const totalDuration = projectDurationFor(renderClips);
      const { width, height } = outputDimensions(ratio, quality);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Seu navegador não liberou o motor gráfico do editor.");

      const renderVideo = document.createElement("video");
      const renderOverlapVideo = document.createElement("video");
      for (const videoElement of [renderVideo, renderOverlapVideo]) {
        videoElement.preload = "auto";
        videoElement.crossOrigin = "anonymous";
        videoElement.playsInline = true;
      }
      const renderLayers = layersRef.current.map((layer) => ({ ...layer }));
      const renderSfxCues = sfxCuesRef.current.map((cue) => ({ ...cue })).filter((cue) => cue.start < totalDuration && cue.duration > 0);
      const imageEntries = await Promise.all(
        renderLayers.filter((layer) => layer.type === "image" && layer.url).map(async (layer) => [layer.id, await loadImage(layer.url!)] as const),
      );
      const imageMap = new Map(imageEntries);
      const canvasStream = canvas.captureStream(30);
      const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const audioContext = AudioContextCtor ? new AudioContextCtor() : null;
      let destination: MediaStreamAudioDestinationNode | null = null;
      let musicSourceNode: AudioBufferSourceNode | null = null;
      let musicGainNode: GainNode | null = null;
      let originalGain: GainNode | null = null;
      let overlapGain: GainNode | null = null;
      let originalAnalyser: AnalyserNode | null = null;
      let analyserSamples: Float32Array<ArrayBuffer> | null = null;
      let duckingLevel = 0;
      const sfxRuntime: Array<{ source: AudioBufferSourceNode; gain: GainNode; cue: SfxCue; buffer: AudioBuffer }> = [];

      if (audioContext) {
        destination = audioContext.createMediaStreamDestination();
        const source = audioContext.createMediaElementSource(renderVideo);
        const overlapSource = audioContext.createMediaElementSource(renderOverlapVideo);
        originalGain = audioContext.createGain();
        overlapGain = audioContext.createGain();
        originalGain.gain.value = originalVolume;
        overlapGain.gain.value = 0;
        originalAnalyser = audioContext.createAnalyser();
        originalAnalyser.fftSize = 512;
        originalAnalyser.smoothingTimeConstant = 0.35;
        analyserSamples = new Float32Array(originalAnalyser.fftSize);
        source.connect(originalGain).connect(originalAnalyser);
        overlapSource.connect(overlapGain).connect(originalAnalyser);
        originalAnalyser.connect(destination);

        let musicBlob: Blob | null = null;
        if (musicMode === "upload" && musicFile) musicBlob = musicFile;
        const effectiveMusicAssetId = musicAssetId || (musicMode === "brand" ? brandDefaultTrackId : "");
        if (!musicBlob && effectiveMusicAssetId) {
          const track = musicTracks.find((item) => item.id === effectiveMusicAssetId);
          const url = track ? assetUrl(track) : "";
          if (url) {
            const response = await fetch(url, { headers: url.startsWith("/api/") ? tokenHeaders() : undefined });
            if (response.ok) musicBlob = await response.blob();
          }
        }
        if (musicBlob && musicMode !== "none" && musicEnd > musicStart) {
          const buffer = await audioContext.decodeAudioData(await musicBlob.arrayBuffer());
          musicSourceNode = audioContext.createBufferSource();
          musicSourceNode.buffer = buffer;
          musicSourceNode.loop = true;
          if (smartMusicLoop) {
            const loop = smartLoopBounds(buffer);
            musicSourceNode.loopStart = loop.start;
            musicSourceNode.loopEnd = loop.end;
          }
          musicGainNode = audioContext.createGain();
          musicGainNode.gain.value = 0;
          musicSourceNode.connect(musicGainNode).connect(destination);
        }
        for (const cue of renderSfxCues) {
          try {
            const response = await fetch(cue.url, { headers: cue.url.startsWith("/api/") ? tokenHeaders() : undefined });
            if (!response.ok) continue;
            const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
            const sourceNode = audioContext.createBufferSource();
            const gainNode = audioContext.createGain();
            sourceNode.buffer = buffer;
            gainNode.gain.value = clamp(cue.volume, 0, 1.2);
            sourceNode.connect(gainNode).connect(destination);
            sfxRuntime.push({ source: sourceNode, gain: gainNode, cue, buffer });
          } catch { /* efeito inválido é ignorado sem interromper o render */ }
        }
      }

      const outputStream = new MediaStream([...canvasStream.getVideoTracks(), ...(destination?.stream.getAudioTracks() ?? [])]);
      const preferredTypes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mimeType = preferredTypes.find((value) => MediaRecorder.isTypeSupported(value)) ?? "";
      const recorder = new MediaRecorder(outputStream, mimeType ? { mimeType, videoBitsPerSecond: quality === "1080p" ? 8_000_000 : 4_000_000 } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error("Falha durante a renderização local."));
      });

      const drawFrame = (globalTime: number, primaryIndex: number, secondaryIndex?: number) => {
        drawContainedVideo(ctx, renderVideo, width, height, clipVisualState(primaryIndex, globalTime, renderClips), true);
        if (secondaryIndex !== undefined) {
          drawContainedVideo(ctx, renderOverlapVideo, width, height, clipVisualState(secondaryIndex, globalTime, renderClips), false);
        }
        for (const layer of renderLayers) {
          if (!layerIsVisible(layer, globalTime)) continue;
          const resolvedLayer = resolveAnimatedLayerAtTime(layer, globalTime);
          ctx.save();
          ctx.globalAlpha = clamp(resolvedLayer.opacity, 0, 1);
          const x = width * resolvedLayer.x / 100;
          const y = height * resolvedLayer.y / 100;
          const maxWidth = width * resolvedLayer.width / 100;
          ctx.translate(x, y);
          ctx.rotate((resolvedLayer.rotation ?? 0) * Math.PI / 180);
          ctx.scale(resolvedLayer.scale ?? 1, resolvedLayer.scale ?? 1);
          if (layer.type === "image") {
            const image = imageMap.get(layer.id);
            if (image) {
              const drawWidth = Math.min(maxWidth, width - x);
              const drawHeight = drawWidth * image.naturalHeight / Math.max(1, image.naturalWidth);
              ctx.drawImage(image, 0, 0, drawWidth, Math.min(drawHeight, height - y));
            }
          } else {
            const scale = width / 720;
            const fontSize = Math.max(14, layer.fontSize * scale);
            ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
            ctx.textBaseline = "top";
            const padding = 16 * scale;
            if (layer.contentKind === "caption" && layer.captionWords?.length) {
              drawCaptionWordsOnCanvas(ctx, resolvedLayer, globalTime, maxWidth, fontSize, padding);
            } else {
              const lines = wrapText(ctx, layer.text, Math.max(40, maxWidth - padding * 2));
              const lineHeight = fontSize * 1.18;
              if (layer.type === "card") {
                ctx.fillStyle = layer.background;
                ctx.fillRect(0, 0, maxWidth, lines.length * lineHeight + padding * 2);
              } else if (layer.background !== "transparent" && layer.background !== "") {
                ctx.fillStyle = `${layer.background}cc`;
                const textWidth = Math.min(maxWidth, Math.max(...lines.map((line) => ctx.measureText(line).width), 0) + padding * 2);
                ctx.fillRect(0, 0, textWidth, lines.length * lineHeight + padding * 2);
              }
              ctx.fillStyle = layer.color;
              const align = resolvedLayer.textAlign ?? "left";
              ctx.textAlign = align;
              const textX = layer.type === "card"
                ? align === "center" ? maxWidth / 2 : align === "right" ? maxWidth - padding : padding
                : align === "center" ? maxWidth / 2 : align === "right" ? maxWidth : 0;
              lines.forEach((line, index) => ctx.fillText(line, textX, (layer.type === "card" ? padding : 0) + index * lineHeight, maxWidth - padding));
            }
          }
          ctx.restore();
        }
      };

      const updateAudioMix = (globalTime: number) => {
        if (!audioContext || !musicGainNode) return;
        if (duckingEnabled && originalAnalyser && analyserSamples) {
          originalAnalyser.getFloatTimeDomainData(analyserSamples);
          let sum = 0;
          for (const sample of analyserSamples) sum += sample * sample;
          const rms = Math.sqrt(sum / Math.max(1, analyserSamples.length));
          const target = rms >= duckingThresholdPct / 100 ? 1 : 0;
          const seconds = target > duckingLevel ? duckingAttackMs / 1000 : duckingReleaseMs / 1000;
          const alpha = 1 - Math.exp(-(1 / 30) / Math.max(0.01, seconds));
          duckingLevel += (target - duckingLevel) * alpha;
        } else {
          duckingLevel = 0;
        }
        const automated = volumeAtTime(musicVolumePoints, globalTime, musicVolume);
        const faded = fadeMultiplier(globalTime, musicStart, musicEnd, musicFadeIn, musicFadeOut);
        const duckMultiplier = 1 - (duckingReduction / 100) * duckingLevel;
        const targetGain = clamp(automated * faded * duckMultiplier, 0, 1.2);
        musicGainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.025);
      };

      const prepareRenderVideo = async (videoElement: HTMLVideoElement, clip: VideoClip, sourceTime: number) => {
        videoElement.pause();
        videoElement.src = clip.url;
        await new Promise<void>((resolve, reject) => {
          const handleLoaded = () => { cleanup(); resolve(); };
          const handleError = () => { cleanup(); reject(new Error(`Não foi possível abrir o clipe “${clip.name}”.`)); };
          const cleanup = () => {
            videoElement.removeEventListener("loadedmetadata", handleLoaded);
            videoElement.removeEventListener("error", handleError);
          };
          videoElement.addEventListener("loadedmetadata", handleLoaded);
          videoElement.addEventListener("error", handleError);
          videoElement.load();
        });
        videoElement.currentTime = clamp(sourceTime, clip.trimIn, Math.max(clip.trimIn, clip.trimOut - 0.001));
        await new Promise<void>((resolve) => {
          const handler = () => { videoElement.removeEventListener("seeked", handler); resolve(); };
          videoElement.addEventListener("seeked", handler);
          window.setTimeout(resolve, 350);
        });
      };

      if (audioContext) await audioContext.resume();
      recorder.start(1000);
      const audioNow = audioContext?.currentTime ?? 0;
      if (musicSourceNode) {
        const start = Math.min(totalDuration, Math.max(0, musicStart));
        const end = Math.min(totalDuration, Math.max(start + 0.1, musicEnd));
        musicSourceNode.start(audioNow + start);
        musicSourceNode.stop(audioNow + end);
      }
      for (const runtime of sfxRuntime) {
        const start = clamp(runtime.cue.start, 0, totalDuration);
        const offset = clamp(runtime.cue.trimIn, 0, Math.max(0, runtime.buffer.duration - 0.02));
        const duration = Math.min(runtime.cue.duration, runtime.buffer.duration - offset, totalDuration - start);
        if (duration > 0.02) runtime.source.start(audioNow + start, offset, duration);
      }

      for (let clipIndex = 0; clipIndex < renderClips.length; clipIndex += 1) {
        const clip = renderClips[clipIndex];
        if (!clip) continue;
        const incomingOverlap = clipIndex > 0 ? transitionOverlapAfter(clipIndex - 1, renderClips) : 0;
        const outgoingOverlap = transitionOverlapAfter(clipIndex, renderClips);
        const nextClip = renderClips[clipIndex + 1];
        const globalStart = clipStartAt(clipIndex, renderClips);
        const sourceStart = clip.trimIn + incomingOverlap;
        if (sourceStart >= clip.trimOut - 0.02) continue;

        setJobMessage(`Renderizando clipe ${clipIndex + 1} de ${renderClips.length}…`);
        await prepareRenderVideo(renderVideo, clip, sourceStart);
        if (outgoingOverlap > 0 && nextClip) await prepareRenderVideo(renderOverlapVideo, nextClip, nextClip.trimIn);

        const initialGlobalTime = globalStart + incomingOverlap;
        drawFrame(initialGlobalTime, clipIndex);
        if (originalGain) originalGain.gain.value = originalVolume;
        if (overlapGain) overlapGain.gain.value = 0;
        await renderVideo.play();

        await new Promise<void>((resolve) => {
          let overlapStarted = false;
          const crossfadeSourceStart = clip.trimOut - outgoingOverlap;
          const loop = () => {
            const local = clamp(renderVideo.currentTime - clip.trimIn, 0, clipDuration(clip));
            const globalTime = globalStart + local;
            const inCrossfade = outgoingOverlap > 0 && nextClip && renderVideo.currentTime >= crossfadeSourceStart;
            if (inCrossfade && nextClip) {
              const progress = clamp((renderVideo.currentTime - crossfadeSourceStart) / Math.max(0.001, outgoingOverlap), 0, 1);
              if (!overlapStarted) {
                overlapStarted = true;
                void renderOverlapVideo.play();
              }
              const expectedNextTime = nextClip.trimIn + progress * outgoingOverlap;
              if (Math.abs(renderOverlapVideo.currentTime - expectedNextTime) > 0.08) renderOverlapVideo.currentTime = expectedNextTime;
              if (originalGain) originalGain.gain.value = originalVolume * (1 - progress);
              if (overlapGain) overlapGain.gain.value = originalVolume * progress;
              drawFrame(globalTime, clipIndex, clipIndex + 1);
              updateAudioMix(globalTime);
            } else {
              if (originalGain) originalGain.gain.value = originalVolume;
              if (overlapGain) overlapGain.gain.value = 0;
              drawFrame(globalTime, clipIndex);
              updateAudioMix(globalTime);
            }
            setJobMessage(`Renderizando sequência… ${Math.min(99, Math.round(globalTime / Math.max(0.1, totalDuration) * 100))}%`);
            if (renderVideo.ended || renderVideo.currentTime >= clip.trimOut - 0.02) {
              renderVideo.pause();
              renderOverlapVideo.pause();
              if (originalGain) originalGain.gain.value = originalVolume;
              if (overlapGain) overlapGain.gain.value = 0;
              resolve();
              return;
            }
            requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        });
      }

      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
      musicSourceNode?.disconnect();
      for (const runtime of sfxRuntime) { try { runtime.source.disconnect(); runtime.gain.disconnect(); } catch { /* noop */ } }
      await audioContext?.close();
      canvasStream.getTracks().forEach((track) => track.stop());
      const webm = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      if (!webm.size) throw new Error("A renderização terminou sem gerar arquivo.");
      const finalUrl = await finalizeWebm(webm);
      if (!finalUrl) throw new Error("O vídeo foi processado, mas o arquivo final não foi retornado.");
      setResultUrl(finalUrl);
      setJobStatus("done");
      setJobMessage("Sequência final pronta e salva na Biblioteca Audiovisual.");
      logEditorEvent("render_completed", { clips: renderClips.length, sfx: renderSfxCues.length, duration: totalDuration, ratio, quality });
      toast({ title: "Vídeo finalizado", description: `${renderClips.length} clipe${renderClips.length === 1 ? "" : "s"} foram unidos em um único MP4 na Central de Mídias.` });
    } catch (error) {
      setJobStatus("error");
      setJobMessage(error instanceof Error ? error.message : "Falha ao renderizar o vídeo");
      logEditorEvent("render_failed", { message: error instanceof Error ? error.message : "Falha desconhecida", clips: renderClips.length, ratio, quality });
      toast({ title: "Falha na renderização", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    }
  };

  const createEditableAutomaticCaptions = async () => {
    if (!tenantId) return;
    if (clipsRef.current.length > 1 && !resultUrl) {
      toast({ title: "Finalize a sequência primeiro", description: "Com vários clipes, exporte o MP4 único antes de transcrever para a timeline." });
      return;
    }
    const source = resultUrl || activeClip?.url;
    if (!source) return;
    setJobStatus("processing");
    setJobMessage("Preparando fala para legendas editáveis…");
    try {
      const response = await fetch(source, { headers: source.startsWith("/api/") ? tokenHeaders() : undefined });
      if (!response.ok) throw new Error("Não foi possível carregar o vídeo para transcrição.");
      const blob = await response.blob();
      const form = new FormData();
      form.append("video", new File([blob], "video-transcricao.mp4", { type: blob.type || "video/mp4" }));
      const start = await fetch(`/api/tenants/${tenantId}/content-studio/video/transcribe`, { method: "POST", headers: tokenHeaders(), body: form });
      const data = await start.json();
      if (!start.ok) throw new Error(data.error ?? "Falha ao iniciar transcrição");
      const transcript = await pollTranscriptJob(String(data.jobId));
      const style = AUTO_CAPTION_STYLES[autoCaptionStyle];
      const usingRenderedSequence = Boolean(resultUrl);
      const sourceOffset = usingRenderedSequence ? 0 : (activeClip?.trimIn ?? 0);
      const maxTime = projectDurationFor(clipsRef.current);
      const generated: EditorLayer[] = [];

      for (const chunk of transcript.chunks ?? []) {
        const adjustedWords = (chunk.words ?? []).map((word) => ({
          word: String(word.word ?? "").trim(),
          start: Number(word.start) - sourceOffset,
          end: Number(word.end) - sourceOffset,
        })).filter((word) => word.word && word.end > 0 && word.start < maxTime);
        if (!adjustedWords.length) continue;
        const words = adjustedWords.map((word) => ({ ...word, start: clamp(word.start, 0, maxTime), end: clamp(word.end, 0, maxTime) })).filter((word) => word.end > word.start);
        if (!words.length) continue;
        const layerStart = words[0]!.start;
        const layerEnd = words[words.length - 1]!.end;
        generated.push({
          id: uid("caption-auto"),
          type: "text",
          name: `Legenda automática · ${style.label}`,
          text: words.map((word) => word.word).join(" "),
          start: layerStart,
          end: Math.max(layerStart + 0.08, layerEnd),
          x: 7,
          y: style.y,
          width: 86,
          fontSize: style.fontSize,
          color: style.color,
          background: style.background,
          opacity: 1,
          scale: 1,
          rotation: 0,
          easing: "ease-out",
          textAlign: "center",
          enterAnimation: style.enterAnimation,
          exitAnimation: "fade",
          animationDuration: 0.18,
          contentKind: "caption",
          captionStyle: autoCaptionStyle,
          captionMotion: style.motion,
          captionWords: words,
          activeWordColor: style.activeWordColor,
          activeWordBackground: style.activeWordBackground,
        });
      }

      if (!generated.length) throw new Error("A fala foi transcrita, mas não houve segmentos dentro do trecho editado.");
      const preserved = layersRef.current.filter((layer) => !(layer.contentKind === "caption" && layer.name.startsWith("Legenda automática")));
      commitEditor(clipsRef.current, [...preserved, ...generated]);
      selectLayer(generated[0]!.id);
      setTimelineTime(generated[0]!.start);
      setTool("captions");
      setJobStatus("done");
      setJobMessage(`${generated.length} legenda${generated.length === 1 ? "" : "s"} sincronizada${generated.length === 1 ? "" : "s"} adicionada${generated.length === 1 ? "" : "s"} à timeline.`);
      toast({ title: "Legendas editáveis criadas", description: "Cada frase está na timeline e a palavra falada recebe destaque automático." });
    } catch (error) {
      setJobStatus("error");
      setJobMessage(error instanceof Error ? error.message : "Falha ao gerar legendas editáveis");
    }
  };

  const applyBurnedAutomaticCaption = async () => {
    if (!tenantId) return;
    if (clipsRef.current.length > 1 && !resultUrl) {
      toast({ title: "Finalize a sequência primeiro", description: "Com vários clipes, exporte o MP4 único antes de aplicar a legenda fixa." });
      return;
    }
    const source = resultUrl || activeClip?.url;
    if (!source) return;
    setJobStatus("processing");
    setJobMessage("Gerando versão com legenda fixa…");
    try {
      const response = await fetch(source, { headers: source.startsWith("/api/") ? tokenHeaders() : undefined });
      if (!response.ok) throw new Error("Não foi possível carregar o vídeo para legendagem.");
      const blob = await response.blob();
      const form = new FormData();
      form.append("video", new File([blob], "video-legenda.mp4", { type: blob.type || "video/mp4" }));
      const start = await fetch(`/api/tenants/${tenantId}/content-studio/video/caption`, { method: "POST", headers: tokenHeaders(), body: form });
      const data = await start.json();
      if (!start.ok) throw new Error(data.error ?? "Falha ao iniciar legendagem");
      const url = await pollJob(String(data.jobId));
      setResultUrl(url);
      setJobStatus("done");
      setJobMessage("Versão com legenda fixa salva na Biblioteca Audiovisual.");
    } catch (error) {
      setJobStatus("error");
      setJobMessage(error instanceof Error ? error.message : "Falha ao aplicar legenda");
    }
  };



  const analyzeVideoWithAi = async () => {
    if (!tenantId || !clipsRef.current.length || aiAnalyzing) return;
    const captions = layersRef.current
      .filter((layer) => layer.contentKind === "caption" && layer.text.trim())
      .sort((a, b) => a.start - b.start);
    if (!captions.length) {
      toast({ title: "A IA precisa entender a fala", description: "Gere as legendas inteligentes primeiro. Elas fornecem o texto e os tempos exatos para a análise." });
      setTool("captions");
      return;
    }

    setAiAnalyzing(true);
    try {
      const currentClips = clipsRef.current;
      const response = await fetch(`/api/tenants/${tenantId}/content-studio/video/ai-edit-plan`, {
        method: "POST",
        headers: tokenHeaders(true),
        body: JSON.stringify({
          goal: aiGoal,
          instructions: aiInstructions.trim(),
          channel,
          ratio,
          duration: projectDurationFor(currentClips),
          clips: currentClips.map((clip, index) => ({
            id: clip.id,
            name: clip.name,
            start: clipStartAt(index, currentClips),
            end: clipStartAt(index, currentClips) + clipDuration(clip),
          })),
          captions: captions.map((layer) => ({ id: layer.id, start: layer.start, end: layer.end, text: layer.text })),
        }),
      });
      const data = await response.json() as { plan?: AiEditPlan; error?: string };
      if (!response.ok || !data.plan) throw new Error(data.error ?? "A IA não retornou um plano de edição");
      setAiPlan(data.plan);
      setAiSelectedIds(new Set(data.plan.suggestions.map((item) => item.id)));
      toast({ title: "Plano de edição pronto", description: `${data.plan.suggestions.length} melhoria${data.plan.suggestions.length === 1 ? "" : "s"} encontrada${data.plan.suggestions.length === 1 ? "" : "s"}. Revise e aplique na timeline.` });
    } catch (error) {
      toast({ title: "Não foi possível analisar o vídeo", description: error instanceof Error ? error.message : "Tente novamente", variant: "destructive" });
    } finally {
      setAiAnalyzing(false);
    }
  };

  const toggleAiSuggestion = (id: string) => {
    setAiSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const applyAiEditPlan = () => {
    if (!aiPlan) return;
    const suggestions = aiPlan.suggestions.filter((item) => aiSelectedIds.has(item.id)).sort((a, b) => a.start - b.start);
    if (!suggestions.length) {
      toast({ title: "Selecione ao menos uma melhoria" });
      return;
    }

    let nextClips = clipsRef.current.map((clip) => ({ ...clip }));
    let nextLayers: EditorLayer[] = layersRef.current.map((layer) => ({ ...layer, captionWords: layer.captionWords?.map((word) => ({ ...word })) }));

    for (const suggestion of suggestions) {
      if (suggestion.type === "caption_motion" && suggestion.layerId) {
        nextLayers = nextLayers.map((layer) => layer.id === suggestion.layerId && layer.contentKind === "caption"
          ? { ...layer, captionMotion: (suggestion.motion as CaptionMotion) || "word-pop" }
          : layer);
        continue;
      }

      if (suggestion.type === "sticker") {
        const start = clamp(suggestion.start, 0, projectDurationFor(nextClips));
        const end = clamp(Math.max(start + 0.4, suggestion.end), start + 0.4, projectDurationFor(nextClips));
        nextLayers.push({
          id: uid("ai-sticker"), type: "text", name: "Sticker · IA", text: suggestion.emoji || "✨",
          start, end, x: 72, y: 12, width: 16, fontSize: 72, color: "#ffffff", background: "transparent",
          opacity: 1, scale: 1, rotation: 0, easing: "ease-out", textAlign: "center", enterAnimation: "pop", exitAnimation: "fade", animationDuration: 0.2,
          contentKind: "sticker",
        });
        continue;
      }

      if (suggestion.type === "cta") {
        const start = clamp(suggestion.start, 0, projectDurationFor(nextClips));
        const end = clamp(Math.max(start + 0.8, suggestion.end), start + 0.8, projectDurationFor(nextClips));
        nextLayers.push({
          id: uid("ai-cta"), type: "card", name: "CTA · IA", text: suggestion.text || "Fale com nossa equipe",
          start, end, x: 8, y: 68, width: 84, fontSize: 36, color: "#ffffff", background: "#111827",
          opacity: 0.94, scale: 1, rotation: 0, easing: "ease-in-out", textAlign: "center", enterAnimation: "slide-up", exitAnimation: "fade", animationDuration: 0.3,
        });
        continue;
      }

      if (suggestion.type === "clip_motion") {
        const total = projectDurationFor(nextClips);
        const start = clamp(suggestion.start, 0, Math.max(0, total - 0.1));
        const end = clamp(Math.max(start + 0.5, suggestion.end), start + 0.5, total);
        const located = locateClip(start, nextClips);
        if (!located) continue;
        const centerEndGlobal = Math.min(end, located.end);
        const sourceStart = located.clip.trimIn + (start - located.start);
        const sourceEnd = located.clip.trimIn + (centerEndGlobal - located.start);
        if (sourceEnd - sourceStart < 0.25) continue;

        const pieces: VideoClip[] = [];
        if (sourceStart - located.clip.trimIn > 0.08) {
          pieces.push({ ...located.clip, id: uid("clip-ai"), name: `${located.clip.name} · antes`, trimOut: sourceStart, transitionOut: "cut", motion: located.clip.motion ?? "none" });
        }
        pieces.push({
          ...located.clip,
          id: uid("clip-ai-focus"),
          name: `${located.clip.name} · destaque IA`,
          trimIn: sourceStart,
          trimOut: sourceEnd,
          transitionOut: "cut",
          motion: (suggestion.motion as ClipMotion) || "zoom-in",
        });
        if (located.clip.trimOut - sourceEnd > 0.08) {
          pieces.push({ ...located.clip, id: uid("clip-ai"), name: `${located.clip.name} · depois`, trimIn: sourceEnd });
        } else if (pieces.length) {
          const last = pieces[pieces.length - 1]!;
          last.transitionOut = located.clip.transitionOut;
          last.transitionDuration = located.clip.transitionDuration;
        }
        if (pieces.length > 1) {
          const last = pieces[pieces.length - 1]!;
          last.transitionOut = located.clip.transitionOut;
          last.transitionDuration = located.clip.transitionDuration;
        }
        const replacement = [...nextClips];
        replacement.splice(located.index, 1, ...pieces);
        nextClips = replacement;
      }
    }

    commitEditor(nextClips, nextLayers);
    const active = locateClip(clamp(timelineTime, 0, Math.max(0, projectDurationFor(nextClips) - 0.001)), nextClips);
    if (active) {
      setActiveClipId(active.clip.id);
      setSelectedClipId("");
    }
    setSelectedLayerId("");
    logEditorEvent("auto_edit_applied", { count: suggestions.length, goal: aiGoal, preset: selectedAutoPresetId || null });
    toast({ title: "Melhorias aplicadas", description: `${suggestions.length} ajuste${suggestions.length === 1 ? "" : "s"} entrou${suggestions.length === 1 ? "" : "aram"} na timeline. Tudo continua editável e pode ser desfeito.` });
  };

  const mediaImages = assets.filter((asset) => asset.type === "image");
  const mediaVideos = assets.filter((asset) => asset.type === "video");
  const ratioCss = ratio.replace(":", " / ");
  const crossfadePreview = crossfadeWindowAt(timelineTime, clips);

  const PropertiesPanel = selectedLayer ? (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div><p className="text-sm font-semibold">{selectedLayer.name}</p><p className="text-xs text-muted-foreground">{selectedLayer.type === "image" ? "Imagem" : selectedLayer.type === "card" ? "Card" : selectedLayer.contentKind === "caption" ? "Legenda sincronizada" : selectedLayer.contentKind === "sticker" ? "Sticker / emoji" : "Texto"}</p></div>
        <div className="flex gap-1"><button onClick={() => duplicateLayer(selectedLayer.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" title="Duplicar"><Copy className="h-4 w-4" /></button><button onClick={() => removeLayer(selectedLayer.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button></div>
      </div>
      <div className="rounded-lg border bg-muted/30 px-2.5 py-2 text-[10px] text-muted-foreground">Arraste no preview para reposicionar. Puxe a alça inferior para redimensionar.</div>
      {selectedLayer.type !== "image" && <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Conteúdo</span><textarea value={selectedLayer.text} onChange={(event) => updateSelectedLayerText(event.target.value)} rows={4} className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-primary" /></label>}
      <div className="grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-xs text-muted-foreground">Início</span><input type="number" min={0} max={projectDuration} step={0.1} value={selectedLayer.start.toFixed(1)} onChange={(event) => updateLayer({ start: clamp(Number(event.target.value), 0, selectedLayer.end - 0.1) })} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" /></label><label className="space-y-1"><span className="text-xs text-muted-foreground">Fim</span><input type="number" min={0.1} max={projectDuration} step={0.1} value={selectedLayer.end.toFixed(1)} onChange={(event) => updateLayer({ end: clamp(Number(event.target.value), selectedLayer.start + 0.1, projectDuration) })} className="h-9 w-full rounded-lg border bg-background px-2 text-sm" /></label></div>
      <RangeField label="Posição horizontal" value={selectedLayer.x} min={0} max={Math.max(0, 100 - selectedLayer.width)} onChange={(value) => updateLayer({ x: value })} suffix="%" />
      <RangeField label="Posição vertical" value={selectedLayer.y} min={0} max={95} onChange={(value) => updateLayer({ y: value })} suffix="%" />
      <RangeField label="Largura" value={selectedLayer.width} min={10} max={Math.max(10, 100 - selectedLayer.x)} onChange={(value) => updateLayer({ width: value })} suffix="%" />
      {selectedLayer.type !== "image" && <RangeField label="Tamanho do texto" value={selectedLayer.fontSize} min={18} max={96} onChange={(value) => updateLayer({ fontSize: value })} />}
      <RangeField label="Opacidade" value={selectedLayer.opacity} min={0.1} max={1} step={0.05} onChange={(value) => updateLayer({ opacity: value })} />
      <RangeField label="Escala" value={selectedLayer.scale ?? 1} min={0.2} max={3} step={0.05} suffix="x" onChange={(value) => updateLayer({ scale: value })} />
      <RangeField label="Rotação" value={selectedLayer.rotation ?? 0} min={-180} max={180} step={1} suffix="°" onChange={(value) => updateLayer({ rotation: value })} />
      {selectedLayer.type !== "image" && <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Alinhamento</span><select value={selectedLayer.textAlign ?? "left"} onChange={(event) => updateLayer({ textAlign: event.target.value as TextAlign })} className="h-9 w-full rounded-lg border bg-background px-2 text-xs"><option value="left">Esquerda</option><option value="center">Centralizado</option><option value="right">Direita</option></select></label>}
      <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
        <div><p className="text-xs font-semibold">Entrada e saída</p><p className="text-[10px] text-muted-foreground">Animações prontas para texto, card ou imagem, aplicadas também no MP4 final.</p></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-[10px] text-muted-foreground">Entrada</span><select value={selectedLayer.enterAnimation ?? "none"} onChange={(event) => updateLayer({ enterAnimation: event.target.value as LayerAnimation })} className="h-9 w-full rounded-lg border bg-background px-2 text-[11px]"><option value="none">Sem efeito</option><option value="fade">Fade</option><option value="pop">Pop</option><option value="zoom">Zoom</option><option value="slide-up">Subir</option><option value="slide-down">Descer</option><option value="slide-left">Entrar da direita</option><option value="slide-right">Entrar da esquerda</option></select></label>
          <label className="space-y-1"><span className="text-[10px] text-muted-foreground">Saída</span><select value={selectedLayer.exitAnimation ?? "none"} onChange={(event) => updateLayer({ exitAnimation: event.target.value as LayerAnimation })} className="h-9 w-full rounded-lg border bg-background px-2 text-[11px]"><option value="none">Sem efeito</option><option value="fade">Fade</option><option value="pop">Pop</option><option value="zoom">Zoom</option><option value="slide-up">Subir</option><option value="slide-down">Descer</option><option value="slide-left">Sair à esquerda</option><option value="slide-right">Sair à direita</option></select></label>
        </div>
        <RangeField label="Duração do efeito" value={selectedLayer.animationDuration ?? 0.35} min={0.1} max={1.5} step={0.05} suffix="s" onChange={(value) => updateLayer({ animationDuration: value })} />
      </div>
      <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Curva da animação</span><select value={selectedLayer.easing ?? "ease-in-out"} onChange={(event) => updateLayer({ easing: event.target.value as EasingType })} className="h-9 w-full rounded-lg border bg-background px-2 text-xs"><option value="linear">Linear</option><option value="ease-in">Acelera</option><option value="ease-out">Desacelera</option><option value="ease-in-out">Suave · acelera e desacelera</option></select></label>
      <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold">Keyframes de movimento</p><p className="text-[10px] text-muted-foreground">Registre posição, tamanho, escala, rotação e opacidade no cursor.</p></div><button onClick={addLayerKeyframe} className="rounded-lg border bg-background px-2 py-1.5 text-[10px] font-medium">+ Keyframe</button></div>
        {(selectedLayer.keyframes ?? []).length ? <div className="flex flex-wrap gap-1.5">{(selectedLayer.keyframes ?? []).map((frame) => <div key={frame.time} className="inline-flex items-center overflow-hidden rounded-lg border bg-background"><button onClick={() => seekTimeline(frame.time)} className="px-2 py-1 text-[10px] font-medium">◆ {timeLabel(frame.time)}</button><button onClick={() => removeLayerKeyframe(frame.time)} className="border-l px-1.5 py-1 text-muted-foreground hover:text-destructive" title="Remover keyframe">×</button></div>)}</div> : <p className="text-[10px] text-muted-foreground">Mova o cursor, ajuste o elemento e clique em + Keyframe. Repita em outro momento para criar a animação.</p>}
      </div>
      {selectedLayer.type !== "image" && <div className="grid grid-cols-2 gap-3"><label className="space-y-1.5"><span className="text-xs text-muted-foreground">Texto</span><input type="color" value={selectedLayer.color} onChange={(event) => updateLayer({ color: event.target.value })} className="h-9 w-full rounded-lg border bg-background p-1" /></label><label className="space-y-1.5"><span className="text-xs text-muted-foreground">Fundo</span><input type="color" value={selectedLayer.background || "#000000"} onChange={(event) => updateLayer({ background: event.target.value })} className="h-9 w-full rounded-lg border bg-background p-1" /></label></div>}
      {selectedLayer.contentKind === "caption" && <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
        <div><p className="text-xs font-semibold">Montagem da frase</p><p className="text-[10px] text-muted-foreground">Divida, una e refine o sincronismo sem retranscrever o vídeo.</p></div>
        <div className="grid grid-cols-2 gap-2">
          <button disabled={timelineTime <= selectedLayer.start + 0.01 || timelineTime >= selectedLayer.end - 0.01} onClick={splitSelectedCaptionAtPlayhead} className="rounded-lg border bg-background px-2 py-2 text-[10px] font-medium disabled:opacity-30"><Scissors className="mr-1 inline h-3.5 w-3.5" />Dividir no cursor</button>
          <button onClick={joinSelectedCaptionWithNext} className="rounded-lg border bg-background px-2 py-2 text-[10px] font-medium">Juntar próxima</button>
        </div>
        <label className="block space-y-1.5"><span className="text-[10px] text-muted-foreground">Movimento seguindo a fala</span><select value={selectedLayer.captionMotion ?? "word-pop"} onChange={(event) => updateLayer({ captionMotion: event.target.value as CaptionMotion })} className="h-9 w-full rounded-lg border bg-background px-2 text-xs">{Object.entries(CAPTION_MOTIONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        {(selectedLayer.captionWords ?? []).length > 0 && <div className="space-y-2"><div className="flex items-center justify-between"><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Tempo por palavra</p><span className="text-[9px] text-muted-foreground">segundos</span></div><div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">{selectedLayer.captionWords!.map((word, index) => <div key={`${word.start}-${index}`} className="grid grid-cols-[minmax(70px,1fr)_64px_64px] items-center gap-1.5 rounded-lg border bg-background p-1.5"><button onClick={() => seekTimeline(word.start)} className="truncate text-left text-[10px] font-medium" title="Ir para esta palavra">{word.word}</button><input aria-label={`Início de ${word.word}`} type="number" min={0} max={projectDuration} step={0.01} value={word.start.toFixed(2)} onChange={(event) => updateCaptionWordTiming(index, "start", Number(event.target.value))} className="h-7 rounded border bg-background px-1 text-[9px] tabular-nums" /><input aria-label={`Fim de ${word.word}`} type="number" min={0} max={projectDuration} step={0.01} value={word.end.toFixed(2)} onChange={(event) => updateCaptionWordTiming(index, "end", Number(event.target.value))} className="h-7 rounded border bg-background px-1 text-[9px] tabular-nums" /></div>)}</div></div>}
      </div>}
      {selectedLayer.contentKind === "caption" && <div className="space-y-3 rounded-xl border bg-muted/20 p-3"><div><p className="text-xs font-semibold">Destaque palavra a palavra</p><p className="text-[10px] text-muted-foreground">{selectedLayer.captionWords?.length ?? 0} palavras sincronizadas com a fala.</p></div><label className="block space-y-1.5"><span className="text-[10px] text-muted-foreground">Estilo</span><select value={selectedLayer.captionStyle ?? "impact"} onChange={(event) => { const preset = event.target.value as CaptionStylePreset; const style = AUTO_CAPTION_STYLES[preset]; updateLayer({ captionStyle: preset, fontSize: style.fontSize, y: style.y, color: style.color, background: style.background, activeWordColor: style.activeWordColor, activeWordBackground: style.activeWordBackground, enterAnimation: style.enterAnimation, captionMotion: style.motion }); }} className="h-9 w-full rounded-lg border bg-background px-2 text-xs">{Object.entries(AUTO_CAPTION_STYLES).map(([id, style]) => <option key={id} value={id}>{style.label}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="space-y-1.5"><span className="text-[10px] text-muted-foreground">Palavra ativa</span><input type="color" value={selectedLayer.activeWordColor || "#111827"} onChange={(event) => updateLayer({ activeWordColor: event.target.value })} className="h-9 w-full rounded-lg border bg-background p-1" /></label><label className="space-y-1.5"><span className="text-[10px] text-muted-foreground">Fundo ativo</span><input type="color" value={selectedLayer.activeWordBackground && selectedLayer.activeWordBackground !== "transparent" ? selectedLayer.activeWordBackground : "#facc15"} onChange={(event) => updateLayer({ activeWordBackground: event.target.value })} className="h-9 w-full rounded-lg border bg-background p-1" /></label></div></div>}
    </div>
  ) : selectedClip ? (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{selectedClip.name}</p><p className="text-xs text-muted-foreground">Clipe de vídeo · {timeLabel(clipDuration(selectedClip))}</p></div><div className="flex gap-1"><button onClick={() => duplicateClip(selectedClip.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" title="Duplicar"><Copy className="h-4 w-4" /></button><button onClick={() => removeClip(selectedClip.id)} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remover"><Trash2 className="h-4 w-4" /></button></div></div>
      <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground"><p className="font-medium text-foreground">Corte individual</p><p className="mt-1">O arquivo original não é alterado. O editor usa apenas o trecho definido abaixo.</p></div>
      <label className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3 text-xs"><span><strong className="block">Bloquear no Beat Sync</strong><span className="text-[10px] text-muted-foreground">Mantém este clipe e suas bordas exatamente onde estão.</span></span><input type="checkbox" checked={selectedClip.beatLocked === true} onChange={(event) => updateClip({ beatLocked: event.target.checked })} className="accent-primary" /></label>
      <RangeField label="Entrada" value={selectedClip.trimIn} min={0} max={Math.max(0, selectedClip.trimOut - 0.1)} step={0.1} suffix="s" onChange={(value) => updateClip({ trimIn: value })} />
      <RangeField label="Saída" value={selectedClip.trimOut} min={Math.min(selectedClip.sourceDuration, selectedClip.trimIn + 0.1)} max={selectedClip.sourceDuration} step={0.1} suffix="s" onChange={(value) => updateClip({ trimOut: value })} />
      <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
        <div><p className="text-xs font-semibold">Transição para o próximo clipe</p><p className="text-[10px] text-muted-foreground">Aparece no preview e também no MP4 final.</p></div>
        <select value={selectedClip.transitionOut ?? "cut"} onChange={(event) => updateClip({ transitionOut: event.target.value as TransitionType })} className="h-9 w-full rounded-lg border bg-background px-2 text-xs"><option value="cut">Corte seco</option><option value="fade">Fade</option><option value="crossfade">Crossfade real</option><option value="zoom">Zoom</option><option value="slide-left">Deslizar para esquerda</option><option value="slide-right">Deslizar para direita</option></select>
        {(selectedClip.transitionOut ?? "cut") !== "cut" && <RangeField label="Duração da transição" value={selectedClip.transitionDuration ?? 0.45} min={0.1} max={Math.max(0.1, Math.min(1.5, clipDuration(selectedClip) / 2))} step={0.05} suffix="s" onChange={(value) => updateClip({ transitionDuration: value })} />}
        <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Movimento de câmera</span><select value={selectedClip.motion ?? "none"} onChange={(event) => updateClip({ motion: event.target.value as ClipMotion })} className="h-9 w-full rounded-lg border bg-background px-2 text-xs"><option value="none">Sem movimento</option><option value="zoom-in">Zoom in suave</option><option value="zoom-out">Zoom out suave</option><option value="pan-left">Panorâmica para esquerda</option><option value="pan-right">Panorâmica para direita</option></select></label>
      </div>
      <div className="grid grid-cols-2 gap-2"><button onClick={() => moveClip(selectedClip.id, -1)} disabled={clips.findIndex((clip) => clip.id === selectedClip.id) === 0} className="inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" />Mover antes</button><button onClick={() => moveClip(selectedClip.id, 1)} disabled={clips.findIndex((clip) => clip.id === selectedClip.id) === clips.length - 1} className="inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs disabled:opacity-30">Mover depois<ChevronRight className="h-3.5 w-3.5" /></button></div>
      <button onClick={() => { const index = clips.findIndex((clip) => clip.id === selectedClip.id); seekTimeline(clipStartAt(index, clips)); }} className="w-full rounded-lg border px-3 py-2 text-xs font-medium">Ir para o início deste clipe</button>
    </div>
  ) : (
    <div className="space-y-4"><div><p className="text-sm font-semibold">Projeto</p><p className="text-xs text-muted-foreground">Selecione um clipe ou camada para editar.</p></div><div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5"><p>• Adicione vários vídeos e organize a sequência.</p><p>• Corte ou divida cada clipe sem alterar o original.</p><p>• Textos, cards, imagens e áudio usam a timeline global.</p><p>• Transições, movimentos de câmera e keyframes ficam no mesmo projeto.</p></div></div>
  );

  const ToolContent = (() => {
    if (tool === "ai") return <div className="space-y-4">
      <div><p className="text-sm font-semibold">Assistente de edição IA</p><p className="text-xs text-muted-foreground">Analisa a fala e cria ajustes reais na timeline. Você revisa antes de aplicar.</p></div>
      <div className="space-y-2"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold">Presets completos</p><p className="text-[10px] text-muted-foreground">Preparam IA, legendas, Beat Sync e mixagem em um clique.</p></div>{selectedAutoPresetId && <span className="rounded-full border bg-primary/5 px-2 py-0.5 text-[9px] font-medium text-primary">{AUTO_EDIT_PRESETS.find((preset) => preset.id === selectedAutoPresetId)?.label}</span>}</div><div className="grid grid-cols-2 gap-2">{AUTO_EDIT_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => applyAutoEditPreset(preset.id)} className={cn("rounded-xl border p-2.5 text-left transition-colors", selectedAutoPresetId === preset.id ? "border-primary bg-primary/5" : "hover:border-primary/30")}><span className="block text-[11px] font-semibold">{preset.label}</span><span className="mt-0.5 block text-[9px] leading-3.5 text-muted-foreground">{preset.hint}</span></button>)}</div></div>
      <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Objetivo</span><select value={aiGoal} onChange={(event) => { setAiGoal(event.target.value); setSelectedAutoPresetId(""); setAiPlan(null); }} className="h-10 w-full rounded-xl border bg-background px-3 text-sm">{AI_EDIT_GOALS.map((goal) => <option key={goal.id} value={goal.id}>{goal.label}</option>)}</select><p className="text-[10px] text-muted-foreground">{AI_EDIT_GOALS.find((goal) => goal.id === aiGoal)?.hint}</p></label>
      <label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Orientação adicional · opcional</span><textarea value={aiInstructions} onChange={(event) => setAiInstructions(event.target.value)} rows={3} placeholder="Ex.: destaque a condição comercial e termine chamando para o WhatsApp" className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-xs outline-none focus:border-primary" /></label>
      {!layers.some((layer) => layer.contentKind === "caption" && layer.text.trim()) && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"><p className="text-xs font-semibold">Transcrição necessária</p><p className="mt-1 text-[11px] text-muted-foreground">A IA usa as legendas sincronizadas para saber o que é dito e em qual segundo acontece.</p><button onClick={() => setTool("captions")} className="mt-2 rounded-lg border bg-background px-2.5 py-1.5 text-[10px] font-medium">Ir para Legendas</button></div>}
      <button disabled={aiAnalyzing || !clips.length || !layers.some((layer) => layer.contentKind === "caption" && layer.text.trim())} onClick={() => void analyzeVideoWithAi()} className="w-full rounded-xl bg-foreground px-3 py-3 text-sm font-semibold text-background disabled:opacity-40">{aiAnalyzing ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Analisando roteiro e timeline…</> : <><WandSparkles className="mr-2 inline h-4 w-4" />Analisar e sugerir</>}</button>
      {aiPlan && <div className="space-y-3"><div className="rounded-xl border bg-primary/5 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">Plano de edição</p><span className="rounded-full border bg-background px-2 py-0.5 text-[9px] text-muted-foreground">{aiPlan.source === "fallback" ? "Automação segura" : "IA"}</span></div><p className="mt-1 text-[11px] text-muted-foreground">{aiPlan.summary}</p></div><div className="max-h-72 space-y-2 overflow-y-auto pr-1">{aiPlan.suggestions.map((suggestion) => { const selected = aiSelectedIds.has(suggestion.id); const label = suggestion.type === "sticker" ? `Sticker ${suggestion.emoji || "✨"}` : suggestion.type === "cta" ? "CTA" : suggestion.type === "caption_motion" ? "Movimento da legenda" : "Zoom / câmera"; return <label key={suggestion.id} className={cn("flex cursor-pointer gap-2 rounded-xl border p-2.5", selected && "border-primary/40 bg-primary/5")}><input type="checkbox" checked={selected} onChange={() => toggleAiSuggestion(suggestion.id)} className="mt-0.5 accent-primary" /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold">{label}</span><span className="text-[9px] tabular-nums text-muted-foreground">{timeLabel(suggestion.start)}–{timeLabel(suggestion.end)}</span></span><span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{suggestion.reason}</span>{suggestion.type === "cta" && suggestion.text && <span className="mt-1 block rounded bg-background px-1.5 py-1 text-[10px] font-medium">{suggestion.text}</span>}</span></label>; })}</div><button disabled={aiSelectedIds.size === 0} onClick={applyAiEditPlan} className="w-full rounded-xl border border-primary bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">Aplicar {aiSelectedIds.size} melhoria{aiSelectedIds.size === 1 ? "" : "s"} na timeline</button><p className="text-[10px] text-muted-foreground">Os ajustes viram clipes/camadas comuns. Você pode mover, editar, excluir ou usar Desfazer.</p></div>}
    </div>;
    if (tool === "text") return <div className="space-y-3"><div><p className="text-sm font-semibold">Adicionar texto</p><p className="text-xs text-muted-foreground">Faixas escritas independentes sobre toda a sequência.</p></div><button onClick={() => addTextLayer("title")} className="w-full rounded-xl border p-3 text-left hover:border-primary/40 hover:bg-primary/5"><p className="font-semibold">Título</p><p className="text-xs text-muted-foreground">Gancho ou headline principal</p></button><button onClick={() => addTextLayer("subtitle")} className="w-full rounded-xl border p-3 text-left hover:border-primary/40 hover:bg-primary/5"><p className="font-medium">Subtítulo</p><p className="text-xs text-muted-foreground">Mensagem de apoio e benefício</p></button><button onClick={() => addTextLayer("cta")} className="w-full rounded-xl border p-3 text-left hover:border-primary/40 hover:bg-primary/5"><p className="font-medium">CTA</p><p className="text-xs text-muted-foreground">WhatsApp, site ou chamada final</p></button></div>;
    if (tool === "cards") return <div className="space-y-3"><div><p className="text-sm font-semibold">Cards</p><p className="text-xs text-muted-foreground">Oferta, benefício e CTA no ponto atual da timeline.</p></div>{CARD_TEMPLATES.map((template) => <button key={template.name} onClick={() => addCardLayer(template)} className="w-full rounded-xl border p-3 text-left hover:border-primary/40"><div className="h-12 rounded-lg p-2 text-xs font-bold" style={{ background: template.background, color: template.color }}>{template.text.split("\n").map((line) => <div key={line}>{line}</div>)}</div><p className="mt-2 text-xs font-medium">{template.name}</p></button>)}</div>;
    if (tool === "audio") return <div className="space-y-4"><div><p className="text-sm font-semibold">Áudio e trilha</p><p className="text-xs text-muted-foreground">Trilha, mixagem, efeitos sonoros e mapa de intensidade do vídeo.</p></div><div className="space-y-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold">SFX inteligente + clímax</p><p className="mt-0.5 text-[10px] text-muted-foreground">Combina fala, cortes, elementos visuais, downbeats e energia da trilha.</p></div>{climaxPoint && <span className="shrink-0 rounded-full border bg-background px-2 py-0.5 text-[9px] font-semibold tabular-nums">Clímax {timeLabel(climaxPoint.time)} · {climaxPoint.score}</span>}</div>{intensityMap.length > 0 && <div><div className="flex h-11 items-end gap-px rounded-lg bg-background px-1.5 py-1">{intensityMap.map((point, index) => <button key={`${point.time}-${index}`} type="button" onClick={() => seekTimeline(point.time)} className={cn("min-w-[2px] flex-1 rounded-sm bg-cyan-500/65 transition-opacity hover:opacity-100", climaxPoint && Math.abs(point.time - climaxPoint.time) < 0.01 ? "opacity-100 ring-1 ring-cyan-400" : "opacity-70")} style={{ height: `${Math.max(8, point.score)}%` }} title={`${timeLabel(point.time)} · intensidade ${point.score}/100${point.reasons.length ? ` · ${point.reasons.join(", ")}` : ""}`} />)}</div><p className="mt-1 text-[9px] text-muted-foreground">Clique no mapa para levar o cursor ao ponto analisado.</p></div>}{sfxSuggestions.length > 0 ? <div className="space-y-1.5"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold">Sugestões seguras</span><button type="button" onClick={applySuggestedSfx} className="rounded-lg bg-cyan-600 px-2 py-1 text-[9px] font-semibold text-white">Aplicar {sfxSuggestions.length}</button></div>{sfxSuggestions.map((suggestion) => <div key={suggestion.id} className="flex items-center justify-between gap-2 rounded-lg border bg-background px-2 py-1.5 text-[9px]"><span className="min-w-0 truncate"><strong>{suggestion.category}</strong> · {assetName(suggestion.asset)} · {suggestion.reason}</span><span className="shrink-0 tabular-nums text-muted-foreground">{timeLabel(suggestion.start)}</span></div>)}</div> : <div className="rounded-lg border border-dashed bg-background p-2 text-[9px] text-muted-foreground">A automação usa somente SFX com direitos liberados. Valide efeitos na Central de Mídias para receber sugestões automáticas.</div>}{soundEffectAssets.length > 0 ? <div className="space-y-1.5"><p className="text-[10px] font-semibold">Biblioteca de efeitos</p><div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">{soundEffectAssets.map((asset) => <div key={asset.id} className="flex items-center gap-2 rounded-lg border bg-background p-2"><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-medium">{assetName(asset)}</p><p className={cn("text-[9px]", sfxAutomationAllowed(asset) ? "text-emerald-600" : "text-amber-600")}>{sfxCategoryFor(asset)} · {sfxAutomationAllowed(asset) ? "direitos liberados" : "uso manual · revisar direitos"}</p></div><button type="button" onClick={() => void previewSfxAsset(asset)} className="rounded-md border p-1.5" title="Ouvir"><Play className="h-3 w-3" /></button><button type="button" onClick={() => addSfxCue(asset)} className="rounded-md bg-foreground px-2 py-1 text-[9px] font-semibold text-background">+ cursor</button></div>)}</div></div> : <button type="button" onClick={() => navigate("/midias")} className="w-full rounded-lg border border-dashed bg-background p-2.5 text-[10px] text-muted-foreground">Nenhum efeito sonoro cadastrado · abrir Central de Mídias</button>}{sfxCues.length > 0 && <div className="space-y-1.5"><p className="text-[10px] font-semibold">SFX na timeline · {sfxCues.length}</p>{sfxCues.map((cue) => <div key={cue.id} className="space-y-1 rounded-lg border bg-background p-2"><div className="flex items-center gap-2"><button type="button" onClick={() => seekTimeline(cue.start)} className="min-w-0 flex-1 truncate text-left text-[9px] font-medium">{timeLabel(cue.start)} · {cue.name}</button><button type="button" onClick={() => removeSfxCue(cue.id)} className="rounded p-1 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button></div><div className="flex items-center gap-2"><span className="text-[8px] text-muted-foreground">volume</span><input type="range" min={0} max={1.2} step={0.05} value={cue.volume} onChange={(event) => updateSfxCue(cue.id, { volume: Number(event.target.value) })} className="flex-1 accent-cyan-500" /><span className="w-7 text-right text-[8px] tabular-nums">{Math.round(cue.volume * 100)}%</span></div></div>)}</div>}</div><div className="grid grid-cols-2 gap-2">{(["none", "brand", "library", "upload", "ai"] as MusicMode[]).map((mode) => <button key={mode} onClick={() => { setMusicMode(mode); if (mode === "brand") setMusicAssetId(brandDefaultTrackId); }} className={cn("rounded-lg border px-2 py-2 text-xs", musicMode === mode ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground")}>{mode === "none" ? "Sem trilha" : mode === "brand" ? "Brand Kit" : mode === "library" ? "Biblioteca" : mode === "upload" ? "Enviar áudio" : "Gerar IA"}</button>)}</div>{musicTracks.length > 0 && <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/[0.03] p-3"><div className="flex items-start gap-2"><WandSparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="text-xs font-semibold">Recomendadas para este vídeo</p><p className="mt-0.5 text-[10px] text-muted-foreground">{musicRecommendationProfile.label} · {musicRecommendationProfile.bpmMin}–{musicRecommendationProfile.bpmMax} BPM · {musicRecommendationProfile.paidCampaign ? "mídia paga" : "uso orgânico"}</p></div></div>{recommendedMusicTracks.length > 0 ? <div className="space-y-2">{recommendedMusicTracks.map(({ track, reasons, compatibility }, index) => { const metadata = metadataRecord(track); return <div key={track.id} className={cn("rounded-lg border bg-background p-2.5", musicAssetId === track.id && "border-primary bg-primary/5")}><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">#{index + 1}</span><span className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tabular-nums">{compatibility}%</span><p className="truncate text-xs font-medium">{assetName(track)}</p>{metadata.brandOfficial === true && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}</div><div className="mt-1.5 flex flex-wrap gap-1">{reasons.map((reason) => <span key={reason} className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{reason}</span>)}</div><p className="mt-1.5 text-[9px] text-emerald-700 dark:text-emerald-300">{musicRecommendationProfile.paidCampaign ? "Direitos para mídia paga liberados" : "Direitos para uso orgânico liberados"} · score criativo {compatibility}/100</p></div><button type="button" onClick={() => { setMusicMode("library"); setMusicAssetId(track.id); setMusicStart(0); setMusicEnd(Math.max(0.1, realProjectDuration)); toast({ title: "Trilha aplicada", description: `${assetName(track)} foi adicionada à timeline.` }); }} className="shrink-0 rounded-lg bg-primary px-2 py-1.5 text-[10px] font-semibold text-primary-foreground">Aplicar</button></div></div>; })}</div> : <div className="rounded-lg border border-dashed p-2.5 text-[10px] text-muted-foreground">Nenhuma trilha da biblioteca tem direitos compatíveis com este contexto. Ajuste o Passaporte de Direitos no Music Hub ou gere uma nova trilha.</div>}</div>}{musicMode === "upload" && <button onClick={() => musicInputRef.current?.click()} className="w-full rounded-xl border border-dashed p-4 text-sm hover:border-primary/40"><Upload className="mx-auto mb-2 h-5 w-5" />{musicFile?.name ?? "Selecionar arquivo de áudio"}</button>}{(musicMode === "library" || musicMode === "brand") && <div className="max-h-52 space-y-2 overflow-y-auto pr-1">{musicTracks.map((track) => { const allowed = track.usage?.organicAllowed !== false; const active = musicAssetId === track.id; return <button key={track.id} disabled={!allowed} onClick={() => setMusicAssetId(track.id)} className={cn("w-full rounded-xl border p-2.5 text-left text-xs", active ? "border-primary bg-primary/5" : "", !allowed && "opacity-50")}><p className="truncate font-medium">{assetName(track)}</p><p className="mt-1 text-[10px] text-muted-foreground">{allowed ? track.usage?.paidAdsAllowed ? "Comercial + mídia paga liberados" : "Uso orgânico liberado" : "Direitos pendentes/restritos"}</p></button>; })}</div>}{musicMode === "ai" && <div className="vendor-light-module overflow-hidden rounded-xl"><AiMusicGenerator tenantId={tenantId} onGenerated={async (assetId) => { await loadMusic(); setMusicMode("library"); setMusicAssetId(assetId); }} /></div>}{musicMode !== "none" && (selectedTrack || musicFile) && <div className="space-y-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3"><div className="flex items-start gap-2"><Music2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><div className="min-w-0"><p className="text-xs font-semibold">Beat Sync</p><p className="mt-0.5 text-[10px] text-muted-foreground">Detecta o pulso da trilha e encaixa cortes/transições no ritmo sem alterar os originais.</p></div></div>{activeBeatAnalysis ? <div className="rounded-lg border bg-background p-2.5"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold tabular-nums">{activeBeatAnalysis.bpm.toFixed(1)} BPM</p><p className="text-[9px] text-muted-foreground">{activeBeatAnalysis.source === "audio" ? "Forma de onda analisada" : activeBeatAnalysis.source === "server" ? "Análise segura no servidor" : "BPM do Music Hub"} · fase {activeBeatAnalysis.offset.toFixed(2)}s</p></div><button type="button" onClick={() => void analyzeMusicBeats()} disabled={beatAnalyzing} className="rounded-lg border px-2 py-1 text-[9px] font-medium disabled:opacity-50">Reanalisar</button></div>{activeBeatAnalysis.waveform.length > 0 && <div className="mt-2 flex h-10 items-center gap-px overflow-hidden rounded-md bg-muted/40 px-1">{activeBeatAnalysis.waveform.map((level, index) => <span key={index} className="min-w-[1px] flex-1 rounded-full bg-amber-500/70" style={{ height: `${Math.max(8, Math.round(level * 100))}%` }} />)}</div>}</div> : <button type="button" onClick={() => void analyzeMusicBeats()} disabled={beatAnalyzing} className="w-full rounded-lg bg-foreground px-3 py-2.5 text-xs font-semibold text-background disabled:opacity-50">{beatAnalyzing ? <><Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />Analisando batidas…</> : <><WandSparkles className="mr-1.5 inline h-3.5 w-3.5" />Detectar batidas</>}</button>}{activeBeatAnalysis && <><label className="block space-y-1"><span className="text-[10px] text-muted-foreground">Ritmo dos cortes</span><select value={beatStep} onChange={(event) => setBeatStep(Number(event.target.value) as BeatStep)} className="h-8 w-full rounded-lg border bg-background px-2 text-[11px]"><option value={1}>Cada batida</option><option value={2}>A cada 2 batidas</option><option value={4}>A cada 4 batidas</option></select></label><label className="flex items-center justify-between gap-3 rounded-lg border bg-background px-2.5 py-2 text-[10px]"><span>Mostrar batidas na timeline</span><input type="checkbox" checked={showBeatMarkers} onChange={(event) => setShowBeatMarkers(event.target.checked)} className="accent-primary" /></label><label className="block space-y-1"><span className="text-[10px] text-muted-foreground">Intensidade do Beat Sync</span><select value={beatSyncStrength} onChange={(event) => setBeatSyncStrength(event.target.value as BeatSyncStrength)} className="h-8 w-full rounded-lg border bg-background px-2 text-[11px]"><option value="light">Leve · ajustes discretos</option><option value="balanced">Equilibrado · recomendado</option><option value="aggressive">Agressivo · ritmo forte</option></select></label><label className="flex items-center justify-between gap-3 rounded-lg border bg-background px-2.5 py-2 text-[10px]"><span>Acentuar transições e elementos nos downbeats</span><input type="checkbox" checked={syncVisualAccents} onChange={(event) => setSyncVisualAccents(event.target.checked)} className="accent-primary" /></label><div className="space-y-2 rounded-lg border bg-background p-2.5"><div className="flex items-center justify-between gap-2"><div><p className="text-[10px] font-semibold">Marcadores manuais</p><p className="text-[9px] text-muted-foreground">Fixe momentos importantes que o Beat Sync deve considerar.</p></div><button type="button" onClick={addManualBeatMarker} className="rounded-md border px-2 py-1 text-[9px] font-medium">+ No cursor</button></div>{manualBeatMarkers.length > 0 && <div className="flex flex-wrap gap-1">{manualBeatMarkers.map((marker) => <button key={marker} type="button" onClick={() => setManualBeatMarkers((current) => current.filter((time) => time !== marker))} className="rounded-full border px-1.5 py-0.5 text-[9px] tabular-nums" title="Remover marcador">{timeLabel(marker)} ×</button>)}<button type="button" onClick={() => setManualBeatMarkers([])} className="rounded-full px-1.5 py-0.5 text-[9px] text-muted-foreground underline">limpar</button></div>}</div><div className="rounded-lg border bg-background p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold">Prévia antes de aplicar</span><span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300">{beatCutPreview.length} corte{beatCutPreview.length === 1 ? "" : "s"}</span></div>{beatCutPreview.length > 0 ? <div className="mt-2 space-y-1">{beatCutPreview.slice(0, 5).map((item) => <div key={`${item.clipId}-${item.target}`} className="flex items-center justify-between gap-2 text-[9px]"><span className="truncate">Corte {item.index + 1} → {item.index + 2}{item.manual ? " · manual" : item.downbeat ? " · downbeat" : ""}</span><span className="shrink-0 tabular-nums text-muted-foreground">{item.delta >= 0 ? "+" : ""}{Math.round(item.delta * 1000)} ms</span></div>)}{beatCutPreview.length > 5 && <p className="text-[9px] text-muted-foreground">+ {beatCutPreview.length - 5} ajustes adicionais</p>}</div> : <p className="mt-1 text-[9px] text-muted-foreground">Nenhum corte será movido com a configuração atual. Clipes bloqueados são ignorados.</p>}</div><button type="button" onClick={syncCutsToBeats} disabled={clips.length < 2 || beatCutPreview.length === 0} className="w-full rounded-lg bg-amber-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40"><Scissors className="mr-1.5 inline h-3.5 w-3.5" />Aplicar Beat Sync{beatCutPreview.length ? ` · ${beatCutPreview.length}` : ""}</button><p className="text-[9px] leading-relaxed text-muted-foreground">Ajuste seguro: cada corte move no máximo 0,42s e continua editável com Desfazer/Refazer.</p></>}</div>}<div className="space-y-3 rounded-xl border bg-muted/15 p-3"><div><p className="text-xs font-semibold">Mixer inteligente</p><p className="text-[10px] text-muted-foreground">Presets ajustam voz, trilha, ducking, fades e loudness juntos.</p></div><div className="grid grid-cols-2 gap-1.5">{AUDIO_MIX_PRESETS.map((preset) => <button key={preset.id} type="button" onClick={() => applyAudioMixPreset(preset.id)} title={preset.hint} className="rounded-lg border bg-background px-2 py-1.5 text-[10px] font-medium hover:border-primary/40">{preset.label}</button>)}</div><label className="flex items-center justify-between gap-3 rounded-lg border bg-background px-2.5 py-2 text-[10px]"><span><strong className="block text-foreground">Ducking automático</strong><span className="text-muted-foreground">Baixa a música quando o áudio original entra.</span></span><input type="checkbox" checked={duckingEnabled} onChange={(event) => setDuckingEnabled(event.target.checked)} className="accent-primary" /></label>{duckingEnabled && <div className="space-y-2"><RangeField label="Redução da música" value={duckingReduction} min={0} max={90} step={1} suffix="%" onChange={setDuckingReduction} /><RangeField label="Sensibilidade à voz/áudio" value={duckingThresholdPct} min={1} max={20} step={1} suffix="%" onChange={setDuckingThresholdPct} /><div className="grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-[10px] text-muted-foreground">Ataque (ms)</span><input type="number" min={20} max={600} step={10} value={duckingAttackMs} onChange={(event) => setDuckingAttackMs(clamp(Number(event.target.value), 20, 600))} className="h-8 w-full rounded-lg border bg-background px-2 text-[11px]" /></label><label className="space-y-1"><span className="text-[10px] text-muted-foreground">Retorno (ms)</span><input type="number" min={80} max={1800} step={20} value={duckingReleaseMs} onChange={(event) => setDuckingReleaseMs(clamp(Number(event.target.value), 80, 1800))} className="h-8 w-full rounded-lg border bg-background px-2 text-[11px]" /></label></div></div>}<div className="grid grid-cols-2 gap-2"><RangeField label="Fade-in" value={musicFadeIn} min={0} max={5} step={0.1} suffix="s" onChange={setMusicFadeIn} /><RangeField label="Fade-out" value={musicFadeOut} min={0} max={8} step={0.1} suffix="s" onChange={setMusicFadeOut} /></div><label className="flex items-center justify-between gap-3 rounded-lg border bg-background px-2.5 py-2 text-[10px]"><span>Loop inteligente sem emenda</span><input type="checkbox" checked={smartMusicLoop} onChange={(event) => setSmartMusicLoop(event.target.checked)} className="accent-primary" /></label><div className="space-y-2"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-medium">Automação de volume</span><button type="button" onClick={addMusicVolumePoint} className="rounded-lg border bg-background px-2 py-1 text-[9px]">+ Ponto no playhead</button></div>{musicVolumePoints.length > 0 ? <div className="flex flex-wrap gap-1">{musicVolumePoints.map((point) => <button key={point.id} type="button" onClick={() => setMusicVolumePoints((current) => current.filter((item) => item.id !== point.id))} title="Remover ponto" className="rounded-full border bg-background px-2 py-1 text-[9px] tabular-nums">{timeLabel(point.time)} · {Math.round(point.value * 100)}% ×</button>)}</div> : <p className="text-[9px] text-muted-foreground">Adicione pontos para aumentar ou reduzir a trilha ao longo do vídeo.</p>}</div><label className="block space-y-1"><span className="text-[10px] text-muted-foreground">Loudness final (LUFS)</span><select value={loudnessTarget} onChange={(event) => { setLoudnessTarget(Number(event.target.value)); setNormalizeAudio(true); }} className="h-8 w-full rounded-lg border bg-background px-2 text-[11px]"><option value={-12}>-12 LUFS · anúncio forte</option><option value={-14}>-14 LUFS · social / YouTube</option><option value={-16}>-16 LUFS · voz / institucional</option><option value={-18}>-18 LUFS · conteúdo suave</option></select></label></div><RangeField label="Áudio original" value={originalVolume} min={0} max={1.5} step={0.05} onChange={setOriginalVolume} />{musicMode !== "none" && <><RangeField label="Volume da trilha" value={musicVolume} min={0} max={1} step={0.05} onChange={setMusicVolume} /><div className="grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-xs text-muted-foreground">Início</span><input className="h-9 w-full rounded-lg border bg-background px-2 text-sm" type="number" min={0} max={projectDuration} step={0.1} value={musicStart} onChange={(event) => setMusicStart(clamp(Number(event.target.value), 0, projectDuration))} /></label><label className="space-y-1"><span className="text-xs text-muted-foreground">Fim</span><input className="h-9 w-full rounded-lg border bg-background px-2 text-sm" type="number" min={0.1} max={projectDuration} step={0.1} value={musicEnd} onChange={(event) => setMusicEnd(clamp(Number(event.target.value), 0.1, projectDuration))} /></label></div></>}</div>;
    if (tool === "stickers") return <div className="space-y-4"><div><p className="text-sm font-semibold">Stickers e emojis</p><p className="text-xs text-muted-foreground">Adicione elementos rápidos na timeline e posicione livremente no vídeo.</p></div><div className="grid grid-cols-4 gap-2">{STICKER_PRESETS.map((sticker) => <button key={sticker.label} title={sticker.label} onClick={() => addStickerLayer(sticker)} className="rounded-xl border bg-background p-2 text-center hover:border-primary/40 hover:bg-primary/5"><span className="block text-2xl leading-8">{sticker.glyph}</span><span className="mt-1 block truncate text-[9px] text-muted-foreground">{sticker.label}</span></button>)}</div><div className="rounded-xl border bg-muted/20 p-3 text-[11px] text-muted-foreground">Cada sticker vira uma camada independente: pode ser movido, redimensionado, rotacionado, animado, duplicado e temporizado como qualquer outro elemento.</div></div>;
    if (tool === "captions") return <div className="space-y-4"><div><p className="text-sm font-semibold">Legendas inteligentes</p><p className="text-xs text-muted-foreground">Transcreva a fala para a timeline e destaque cada palavra no momento exato.</p></div><div className="space-y-2"><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Estilo automático</p><div className="grid grid-cols-2 gap-2">{Object.entries(AUTO_CAPTION_STYLES).map(([id, style]) => <button key={id} onClick={() => setAutoCaptionStyle(id as CaptionStylePreset)} className={cn("rounded-xl border p-2 text-left", autoCaptionStyle === id ? "border-primary bg-primary/5" : "hover:border-primary/30")}><div className="truncate text-xs font-semibold">{style.label}</div><div className="mt-1 flex gap-1"><span className="h-2 w-5 rounded-sm" style={{ background: style.color }} /><span className="h-2 w-5 rounded-sm" style={{ background: style.activeWordBackground === "transparent" ? style.activeWordColor : style.activeWordBackground }} /></div></button>)}</div></div><button disabled={!clips.length || jobStatus === "processing" || jobStatus === "rendering"} onClick={() => void createEditableAutomaticCaptions()} className="w-full rounded-xl bg-foreground px-3 py-3 text-sm font-semibold text-background disabled:opacity-40"><Captions className="mr-2 inline h-4 w-4" />Transcrever para a timeline</button><div className="rounded-xl border bg-muted/20 p-3"><p className="text-xs font-semibold">Adicionar manualmente</p><div className="mt-2 space-y-2">{CAPTION_TEMPLATES.map((template) => <button key={template.name} onClick={() => addCaptionLayer(template)} className="w-full rounded-lg border bg-background p-2 text-left hover:border-primary/40"><div className="rounded-md px-2 py-1.5 text-[10px] font-bold" style={{ background: template.background, color: template.color, textAlign: template.textAlign }}>{template.text}</div><p className="mt-1.5 text-[10px] font-medium">{template.name}</p></button>)}</div></div><button disabled={!clips.length || jobStatus === "processing" || jobStatus === "rendering"} onClick={() => void applyBurnedAutomaticCaption()} className="w-full rounded-xl border px-3 py-2.5 text-xs font-medium disabled:opacity-40">Gerar versão com legenda fixa</button><p className="text-[11px] text-muted-foreground">A opção principal cria faixas editáveis e mantém o original intacto. A versão fixa continua disponível para compatibilidade.</p></div>;
    if (tool === "settings") return <div className="space-y-4"><div><p className="text-sm font-semibold">Ajustes de saída</p><p className="text-xs text-muted-foreground">Tratamento aplicado depois da composição.</p></div><label className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-medium">Normalizar volume</p><p className="text-xs text-muted-foreground">Equaliza o resultado final</p></div><input type="checkbox" checked={normalizeAudio} onChange={(event) => setNormalizeAudio(event.target.checked)} className="accent-primary" /></label><label className="block space-y-1.5"><span className="text-xs text-muted-foreground">Velocidade final</span><select value={speed} onChange={(event) => setSpeed(event.target.value)} className="h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="1.0">Normal · 1x</option><option value="1.1">Levemente rápido · 1.1x</option><option value="1.25">Rápido · 1.25x</option></select></label><div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground"><p className="font-medium text-foreground">Fluxo não destrutivo</p><p className="mt-1">Cada clipe mantém seu arquivo original; cortes, ordem e sobreposições ficam salvos no projeto.</p></div></div>;
    return <div className="space-y-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Central de Mídias</p><p className="text-xs text-muted-foreground">Adicione quantos clipes precisar.</p></div><button onClick={() => void loadAssets()} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><RefreshCw className={cn("h-4 w-4", assetsLoading && "animate-spin")} /></button></div><div className="grid grid-cols-3 gap-2"><button onClick={() => videoInputRef.current?.click()} className="rounded-xl border border-dashed p-3 text-xs hover:border-primary/40"><Plus className="mx-auto mb-1.5 h-4 w-4" />Clipes</button><button onClick={() => imageInputRef.current?.click()} className="rounded-xl border border-dashed p-3 text-xs hover:border-primary/40"><ImageIcon className="mx-auto mb-1.5 h-4 w-4" />Imagem</button><button onClick={() => { setTool("audio"); setMusicMode("upload"); musicInputRef.current?.click(); }} className="rounded-xl border border-dashed p-3 text-xs hover:border-primary/40"><Music2 className="mx-auto mb-1.5 h-4 w-4" />Áudio</button></div>{mediaVideos.length > 0 && <div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">Vídeos recentes · clique para adicionar</p>{mediaVideos.slice(0, 8).map((asset) => <button key={asset.id} onClick={() => void addLibraryClip(asset)} className="flex w-full items-center gap-2 rounded-lg border p-2 text-left hover:border-primary/30"><Film className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-xs">{assetName(asset)}</span><Plus className="h-3.5 w-3.5 text-muted-foreground" /></button>)}</div>}{mediaImages.length > 0 && <div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">Imagens recentes</p><div className="grid grid-cols-2 gap-2">{mediaImages.slice(0, 8).map((asset) => <button key={asset.id} onClick={() => addLibraryImage(asset)} className="overflow-hidden rounded-xl border text-left hover:border-primary/40"><div className="aspect-video bg-muted"><img src={assetUrl(asset)} alt="" className="h-full w-full object-cover" /></div><p className="truncate p-1.5 text-[10px]">{assetName(asset)}</p></button>)}</div></div>}</div>;
  })();

  const trackRows: Array<{ id: string; label: string; icon: typeof Film; items: EditorLayer[] }> = [
    { id: "text", label: "Texto", icon: Type, items: layers.filter((layer) => layer.type === "text" && layer.contentKind !== "caption" && layer.contentKind !== "sticker") },
    { id: "caption", label: "Legendas", icon: Captions, items: layers.filter((layer) => layer.contentKind === "caption") },
    { id: "sticker", label: "Stickers", icon: WandSparkles, items: layers.filter((layer) => layer.contentKind === "sticker") },
    { id: "card", label: "Cards", icon: Square, items: layers.filter((layer) => layer.type === "card") },
    { id: "image", label: "Imagens", icon: ImageIcon, items: layers.filter((layer) => layer.type === "image") },
  ];

  const renderPreviewLayer = (layer: EditorLayer) => {
    const resolvedLayer = resolveAnimatedLayerAtTime(layer, timelineTime);
    const style: CSSProperties = { position: "absolute", left: `${resolvedLayer.x}%`, top: `${resolvedLayer.y}%`, width: `${resolvedLayer.width}%`, opacity: resolvedLayer.opacity, transform: `rotate(${resolvedLayer.rotation ?? 0}deg) scale(${resolvedLayer.scale ?? 1})`, transformOrigin: "top left" };
    const selected = selectedLayerId === layer.id;
    const synchronized = layer.contentKind === "caption" && Boolean(layer.captionWords?.length);
    return <div key={layer.id} style={style} className={cn("group touch-none select-none", selected && "z-20")} onPointerDown={(event) => startStageGesture(event, layer, "move")}>{layer.type === "image" ? <img src={layer.url} alt="" draggable={false} className={cn("block h-auto max-h-[85%] w-full object-contain", selected && "outline outline-2 outline-primary")} /> : <div style={{ color: layer.color, background: layer.type === "card" || layer.contentKind === "caption" ? layer.background : "transparent", fontSize: `${Math.max(11, layer.fontSize * 0.38)}px`, whiteSpace: "normal", textAlign: layer.textAlign ?? "left" }} className={cn("rounded-lg p-2 font-bold leading-tight", selected && "outline outline-2 outline-primary")}>{synchronized ? layer.captionWords!.map((word, index) => { const motion = captionWordMotionState(word, timelineTime, layer.captionMotion ?? "word-pop"); const active = motion.active; return <span key={`${word.start}-${index}`} className="inline-block rounded px-0.5" style={{ color: active ? (layer.activeWordColor || layer.color) : layer.color, background: active && layer.activeWordBackground !== "transparent" ? (layer.activeWordBackground || "transparent") : "transparent", transform: `translateY(${motion.translateY * 10}px) scale(${motion.scale})`, transformOrigin: "center", transition: "transform 70ms linear", textDecoration: active && layer.captionMotion === "karaoke" ? "underline" : "none", textDecorationThickness: active && layer.captionMotion === "karaoke" ? "3px" : undefined }}>{word.word}{index < layer.captionWords!.length - 1 ? " " : ""}</span>; }) : layer.text}</div>}{selected && <button type="button" aria-label="Redimensionar camada" onPointerDown={(event) => startStageGesture(event, layer, "resize")} className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-background bg-primary shadow" />}</div>;
  };

  const renderTimelineLayer = (layer: EditorLayer) => <div key={layer.id} onPointerDown={(event) => startLayerTimelineGesture(event, layer, "move")} className={cn("absolute inset-y-1 touch-none select-none overflow-hidden rounded px-2 text-left text-[10px] leading-6 text-white", layer.type === "text" ? "bg-blue-500/80" : layer.type === "card" ? "bg-violet-500/80" : "bg-emerald-500/80", selectedLayerId === layer.id && "ring-2 ring-primary ring-offset-1")} style={{ left: `${clamp(layer.start / projectDuration * 100, 0, 100)}%`, width: `${Math.max(1, clamp((layer.end - layer.start) / projectDuration * 100, 0, 100))}%` }}><button type="button" aria-label="Ajustar início" onPointerDown={(event) => startLayerTimelineGesture(event, layer, "trim-start")} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-black/20 hover:bg-black/35" /><span className="pointer-events-none block truncate px-1">{layer.name}</span><button type="button" aria-label="Ajustar fim" onPointerDown={(event) => startLayerTimelineGesture(event, layer, "trim-end")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/20 hover:bg-black/35" /></div>;

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-background text-foreground">
      <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={(event) => { Array.from(event.target.files ?? []).slice(0, 12).forEach((file) => { void addUploadedClip(file); }); event.target.value = ""; }} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { Array.from(event.target.files ?? []).slice(0, 8).forEach((file) => { void addImageFile(file); }); event.target.value = ""; }} />
      <input ref={musicInputRef} type="file" accept="audio/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setMusicFile(file); setMusicMode("upload"); void (async () => { const stored = await uploadAsset(file, "audio", "music"); if (stored?.id) setMusicAssetId(stored.id); })(); event.target.value = ""; }} />

      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="flex min-h-16 flex-wrap items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4 lg:px-6">
          <button onClick={() => navigate("/content-studio/video")} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></button>
          <div className="min-w-0 flex-[1_1_220px]"><input value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} className="w-full max-w-md bg-transparent text-sm font-semibold outline-none sm:text-base" /><p className="text-[11px] text-muted-foreground">Editor universal · {clips.length} clipe{clips.length === 1 ? "" : "s"} · {timeLabel(realProjectDuration)} · {lastSavedAt ? `salvo às ${lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : projectId ? "autosave ativo" : "novo projeto"}</p></div>
          <div className="hidden items-center gap-1 rounded-lg border bg-muted/30 p-1 xl:flex">{CHANNELS.map((item) => <button key={item.id} onClick={() => selectChannel(item.id)} title={item.hint} className={cn("rounded-md px-2 py-1.5 text-[11px] font-medium", channel === item.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{item.label}</button>)}</div>
          <div className="flex items-center rounded-lg border bg-background"><button onClick={undo} disabled={!canUndo} className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Desfazer · Ctrl/Cmd+Z"><Undo2 className="h-3.5 w-3.5" /></button><button onClick={redo} disabled={!canRedo} className="border-l p-2 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Refazer · Ctrl/Cmd+Y"><Redo2 className="h-3.5 w-3.5" /></button></div>
          <select value={ratio} onChange={(event) => setRatio(event.target.value as Ratio)} className="h-9 rounded-lg border bg-background px-2 text-xs"><option value="9:16">9:16</option><option value="4:5">4:5</option><option value="1:1">1:1</option><option value="16:9">16:9</option></select>
          <select value={quality} onChange={(event) => setQuality(event.target.value as Quality)} className="h-9 rounded-lg border bg-background px-2 text-xs"><option value="720p">720p</option><option value="1080p">1080p</option></select>
          <button onClick={() => void saveProject(false)} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}<span className="hidden sm:inline">Salvar</span></button>
          <button onClick={() => void renderTimeline()} disabled={!clips.length || jobStatus === "rendering" || jobStatus === "processing"} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-40"><WandSparkles className="h-4 w-4" /><span className="hidden sm:inline">Exportar MP4</span><span className="sm:hidden">Exportar</span></button>
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-1 xl:min-h-[660px] xl:grid-cols-[76px_270px_minmax(420px,1fr)_280px]">
        <nav className="flex gap-1 overflow-x-auto border-b bg-card p-2 xl:flex-col xl:border-b-0 xl:border-r">{TOOL_ITEMS.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setTool(item.id)} className={cn("flex min-w-[66px] flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium", tool === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="h-4 w-4" />{item.label}</button>; })}</nav>
        <aside className="max-h-[46vh] overflow-y-auto border-b bg-card p-3 sm:max-h-[520px] sm:p-4 xl:max-h-[660px] xl:border-b-0 xl:border-r">{ToolContent}</aside>
        <main className="flex min-w-0 flex-col bg-muted/20">
          <div className="flex flex-1 items-center justify-center p-2 sm:p-4 lg:p-6">
            <div ref={previewStageRef} className="relative flex max-h-[540px] w-full max-w-3xl items-center justify-center overflow-hidden rounded-2xl bg-black shadow-xl" style={{ aspectRatio: ratioCss }}>
              {activeClip ? <>{crossfadePreview && <video ref={previewOverlapRef} src={crossfadePreview.previous.url} className="absolute inset-0 h-full w-full object-contain will-change-transform" style={(() => { const visual = clipVisualState(crossfadePreview.previousIndex, timelineTime, clips); return { opacity: visual.opacity, transform: `translate(${visual.translateX * 100}%, ${visual.translateY * 100}%) scale(${visual.scale})` }; })()} muted playsInline />}
              <video ref={previewRef} src={activeClip.url} className="relative z-10 h-full w-full object-contain will-change-transform" style={(() => { const index = clips.findIndex((clip) => clip.id === activeClip.id); const visual = clipVisualState(Math.max(0, index), timelineTime, clips); return { opacity: visual.opacity, transform: `translate(${visual.translateX * 100}%, ${visual.translateY * 100}%) scale(${visual.scale})` }; })()} playsInline onLoadedMetadata={onPreviewLoadedMetadata} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={onPreviewTimeUpdate} /><div className="absolute inset-0">{layers.filter((layer) => layerIsVisible(layer, timelineTime)).map(renderPreviewLayer)}</div><div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3 py-2 text-white backdrop-blur"><button onClick={togglePlayback}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button><span className="text-[11px] tabular-nums">{timeLabel(timelineTime)} / {timeLabel(realProjectDuration)}</span></div></> : <button onClick={() => videoInputRef.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/70 hover:text-white"><div className="rounded-2xl bg-white/10 p-4"><Upload className="h-7 w-7" /></div><div className="text-center"><p className="font-semibold">Adicione o primeiro clipe</p><p className="mt-1 text-xs text-white/50">Depois você pode adicionar, cortar, dividir e reorganizar outros vídeos.</p></div></button>}
            </div>
          </div>
          {(jobStatus !== "idle" || resultUrl) && <div className="border-t bg-background px-4 py-3"><div className={cn("flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 text-sm", jobStatus === "error" ? "border-destructive/30 bg-destructive/5" : jobStatus === "done" ? "border-emerald-500/30 bg-emerald-500/5" : "bg-muted/30")}>{jobStatus === "rendering" || jobStatus === "processing" ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : jobStatus === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-destructive" />}<span className="min-w-0 flex-1 text-xs">{jobMessage}</span>{resultUrl && <><a href={resultUrl} target="_blank" rel="noreferrer" className="rounded-lg border bg-background px-3 py-1.5 text-xs font-medium">Abrir resultado</a><button onClick={() => void applyBurnedAutomaticCaption()} className="rounded-lg border bg-background px-3 py-1.5 text-xs font-medium"><Captions className="mr-1 inline h-3.5 w-3.5" />Legendar</button></>}</div></div>}
        </main>
        <aside className="max-h-[46vh] overflow-y-auto border-t bg-card p-3 sm:max-h-[520px] sm:p-4 xl:max-h-[660px] xl:border-l xl:border-t-0">{PropertiesPanel}</aside>
      </div>

      <section className="border-t bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2"><div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-muted-foreground" /><span className="text-xs font-semibold">Timeline</span><span className="text-[10px] text-muted-foreground">{clips.length} clipe{clips.length === 1 ? "" : "s"} · {layers.length} camada{layers.length === 1 ? "" : "s"} · {sfxCues.length} SFX</span></div><div className="flex items-center gap-2"><button onClick={splitAtPlayhead} disabled={!canSplit} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium disabled:opacity-30"><Scissors className="h-3.5 w-3.5" />Dividir no cursor</button><button onClick={() => videoInputRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium"><Plus className="h-3.5 w-3.5" />Adicionar clipe</button></div></div>
        <div className="overflow-x-auto p-2 sm:p-3"><div className="min-w-[720px] sm:min-w-[900px]"><div className="mb-1 ml-28 grid grid-cols-5 text-[9px] text-muted-foreground">{[0, .25, .5, .75, 1].map((point) => <span key={point}>{timeLabel(realProjectDuration * point)}</span>)}</div><div className="space-y-1.5">
          <div className="flex h-12 items-center"><div className="flex w-28 shrink-0 items-center gap-2 px-2 text-[11px] font-medium"><Film className="h-3.5 w-3.5" />Vídeo</div><div className="relative h-10 flex-1 rounded-md bg-muted" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); seekTimeline((event.clientX - rect.left) / rect.width * realProjectDuration); }}>{showBeatMarkers && manualBeatMarkers.map((marker) => <span key={`video-manual-${marker}`} className="pointer-events-none absolute inset-y-0 z-10 w-[2px] border-l border-dashed border-cyan-400" style={{ left: `${clamp(marker / projectDuration * 100, 0, 100)}%` }} />)}{showBeatMarkers && activeBeatAnalysis && beatTimes.map((beat, index) => <span key={`video-beat-${beat.toFixed(3)}-${index}`} className={cn("pointer-events-none absolute inset-y-0 z-10 bg-amber-400/55", downbeatTimes.some((time) => Math.abs(time - beat) < 0.025) ? "w-[2px] opacity-100" : "w-px opacity-70")} style={{ left: `${clamp(beat / projectDuration * 100, 0, 100)}%` }} />)}{clips.map((clip, index) => { const start = clipStartAt(index, clips); const width = clipDuration(clip) / projectDuration * 100; return <div key={clip.id} draggable onDragStart={() => { draggedClipIdRef.current = clip.id; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); reorderClip(draggedClipIdRef.current, clip.id); draggedClipIdRef.current = ""; }} onClick={(event) => { event.stopPropagation(); selectClip(clip.id); seekTimeline(start); }} className={cn("absolute inset-y-1 cursor-grab select-none overflow-hidden rounded bg-slate-700/85 px-2 text-[10px] leading-8 text-white active:cursor-grabbing", selectedClipId === clip.id && "ring-2 ring-primary ring-offset-1")} style={{ left: `${start / projectDuration * 100}%`, width: `${Math.max(1.2, width)}%` }}><button type="button" aria-label="Cortar início do clipe" onPointerDown={(event) => startClipTrimGesture(event, clip, "trim-in")} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-black/20 hover:bg-black/40" /><span className="pointer-events-none flex items-center gap-1 truncate px-1"><GripVertical className="h-3 w-3 shrink-0" />{index + 1}. {clip.name}{clip.beatLocked ? " · 🔒" : ""}{(clip.transitionOut ?? "cut") !== "cut" ? ` · ${transitionLabel(clip.transitionOut)}` : ""}</span>{(clip.transitionOut ?? "cut") !== "cut" && <span className="pointer-events-none absolute right-1 top-1 rounded bg-white/15 px-1 text-[8px] leading-4">↗</span>}<button type="button" aria-label="Cortar fim do clipe" onPointerDown={(event) => startClipTrimGesture(event, clip, "trim-out")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/20 hover:bg-black/40" /></div>; })}<div className="pointer-events-none absolute inset-y-0 z-20 w-px bg-primary" style={{ left: `${realProjectDuration > 0 ? timelineTime / projectDuration * 100 : 0}%` }} /></div></div>
          {trackRows.map((row) => { const Icon = row.icon; return <div key={row.id} className="flex min-h-10 items-center"><div className="flex w-28 shrink-0 items-center gap-2 px-2 text-[11px] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{row.label}</div><div className="relative h-8 flex-1 rounded-md bg-muted/70" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); seekTimeline((event.clientX - rect.left) / rect.width * realProjectDuration); }}>{row.items.map(renderTimelineLayer)}<div className="pointer-events-none absolute inset-y-0 w-px bg-primary" style={{ left: `${realProjectDuration > 0 ? timelineTime / projectDuration * 100 : 0}%` }} /></div></div>; })}
          <div className="flex h-10 items-center"><div className="flex w-28 shrink-0 items-center gap-2 px-2 text-[11px] text-muted-foreground"><WandSparkles className="h-3.5 w-3.5" />SFX</div><div className="relative h-8 flex-1 rounded-md bg-cyan-500/10" onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); seekTimeline((event.clientX - rect.left) / rect.width * realProjectDuration); }}>{sfxCues.map((cue) => <button key={cue.id} type="button" onClick={(event) => { event.stopPropagation(); seekTimeline(cue.start); setTool("audio"); }} className="absolute inset-y-1 overflow-hidden rounded bg-cyan-600/80 px-1 text-[9px] leading-6 text-white" style={{ left: `${clamp(cue.start / projectDuration * 100, 0, 100)}%`, width: `${Math.max(0.8, clamp(cue.duration / projectDuration * 100, 0, 100))}%` }} title={`${cue.name} · ${Math.round(cue.volume * 100)}%`}>{cue.category}</button>)}<div className="pointer-events-none absolute inset-y-0 w-px bg-primary" style={{ left: `${realProjectDuration > 0 ? timelineTime / projectDuration * 100 : 0}%` }} /></div></div>
          <div className="flex h-10 items-center"><div className="flex w-28 shrink-0 items-center gap-2 px-2 text-[11px] text-muted-foreground"><Volume2 className="h-3.5 w-3.5" />Áudio</div><div className="relative h-8 flex-1 rounded-md bg-muted/70">{showBeatMarkers && manualBeatMarkers.map((marker) => <span key={`audio-manual-${marker}`} className="pointer-events-none absolute inset-y-0 z-10 w-[2px] border-l border-dashed border-cyan-300" style={{ left: `${clamp(marker / projectDuration * 100, 0, 100)}%` }} />)}{showBeatMarkers && activeBeatAnalysis && beatTimes.map((beat, index) => <span key={`audio-beat-${beat.toFixed(3)}-${index}`} className={cn("pointer-events-none absolute inset-y-0 z-10 bg-amber-200/80", downbeatTimes.some((time) => Math.abs(time - beat) < 0.025) ? "w-[2px] opacity-100" : "w-px opacity-70")} style={{ left: `${clamp(beat / projectDuration * 100, 0, 100)}%` }} />)}{musicMode !== "none" && <div className="absolute inset-y-1 rounded bg-amber-500/80 px-2 text-[10px] leading-6 text-white" style={{ left: `${clamp(musicStart / projectDuration * 100, 0, 100)}%`, width: `${Math.max(1, clamp((musicEnd - musicStart) / projectDuration * 100, 0, 100))}%` }}>{musicMode === "upload" ? (musicFile?.name ?? (selectedTrack ? assetName(selectedTrack) : "Áudio")) : selectedTrack ? assetName(selectedTrack) : musicMode === "brand" ? "Brand Kit" : "Trilha"}</div>}<div className="pointer-events-none absolute inset-y-0 w-px bg-primary" style={{ left: `${realProjectDuration > 0 ? timelineTime / projectDuration * 100 : 0}%` }} /></div></div>
        </div><div className="mt-3 flex items-center justify-between border-t pt-3 text-[10px] text-muted-foreground"><span>Arraste os clipes para reordenar · puxe as bordas para cortar · selecione e use “Dividir no cursor”.{activeBeatAnalysis ? ` · Beat Sync ${activeBeatAnalysis.bpm.toFixed(1)} BPM` : ""}</span><span className="tabular-nums">Cursor {timeLabel(timelineTime)} / {timeLabel(realProjectDuration)}</span></div></div></div>
      </section>
    </div>
  );
}
