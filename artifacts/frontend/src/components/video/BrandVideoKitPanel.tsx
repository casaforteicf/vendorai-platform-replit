import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Captions,
  Clapperboard,
  Image as ImageIcon,
  Library,
  Loader2,
  Music2,
  Save,
  Sparkles,
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

interface MediaAssetOption {
  id: string;
  type: "image" | "video";
  role: string | null;
  source: string | null;
  title: string;
  originalFilename: string | null;
  createdAt: string | null;
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

export default function BrandVideoKitPanel() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const tenantId = user?.tenantId;
  const [brandKit, setBrandKit] = useState<BrandKitRow | null>(null);
  const [assets, setAssets] = useState<MediaAssetOption[]>([]);
  const [tracks, setTracks] = useState<MusicTrackOption[]>([]);
  const [form, setForm] = useState<BrandKitForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const images = useMemo(() => assets.filter((asset) => asset.type === "image"), [assets]);
  const videos = useMemo(() => assets.filter((asset) => asset.type === "video"), [assets]);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMessage(null);

    void Promise.all([
      fetch(`/api/tenants/${tenantId}/media-engine/brand-kit`, { credentials: "include" }),
      fetch(`/api/tenants/${tenantId}/media/tracks?limit=150`, { credentials: "include" }),
      fetch(`/api/tenants/${tenantId}/media-engine/brand-kit/assets?limit=150`, { credentials: "include" }),
    ])
      .then(async ([kitResponse, tracksResponse, assetsResponse]) => {
        if (!kitResponse.ok || !tracksResponse.ok || !assetsResponse.ok) {
          throw new Error("Não foi possível carregar o Brand Video Kit");
        }
        const [kitPayload, tracksPayload, assetsPayload] = await Promise.all([
          kitResponse.json(),
          tracksResponse.json(),
          assetsResponse.json(),
        ]);
        if (cancelled) return;

        const kit = (kitPayload?.brandKit ?? null) as BrandKitRow | null;
        const broll = asRecord(kit?.broll_config);
        setBrandKit(kit);
        setTracks(Array.isArray(tracksPayload?.tracks) ? tracksPayload.tracks : []);
        setAssets(Array.isArray(assetsPayload?.assets) ? assetsPayload.assets : []);
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

  async function saveBrandKit() {
    if (!tenantId || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/brand-kit`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] overflow-hidden">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-gray-300 flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" /> Logo padrão
              </Label>
              <Select value={selectValue(form.logoAssetId)} onValueChange={(value) => setForm((current) => ({ ...current, logoAssetId: fromSelectValue(value) }))}>
                <SelectTrigger className="border-white/10 bg-black/20 text-gray-100"><SelectValue placeholder="Sem logo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Sem logo</SelectItem>
                  {images.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.title}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-500">Imagens já salvas na Biblioteca.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-gray-300 flex items-center gap-1.5"><Clapperboard className="h-3.5 w-3.5" /> Intro padrão</Label>
              <Select value={selectValue(form.introAssetId)} onValueChange={(value) => setForm((current) => ({ ...current, introAssetId: fromSelectValue(value) }))}>
                <SelectTrigger className="border-white/10 bg-black/20 text-gray-100"><SelectValue placeholder="Sem intro" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Sem intro</SelectItem>
                  {videos.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.title}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-500">Aplicada antes do vídeo principal.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-gray-300 flex items-center gap-1.5"><Clapperboard className="h-3.5 w-3.5" /> Outro padrão</Label>
              <Select value={selectValue(form.outroAssetId)} onValueChange={(value) => setForm((current) => ({ ...current, outroAssetId: fromSelectValue(value) }))}>
                <SelectTrigger className="border-white/10 bg-black/20 text-gray-100"><SelectValue placeholder="Sem outro" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Sem outro</SelectItem>
                  {videos.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.title}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-500">Aplicado automaticamente ao final.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
            <div className="space-y-2">
              <Label className="text-xs text-gray-300 flex items-center gap-1.5"><Music2 className="h-3.5 w-3.5" /> Trilha padrão</Label>
              <Select value={selectValue(form.defaultMusicAssetId)} onValueChange={(value) => setForm((current) => ({ ...current, defaultMusicAssetId: fromSelectValue(value) }))}>
                <SelectTrigger className="border-white/10 bg-black/20 text-gray-100"><SelectValue placeholder="Sem trilha padrão" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Sem trilha padrão</SelectItem>
                  {tracks.map((track) => <SelectItem key={track.id} value={track.id}>{trackTitle(track)}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-500">Somente trilhas da Biblioteca com direitos vinculados.</p>
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

          <div className="pt-4 border-t border-white/10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-5">
              {message ? (
                <p className={message.type === "success" ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{message.text}</p>
              ) : (
                <p className="text-[11px] text-gray-500">Não há upload duplicado aqui: todas as mídias continuam centralizadas na Biblioteca.</p>
              )}
            </div>
            <Button type="button" size="sm" disabled={!tenantId || saving} onClick={saveBrandKit} className="bg-violet-600 hover:bg-violet-500 text-white">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Brand Kit
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
