import { useMemo, useState } from "react";
import { AudioLines, Check, Music2, Search, Sparkles, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  assetLabel,
  assetUrl,
  audioKind,
  type ProfessionalAudioKind,
  type ProfessionalMediaAsset,
} from "./professional-video";

type Tab = Exclude<ProfessionalAudioKind, "sonic_identity" | "other"> | "all";

type Props = {
  assets: ProfessionalMediaAsset[];
  musicAssetId: string;
  effectAssetId: string;
  jingleAssetId: string;
  voiceoverAssetId?: string;
  onMusicChange: (id: string) => void;
  onEffectChange: (id: string) => void;
  onJingleChange: (id: string) => void;
  onVoiceoverChange?: (id: string) => void;
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "music", label: "Músicas" },
  { id: "sound_effect", label: "Efeitos" },
  { id: "voiceover", label: "Locuções" },
  { id: "jingle", label: "Jingles" },
];

function assetMeta(asset: ProfessionalMediaAsset): Record<string, unknown> {
  return asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? asset.metadata : {};
}

function descriptor(asset: ProfessionalMediaAsset): string {
  const meta = assetMeta(asset);
  return [meta.genre, meta.mood, meta.bpm ? `${meta.bpm} BPM` : "", meta.usage, meta.rightsLabel]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
}

export default function ProfessionalAudioLibrary({
  assets,
  musicAssetId,
  effectAssetId,
  jingleAssetId,
  voiceoverAssetId = "",
  onMusicChange,
  onEffectChange,
  onJingleChange,
  onVoiceoverChange,
}: Props) {
  const [tab, setTab] = useState<Tab>("music");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return assets
      .filter((asset) => asset.type === "audio")
      .filter((asset) => tab === "all" || audioKind(asset) === tab)
      .filter((asset) => {
        if (!normalized) return true;
        return `${assetLabel(asset)} ${descriptor(asset)}`.toLowerCase().includes(normalized);
      });
  }, [assets, query, tab]);

  const selectedIdFor = (kind: ProfessionalAudioKind) => {
    if (kind === "music") return musicAssetId;
    if (kind === "sound_effect") return effectAssetId;
    if (kind === "voiceover") return voiceoverAssetId;
    if (kind === "jingle") return jingleAssetId;
    return "";
  };

  const select = (asset: ProfessionalMediaAsset) => {
    const kind = audioKind(asset);
    if (kind === "music") onMusicChange(musicAssetId === asset.id ? "" : asset.id);
    if (kind === "sound_effect") onEffectChange(effectAssetId === asset.id ? "" : asset.id);
    if (kind === "voiceover" && onVoiceoverChange) onVoiceoverChange(voiceoverAssetId === asset.id ? "" : asset.id);
    if (kind === "jingle") onJingleChange(jingleAssetId === asset.id ? "" : asset.id);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><Music2 className="h-4 w-4 text-primary" /><h3 className="font-semibold text-foreground">Biblioteca de áudio</h3></div>
          <p className="mt-1 text-xs text-muted-foreground">Ouça antes de aplicar. Música, efeitos, locuções e jingles ficam visíveis dentro do projeto.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar áudio…" className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/50" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button key={item.id} type="button" onClick={() => setTab(item.id)} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition", tab === item.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{item.label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Nenhum áudio desta categoria foi encontrado na Biblioteca.</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.slice(0, 40).map((asset) => {
            const kind = audioKind(asset);
            const selectable = kind === "music" || kind === "sound_effect" || kind === "jingle" || (kind === "voiceover" && Boolean(onVoiceoverChange));
            const selected = selectedIdFor(kind) === asset.id;
            return (
              <div key={asset.id} className={cn("rounded-xl border p-3 transition", selected ? "border-primary/45 bg-primary/5" : "border-border bg-background/40")}> 
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    {kind === "music" ? <Music2 className="h-4 w-4" /> : kind === "sound_effect" ? <Sparkles className="h-4 w-4" /> : kind === "voiceover" ? <Volume2 className="h-4 w-4" /> : <AudioLines className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{assetLabel(asset)}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{descriptor(asset) || kind.replaceAll("_", " ")}</p>
                    {assetUrl(asset) && <audio controls preload="none" src={assetUrl(asset)} className="mt-2 h-8 w-full" />}
                  </div>
                  {selectable && (
                    <button type="button" onClick={() => select(asset)} className={cn("shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium", selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}>{selected ? <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" />Aplicado</span> : "Usar"}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
