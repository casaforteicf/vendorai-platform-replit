import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Captions,
  Clapperboard,
  Eye,
  Image as ImageIcon,
  Library,
  Loader2,
  Music2,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const NONE_VALUE = "__none__";

type UploadSlot = "logo" | "intro" | "outro" | "music";
type LibraryMediaType = "image" | "video" | "audio" | "document";

interface MediaAssetOption {
  id: string;
  type: "image" | "video";
  role: string | null;
  source: string | null;
  title: string;
  originalFilename: string | null;
  createdAt: string | null;
}

interface LibraryAsset {
  id: string;
  type: LibraryMediaType;
  role?: string | null;
  storageUrl: string;
  mimeType?: string | null;
  originalFilename?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
}

interface MusicTrackOption {
  id: string;
  original_filename?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface BrandKitRow {
  id?: string;
  name?: string | null;
  logo_asset_id?: string | null;
  intro_asset_id?: string | null;
  outro_asset_id?: string | null;
  default_music_asset_id?: string | null;
  caption_preset?: string | null;
  visual_config?: Record<string, unknown> | null;
  audio_config?: Record<string, unknown> | null;
  broll_config?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

type BrandStudioMode = "maintain" | "evolve" | "rebuild";

interface BrandStudioProposal {
  mode: BrandStudioMode;
  diagnosis: string;
  rationale: string;
  brandName: string;
  slogan: string;
  tagline: string;
  positioning: string;
  valueProposition: string;
  audiences: string[];
  toneOfVoice: string[];
  keyMessages: string[];
  wordsToUse: string[];
  wordsToAvoid: string[];
  palette: Array<{ name: string; hex: string; use: string }>;
  typography: { headline: string; body: string; notes: string };
  visualStyle: string;
  photographyStyle: string;
  videoStyle: string;
  logoDirection: {
    action: "keep" | "refine" | "redesign";
    concept: string;
    construction: string;
    symbolIdea: string;
    wordmarkNotes: string;
    restrictions: string[];
  };
  applications: string[];
  doList: string[];
  dontList: string[];
}

interface BrandKitForm {
  logoAssetId: string | null;
  introAssetId: string | null;
  outroAssetId: string | null;
  defaultMusicAssetId: string | null;
  captionPreset: string;
  brollEnabled: boolean;
  maxInsertions: number;
  preferOwnMedia: boolean;
  durationSeconds: number;
}

const DEFAULT_FORM: BrandKitForm = {
  logoAssetId: null,
  introAssetId: null,
  outroAssetId: null,
  defaultMusicAssetId: null,
  captionPreset: "reels_bold",
  brollEnabled: true,
  maxInsertions: 4,
  preferOwnMedia: true,
  durationSeconds: 2.6,
};

const UPLOAD_CONFIG: Record<UploadSlot, { accept: string; type: LibraryMediaType; label: string }> = {
  logo: { accept: "image/*", type: "image", label: "logo" },
  intro: { accept: "video/*", type: "video", label: "intro" },
  outro: { accept: "video/*", type: "video", label: "outro" },
  music: { accept: "audio/*", type: "audio", label: "trilha" },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function selectValue(value: string | null): string {
  return value ?? NONE_VALUE;
}

function fromSelectValue(value: string): string | null {
  return value === NONE_VALUE ? null : value;
}

function trackTitle(track: MusicTrackOption): string {
  const metadata = asRecord(track.metadata);
  const title = typeof metadata["title"] === "string" ? metadata["title"].trim() : "";
  return title || track.original_filename || "Trilha sem nome";
}

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function mediaUrl(storageUrl: string): string {
  return storageUrl.startsWith("/objects/") ? `/api/storage${storageUrl}` : storageUrl;
}

function inferMediaType(file: File): LibraryMediaType | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

function defaultMusicRights() {
  return {
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
  };
}

function captionPreviewClass(preset: string): string {
  if (preset === "clean") return "bg-black/60 text-white px-3 py-1.5 rounded-md font-medium";
  if (preset === "highlight") return "bg-amber-300 text-black px-3 py-1.5 rounded-md font-bold";
  if (preset === "minimal") return "text-white font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]";
  return "bg-white text-black px-3 py-1.5 rounded-md font-black uppercase tracking-tight";
}

function assetLabel(asset: LibraryAsset | null, fallback: string): string {
  return asset?.originalFilename?.trim() || fallback;
}

export default function BrandVideoKitPanel() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const tenantId = user?.tenantId;
  const [brandKit, setBrandKit] = useState<BrandKitRow | null>(null);
  const [assets, setAssets] = useState<MediaAssetOption[]>([]);
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>([]);
  const [tracks, setTracks] = useState<MusicTrackOption[]>([]);
  const [form, setForm] = useState<BrandKitForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<UploadSlot | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSignature, setPreviewSignature] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [brandStudioMode, setBrandStudioMode] = useState<BrandStudioMode>("evolve");
  const [brandProposal, setBrandProposal] = useState<BrandStudioProposal | null>(null);
  const [brandStudioLoading, setBrandStudioLoading] = useState(false);
  const [brandStudioApproving, setBrandStudioApproving] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const introInputRef = useRef<HTMLInputElement>(null);
  const outroInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  const images = useMemo(() => assets.filter((asset) => asset.type === "image"), [assets]);
  const videos = useMemo(() => assets.filter((asset) => asset.type === "video"), [assets]);
  const formSignature = useMemo(() => JSON.stringify(form), [form]);
  const previewIsCurrent = previewSignature === formSignature;

  const selectedLogo = useMemo(
    () => libraryAssets.find((asset) => asset.id === form.logoAssetId) ?? null,
    [libraryAssets, form.logoAssetId],
  );
  const selectedIntro = useMemo(
    () => libraryAssets.find((asset) => asset.id === form.introAssetId) ?? null,
    [libraryAssets, form.introAssetId],
  );
  const selectedOutro = useMemo(
    () => libraryAssets.find((asset) => asset.id === form.outroAssetId) ?? null,
    [libraryAssets, form.outroAssetId],
  );
  const selectedMusic = useMemo(
    () => libraryAssets.find((asset) => asset.id === form.defaultMusicAssetId) ?? null,
    [libraryAssets, form.defaultMusicAssetId],
  );

  async function loadSelectableMedia() {
    if (!tenantId) return null;
    const [tracksResponse, assetsResponse, libraryResponse] = await Promise.all([
      fetch(`/api/tenants/${tenantId}/media/tracks?limit=150`, { credentials: "include", headers: authHeaders() }),
      fetch(`/api/tenants/${tenantId}/media-engine/brand-kit/assets?limit=150`, { credentials: "include", headers: authHeaders() }),
      fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, { credentials: "include", headers: authHeaders() }),
    ]);

    if (!tracksResponse.ok || !assetsResponse.ok || !libraryResponse.ok) {
      throw new Error("Não foi possível atualizar as mídias do Brand Video Kit");
    }

    const [tracksPayload, assetsPayload, libraryPayload] = await Promise.all([
      tracksResponse.json(),
      assetsResponse.json(),
      libraryResponse.json(),
    ]);
    const nextTracks = Array.isArray(tracksPayload?.tracks) ? tracksPayload.tracks as MusicTrackOption[] : [];
    const nextAssets = Array.isArray(assetsPayload?.assets) ? assetsPayload.assets as MediaAssetOption[] : [];
    const nextLibraryAssets = Array.isArray(libraryPayload?.assets) ? libraryPayload.assets as LibraryAsset[] : [];

    setTracks(nextTracks);
    setAssets(nextAssets);
    setLibraryAssets(nextLibraryAssets);
    return { tracks: nextTracks, assets: nextAssets, libraryAssets: nextLibraryAssets };
  }

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMessage(null);

    void Promise.all([
      fetch(`/api/tenants/${tenantId}/media-engine/brand-kit`, { credentials: "include", headers: authHeaders() }),
      fetch(`/api/tenants/${tenantId}/media/tracks?limit=150`, { credentials: "include", headers: authHeaders() }),
      fetch(`/api/tenants/${tenantId}/media-engine/brand-kit/assets?limit=150`, { credentials: "include", headers: authHeaders() }),
      fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, { credentials: "include", headers: authHeaders() }),
    ])
      .then(async ([kitResponse, tracksResponse, assetsResponse, libraryResponse]) => {
        if (!kitResponse.ok || !tracksResponse.ok || !assetsResponse.ok || !libraryResponse.ok) {
          throw new Error("Não foi possível carregar o Brand Video Kit");
        }
        const [kitPayload, tracksPayload, assetsPayload, libraryPayload] = await Promise.all([
          kitResponse.json(),
          tracksResponse.json(),
          assetsResponse.json(),
          libraryResponse.json(),
        ]);
        if (cancelled) return;

        const kit = (kitPayload?.brandKit ?? null) as BrandKitRow | null;
        const broll = asRecord(kit?.broll_config);
        setBrandKit(kit);
        setTracks(Array.isArray(tracksPayload?.tracks) ? tracksPayload.tracks : []);
        setAssets(Array.isArray(assetsPayload?.assets) ? assetsPayload.assets : []);
        setLibraryAssets(Array.isArray(libraryPayload?.assets) ? libraryPayload.assets : []);
        setForm({
          logoAssetId: kit?.logo_asset_id ?? null,
          introAssetId: kit?.intro_asset_id ?? null,
          outroAssetId: kit?.outro_asset_id ?? null,
          defaultMusicAssetId: kit?.default_music_asset_id ?? null,
          captionPreset: kit?.caption_preset || "reels_bold",
          brollEnabled: asBoolean(broll["enabled"], true),
          maxInsertions: Math.round(asNumber(broll["maxInsertions"], 4)),
          preferOwnMedia: asBoolean(broll["preferOwnMedia"], true),
          durationSeconds: asNumber(broll["durationSeconds"], 2.6),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Falha ao carregar o Brand Video Kit",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  function openUpload(slot: UploadSlot) {
    if (slot === "logo") logoInputRef.current?.click();
    if (slot === "intro") introInputRef.current?.click();
    if (slot === "outro") outroInputRef.current?.click();
    if (slot === "music") musicInputRef.current?.click();
  }

  async function uploadForSlot(slot: UploadSlot, file: File | null) {
    if (!tenantId || !file || uploadingSlot) return;
    const config = UPLOAD_CONFIG[slot];
    const detectedType = inferMediaType(file);
    if (detectedType !== config.type) {
      setMessage({ type: "error", text: `Selecione um arquivo de ${config.label} compatível com este campo.` });
      return;
    }

    setUploadingSlot(slot);
    setMessage(null);
    try {
      const requestResponse = await fetch(`/api/tenants/${tenantId}/media/assets/request-upload`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify({
          name: file.name,
          contentType: file.type || "application/octet-stream",
          type: detectedType,
          size: file.size,
        }),
      });
      const requestPayload = await requestResponse.json().catch(() => ({}));
      if (!requestResponse.ok) throw new Error(requestPayload?.error || `Falha ao preparar ${file.name}`);

      const uploadResponse = await fetch(requestPayload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error(`Falha ao enviar ${file.name}`);

      const registerResponse = await fetch(`/api/tenants/${tenantId}/media/assets`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify({
          type: detectedType,
          role: detectedType === "audio" ? "music" : "source",
          source: "upload",
          storageUrl: requestPayload.objectPath,
          originalFilename: file.name,
          mimeType: file.type || null,
          fileSize: file.size,
          metadata: {
            uploadedFrom: "brand_video_kit",
            uploadedAt: new Date().toISOString(),
            ...(detectedType === "audio"
              ? { audioKind: "music", rights: defaultMusicRights() }
              : {}),
          },
        }),
      });
      const registerPayload = await registerResponse.json().catch(() => ({}));
      if (!registerResponse.ok) throw new Error(registerPayload?.error || `Falha ao registrar ${file.name}`);

      const registered = (registerPayload?.asset ?? registerPayload) as { id?: string };
      const uploadedId = typeof registered?.id === "string" ? registered.id : null;
      const refreshed = await loadSelectableMedia();

      if (slot === "music") {
        const eligible = uploadedId && refreshed?.tracks.some((track) => track.id === uploadedId);
        if (eligible) {
          setForm((current) => ({ ...current, defaultMusicAssetId: uploadedId }));
          setMessage({ type: "success", text: "Trilha enviada para a Biblioteca e selecionada no Brand Kit. Gere a prévia antes de salvar." });
        } else {
          setMessage({
            type: "success",
            text: "Trilha enviada para a Biblioteca. Confirme os direitos de uso em Mídias para ela ficar disponível no Brand Kit.",
          });
        }
      } else if (uploadedId && refreshed?.assets.some((asset) => asset.id === uploadedId)) {
        if (slot === "logo") setForm((current) => ({ ...current, logoAssetId: uploadedId }));
        if (slot === "intro") setForm((current) => ({ ...current, introAssetId: uploadedId }));
        if (slot === "outro") setForm((current) => ({ ...current, outroAssetId: uploadedId }));
        setMessage({ type: "success", text: `${file.name} enviado para a Biblioteca e selecionado. Gere a prévia antes de salvar.` });
      } else {
        setMessage({ type: "success", text: `${file.name} enviado para a Biblioteca. Selecione o arquivo no campo acima.` });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Falha no upload",
      });
    } finally {
      setUploadingSlot(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
      if (introInputRef.current) introInputRef.current.value = "";
      if (outroInputRef.current) outroInputRef.current.value = "";
      if (musicInputRef.current) musicInputRef.current.value = "";
    }
  }

  async function generateBrandProposal() {
    if (!tenantId || brandStudioLoading) return;
    setBrandStudioLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/brand-kit/ai/suggest`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify({ mode: brandStudioMode }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Não foi possível desenvolver o Kit da Marca com IA");
      setBrandProposal(payload?.proposal ?? null);
      setMessage({ type: "success", text: "A IA montou uma proposta usando os dados, conhecimento e referências do tenant. Revise antes de aprovar." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Falha no Brand Studio com IA" });
    } finally {
      setBrandStudioLoading(false);
    }
  }

  async function approveBrandProposal() {
    if (!tenantId || !brandProposal || brandStudioApproving) return;
    setBrandStudioApproving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/brand-kit/ai/approve`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify({ proposal: brandProposal }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Não foi possível aprovar a identidade");
      if (payload?.brandKit) setBrandKit(payload.brandKit);
      setMessage({ type: "success", text: "Identidade aprovada. O Kit da Marca passa a ser a referência oficial para vídeos e demais ferramentas integradas." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Falha ao aprovar a identidade" });
    } finally {
      setBrandStudioApproving(false);
    }
  }

  function generatePreview() {
    setPreviewSignature(formSignature);
    setPreviewOpen(true);
    setMessage({ type: "success", text: "Prévia atualizada. Revise abaixo e, se estiver correta, salve o Brand Kit." });
  }

  async function saveBrandKit() {
    if (!tenantId || saving || !previewIsCurrent) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/brand-kit`, {
        method: "PUT",
        credentials: "include",
        headers: { ...authHeaders(true) },
        body: JSON.stringify({
          name: brandKit?.name || "Kit principal",
          logoAssetId: form.logoAssetId,
          introAssetId: form.introAssetId,
          outroAssetId: form.outroAssetId,
          defaultMusicAssetId: form.defaultMusicAssetId,
          captionPreset: form.captionPreset,
          visualConfig: asRecord(brandKit?.visual_config),
          audioConfig: asRecord(brandKit?.audio_config),
          brollConfig: {
            ...asRecord(brandKit?.broll_config),
            enabled: form.brollEnabled,
            maxInsertions: Math.max(0, Math.min(8, Math.round(form.maxInsertions))),
            preferOwnMedia: form.preferOwnMedia,
            durationSeconds: Math.max(1, Math.min(6, form.durationSeconds)),
          },
          metadata: asRecord(brandKit?.metadata),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Não foi possível salvar o Brand Video Kit");
      }
      setBrandKit(payload?.brandKit ?? brandKit);
      setMessage({ type: "success", text: "Brand Video Kit salvo e pronto para reutilização automática." });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Falha ao salvar o Brand Video Kit",
      });
    } finally {
      setSaving(false);
    }
  }

  const uploadButton = (slot: UploadSlot) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={uploadingSlot !== null}
      onClick={() => openUpload(slot)}
      className="h-8 shrink-0 border-white/15 bg-white/5 px-2.5 text-xs text-gray-200 hover:bg-white/10 hover:text-white"
    >
      {uploadingSlot === slot ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
      Upload
    </Button>
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] overflow-hidden">
      <input ref={logoInputRef} type="file" accept={UPLOAD_CONFIG.logo.accept} className="hidden" onChange={(event) => void uploadForSlot("logo", event.target.files?.[0] ?? null)} />
      <input ref={introInputRef} type="file" accept={UPLOAD_CONFIG.intro.accept} className="hidden" onChange={(event) => void uploadForSlot("intro", event.target.files?.[0] ?? null)} />
      <input ref={outroInputRef} type="file" accept={UPLOAD_CONFIG.outro.accept} className="hidden" onChange={(event) => void uploadForSlot("outro", event.target.files?.[0] ?? null)} />
      <input ref={musicInputRef} type="file" accept={UPLOAD_CONFIG.music.accept} className="hidden" onChange={(event) => void uploadForSlot("music", event.target.files?.[0] ?? null)} />

      <div className="px-5 py-4 border-b border-white/10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-violet-500/15 text-violet-300">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-white">Brand Video Kit</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                {brandKit ? "Ativo" : "Pronto para configurar"}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl">
              Defina uma vez a identidade dos vídeos. O Media Engine reutiliza automaticamente logo, intro, outro, trilha, legendas e B-roll.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate("/content-studio")}
          className="border-white/15 bg-white/5 text-gray-200 hover:bg-white/10 hover:text-white"
        >
          <Library className="h-4 w-4 mr-2" />
          Abrir Biblioteca
        </Button>
      </div>

      {loading ? (
        <div className="px-5 py-8 flex items-center justify-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando configurações...
        </div>
      ) : (
        <div className="p-5 space-y-5">
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] p-4 space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-300" />
                  <h3 className="text-sm font-semibold text-white">Brand Studio com IA</h3>
                </div>
                <p className="mt-1 text-[11px] text-gray-400 max-w-2xl">
                  A IA lê o Conhecimento da Empresa, dados do tenant, Kit atual e Biblioteca para organizar, evoluir ou refazer a identidade. Nada vira oficial sem sua aprovação.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!tenantId || brandStudioLoading || brandStudioApproving}
                onClick={() => void generateBrandProposal()}
                className="bg-violet-600 hover:bg-violet-500 text-white"
              >
                {brandStudioLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Desenvolver com IA
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                ["maintain", "Manter", "Organiza e completa sem mudar a essência."],
                ["evolve", "Evoluir", "Moderniza preservando o reconhecimento."],
                ["rebuild", "Refazer", "Permite nova direção, slogan e redesign de logo."],
              ] as const).map(([mode, title, description]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setBrandStudioMode(mode)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${brandStudioMode === mode ? "border-violet-400/50 bg-violet-500/15" : "border-white/10 bg-black/10 hover:bg-white/5"}`}
                >
                  <span className="block text-xs font-semibold text-white">{title}</span>
                  <span className="mt-1 block text-[10px] leading-relaxed text-gray-500">{description}</span>
                </button>
              ))}
            </div>

            {brandProposal && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">Proposta da IA</p>
                    <h4 className="mt-1 text-base font-bold text-white">{brandProposal.brandName || "Identidade da marca"}</h4>
                    <p className="mt-1 text-xs text-gray-400">{brandProposal.diagnosis}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={brandStudioApproving}
                    onClick={() => void approveBrandProposal()}
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                  >
                    {brandStudioApproving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Aprovar identidade
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">Slogan</p>
                    <p className="mt-1 text-sm font-semibold text-white">{brandProposal.slogan || "—"}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-wide text-gray-500">Tagline</p>
                    <p className="mt-1 text-xs text-gray-300">{brandProposal.tagline || "—"}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">Logo</p>
                    <p className="mt-1 text-xs font-semibold text-white">
                      {brandProposal.logoDirection.action === "redesign" ? "Refazer" : brandProposal.logoDirection.action === "refine" ? "Evoluir" : "Manter"}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-400">{brandProposal.logoDirection.concept || brandProposal.logoDirection.wordmarkNotes || "Sem alteração sugerida."}</p>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Paleta sugerida</p>
                  <div className="flex flex-wrap gap-2">
                    {brandProposal.palette.map((color) => (
                      <div key={`${color.name}-${color.hex}`} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                        <span className="h-5 w-5 rounded-md border border-white/20" style={{ backgroundColor: color.hex }} />
                        <div>
                          <p className="text-[10px] font-medium text-gray-200">{color.name}</p>
                          <p className="text-[9px] text-gray-500">{color.hex}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                  <div>
                    <p className="font-semibold text-gray-300">Posicionamento</p>
                    <p className="mt-1 text-gray-500">{brandProposal.positioning || "—"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-300">Estilo visual</p>
                    <p className="mt-1 text-gray-500">{brandProposal.visualStyle || "—"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-300">Vídeo</p>
                    <p className="mt-1 text-gray-500">{brandProposal.videoStyle || "—"}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-gray-300 flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" /> Logo padrão
              </Label>
              <div className="flex items-center gap-2">
                <Select value={selectValue(form.logoAssetId)} onValueChange={(value) => setForm((current) => ({ ...current, logoAssetId: fromSelectValue(value) }))}>
                  <SelectTrigger className="min-w-0 flex-1 border-white/10 bg-black/20 text-gray-100"><SelectValue placeholder="Sem logo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Sem logo</SelectItem>
                    {images.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                {uploadButton("logo")}
              </div>
              <p className="text-[11px] text-gray-500">Selecione da Biblioteca ou faça upload de uma imagem.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-gray-300 flex items-center gap-1.5"><Clapperboard className="h-3.5 w-3.5" /> Intro padrão</Label>
              <div className="flex items-center gap-2">
                <Select value={selectValue(form.introAssetId)} onValueChange={(value) => setForm((current) => ({ ...current, introAssetId: fromSelectValue(value) }))}>
                  <SelectTrigger className="min-w-0 flex-1 border-white/10 bg-black/20 text-gray-100"><SelectValue placeholder="Sem intro" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Sem intro</SelectItem>
                    {videos.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                {uploadButton("intro")}
              </div>
              <p className="text-[11px] text-gray-500">Selecione um vídeo existente ou envie uma nova abertura.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-gray-300 flex items-center gap-1.5"><Clapperboard className="h-3.5 w-3.5" /> Outro padrão</Label>
              <div className="flex items-center gap-2">
                <Select value={selectValue(form.outroAssetId)} onValueChange={(value) => setForm((current) => ({ ...current, outroAssetId: fromSelectValue(value) }))}>
                  <SelectTrigger className="min-w-0 flex-1 border-white/10 bg-black/20 text-gray-100"><SelectValue placeholder="Sem outro" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Sem outro</SelectItem>
                    {videos.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                {uploadButton("outro")}
              </div>
              <p className="text-[11px] text-gray-500">Selecione um vídeo existente ou envie um novo encerramento.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
            <div className="space-y-2">
              <Label className="text-xs text-gray-300 flex items-center gap-1.5"><Music2 className="h-3.5 w-3.5" /> Trilha padrão</Label>
              <div className="flex items-center gap-2">
                <Select value={selectValue(form.defaultMusicAssetId)} onValueChange={(value) => setForm((current) => ({ ...current, defaultMusicAssetId: fromSelectValue(value) }))}>
                  <SelectTrigger className="min-w-0 flex-1 border-white/10 bg-black/20 text-gray-100"><SelectValue placeholder="Sem trilha padrão" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Sem trilha padrão</SelectItem>
                    {tracks.map((track) => <SelectItem key={track.id} value={track.id}>{trackTitle(track)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {uploadButton("music")}
              </div>
              <p className="text-[11px] text-gray-500">Uploads de áudio ficam na Biblioteca; para uso comercial, os direitos precisam estar confirmados.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-gray-300 flex items-center gap-1.5"><Captions className="h-3.5 w-3.5" /> Estilo de legenda</Label>
              <Select value={form.captionPreset} onValueChange={(value) => setForm((current) => ({ ...current, captionPreset: value }))}>
                <SelectTrigger className="border-white/10 bg-black/20 text-gray-100"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reels_bold">Reels — destaque forte</SelectItem>
                  <SelectItem value="clean">Clean</SelectItem>
                  <SelectItem value="highlight">Palavra destacada</SelectItem>
                  <SelectItem value="minimal">Minimalista</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-500">Usado pela legendagem automática do Media Engine.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">B-roll inteligente</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">A IA escolhe imagens e vídeos marcados como B-roll na Biblioteca conforme o contexto.</p>
              </div>
              <Switch checked={form.brollEnabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, brollEnabled: checked }))} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-gray-300">Máximo de inserções</Label>
                <Input type="number" min={0} max={8} step={1} value={form.maxInsertions} disabled={!form.brollEnabled} onChange={(event) => setForm((current) => ({ ...current, maxInsertions: Number(event.target.value) }))} className="border-white/10 bg-black/20 text-gray-100" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-gray-300">Duração por inserção (s)</Label>
                <Input type="number" min={1} max={6} step={0.1} value={form.durationSeconds} disabled={!form.brollEnabled} onChange={(event) => setForm((current) => ({ ...current, durationSeconds: Number(event.target.value) }))} className="border-white/10 bg-black/20 text-gray-100" />
              </div>
              <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2.5 flex items-center justify-between gap-3">
                <div>
                  <Label className="text-xs text-gray-300">Priorizar mídia própria</Label>
                  <p className="text-[10px] text-gray-500 mt-1">Uploads do tenant antes de outras origens.</p>
                </div>
                <Switch checked={form.preferOwnMedia} disabled={!form.brollEnabled} onCheckedChange={(checked) => setForm((current) => ({ ...current, preferOwnMedia: checked }))} />
              </div>
            </div>
          </div>

          {previewOpen && (
            <div className="pt-4 border-t border-white/10 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-violet-300" />
                    <h3 className="text-sm font-semibold text-white">Prévia do Brand Kit</h3>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Visualização dos arquivos reais e da composição aplicada ao vídeo principal. Nada é salvo até você confirmar.
                  </p>
                </div>
                {!previewIsCurrent && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-300">
                    Prévia desatualizada
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">1. Abertura</p>
                  {selectedIntro?.type === "video" ? (
                    <video controls preload="metadata" src={mediaUrl(selectedIntro.storageUrl)} className="aspect-video w-full rounded-lg bg-black object-contain" />
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20 text-xs text-gray-500">Sem intro</div>
                  )}
                  <p className="mt-2 truncate text-[11px] text-gray-500">{assetLabel(selectedIntro, "Nenhuma abertura selecionada")}</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">2. Vídeo principal</p>
                  <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800">
                    <div className="text-center">
                      <Clapperboard className="mx-auto h-7 w-7 text-white/30" />
                      <p className="mt-2 text-xs font-medium text-white/60">Conteúdo do vídeo</p>
                    </div>
                    {selectedLogo?.type === "image" && (
                      <img src={mediaUrl(selectedLogo.storageUrl)} alt="Logo selecionado" className="absolute right-3 top-3 max-h-[24%] max-w-[28%] object-contain" />
                    )}
                    <div className="absolute inset-x-3 bottom-3 flex justify-center text-center text-xs sm:text-sm">
                      <span className={captionPreviewClass(form.captionPreset)}>Sua legenda aparece aqui</span>
                    </div>
                    {form.brollEnabled && (
                      <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[9px] font-medium text-white/70">
                        B-roll: até {form.maxInsertions} × {form.durationSeconds}s
                      </span>
                    )}
                  </div>
                  <p className="mt-2 truncate text-[11px] text-gray-500">Logo: {assetLabel(selectedLogo, "sem logo")}</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">3. Encerramento</p>
                  {selectedOutro?.type === "video" ? (
                    <video controls preload="metadata" src={mediaUrl(selectedOutro.storageUrl)} className="aspect-video w-full rounded-lg bg-black object-contain" />
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20 text-xs text-gray-500">Sem outro</div>
                  )}
                  <p className="mt-2 truncate text-[11px] text-gray-500">{assetLabel(selectedOutro, "Nenhum encerramento selecionado")}</p>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-200">Trilha padrão</p>
                    <p className="truncate text-[11px] text-gray-500">{assetLabel(selectedMusic, form.defaultMusicAssetId ? "Trilha selecionada" : "Sem trilha padrão")}</p>
                  </div>
                  {selectedMusic?.type === "audio" ? (
                    <audio controls preload="metadata" src={mediaUrl(selectedMusic.storageUrl)} className="h-9 w-full max-w-md" />
                  ) : (
                    <span className="text-[11px] text-gray-500">Nenhum áudio para reproduzir</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-white/10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-5">
              {message ? (
                <p className={message.type === "success" ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{message.text}</p>
              ) : (
                <p className="text-[11px] text-gray-500">Selecione da Biblioteca ou envie um arquivo novo. Os uploads continuam centralizados em Mídias.</p>
              )}
              {!previewIsCurrent && (
                <p className="mt-1 text-[11px] text-amber-300">Gere ou atualize a prévia para liberar o salvamento.</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!tenantId || uploadingSlot !== null || saving}
                onClick={generatePreview}
                className="border-white/15 bg-white/5 text-gray-200 hover:bg-white/10 hover:text-white"
              >
                <Eye className="h-4 w-4 mr-2" />
                {previewOpen ? "Atualizar prévia" : "Pré-visualizar"}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!tenantId || saving || uploadingSlot !== null || !previewIsCurrent}
                onClick={saveBrandKit}
                title={!previewIsCurrent ? "Pré-visualize a configuração antes de salvar" : undefined}
                className="bg-violet-600 hover:bg-violet-500 text-white"
              >
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar Brand Kit
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
