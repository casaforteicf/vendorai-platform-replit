import { useEffect, useMemo, useState } from "react";
import { Clock3, Gauge, Heart, Loader2, Music2, Save, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type MusicAsset = {
  id: string;
  metadata?: Record<string, unknown> | null;
};

type EnergyLevel = "" | "low" | "medium" | "high";

const ENERGY_LABELS: Record<Exclude<EnergyLevel, "">, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberText(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(Math.round(number * 10) / 10) : "";
}

function energyValue(value: unknown): EnergyLevel {
  return value === "low" || value === "medium" || value === "high" ? value : "";
}

function secondsLabel(value: string): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export default function MusicMetadataPanel({
  tenantId,
  asset,
  resolvedUrl,
  onUpdated,
}: {
  tenantId: string;
  asset: MusicAsset;
  resolvedUrl?: string;
  onUpdated?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [genre, setGenre] = useState("");
  const [mood, setMood] = useState("");
  const [energy, setEnergy] = useState<EnergyLevel>("");
  const [bpm, setBpm] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    const metadata = asset.metadata ?? {};
    setGenre(text(metadata.genre));
    setMood(text(metadata.mood));
    setEnergy(energyValue(metadata.energy));
    setBpm(numberText(metadata.bpm));
    setDurationSeconds(numberText(metadata.durationSeconds));
    setFavorite(metadata.favorite === true);
  }, [asset.id, asset.metadata]);

  const duration = useMemo(() => secondsLabel(durationSeconds), [durationSeconds]);

  async function detectDuration() {
    if (!resolvedUrl) return;
    setDetecting(true);
    try {
      const detected = await new Promise<number>((resolve, reject) => {
        const audio = new Audio();
        audio.preload = "metadata";
        const cleanup = () => {
          audio.removeAttribute("src");
          audio.load();
        };
        audio.onloadedmetadata = () => {
          const value = audio.duration;
          cleanup();
          if (Number.isFinite(value) && value > 0) resolve(value);
          else reject(new Error("Duração indisponível"));
        };
        audio.onerror = () => {
          cleanup();
          reject(new Error("Não foi possível ler a duração"));
        };
        audio.src = resolvedUrl;
      });
      setDurationSeconds(String(Math.round(detected * 10) / 10));
      toast({ title: "Duração identificada", description: secondsLabel(String(detected)) });
    } catch (error) {
      toast({
        title: "Não foi possível identificar a duração",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setDetecting(false);
    }
  }

  async function save() {
    if (!tenantId) return;
    const bpmNumber = bpm ? Number(bpm) : null;
    const durationNumber = durationSeconds ? Number(durationSeconds) : null;
    if (bpmNumber !== null && (!Number.isFinite(bpmNumber) || bpmNumber < 20 || bpmNumber > 300)) {
      toast({ title: "BPM inválido", description: "Informe um valor entre 20 e 300.", variant: "destructive" });
      return;
    }
    if (durationNumber !== null && (!Number.isFinite(durationNumber) || durationNumber <= 0 || durationNumber > 21600)) {
      toast({ title: "Duração inválida", description: "Informe uma duração válida em segundos.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/assets/${asset.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metadata: {
            genre: genre.trim() || null,
            mood: mood.trim() || null,
            energy: energy || null,
            bpm: bpmNumber,
            durationSeconds: durationNumber,
            favorite,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar os metadados musicais");
      toast({ title: "Metadados musicais atualizados" });
      await onUpdated?.();
    } catch (error) {
      toast({
        title: "Falha ao salvar os metadados",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Music2 className="h-4 w-4 text-primary" /> Metadados musicais
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Classifique a trilha para busca, Brand Kit e composição de vídeo.</p>
        </div>
        <button
          type="button"
          onClick={() => setFavorite((current) => !current)}
          className={`rounded-full border p-2 ${favorite ? "border-rose-500/30 bg-rose-500/10 text-rose-600" : "text-muted-foreground"}`}
          title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        >
          <Heart className={`h-4 w-4 ${favorite ? "fill-current" : ""}`} />
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Gênero</span>
          <input value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="Ex.: eletrônico, pop, acústico" className="h-9 w-full rounded-lg border bg-background px-2 text-xs" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Mood / clima</span>
          <input value={mood} onChange={(event) => setMood(event.target.value)} placeholder="Ex.: inspirador, elegante, enérgico" className="h-9 w-full rounded-lg border bg-background px-2 text-xs" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Energia</span>
          <select value={energy} onChange={(event) => setEnergy(event.target.value as EnergyLevel)} className="h-9 w-full rounded-lg border bg-background px-2 text-xs">
            <option value="">Não informada</option>
            {Object.entries(ENERGY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">BPM</span>
          <div className="relative">
            <Gauge className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input type="number" min={20} max={300} step={1} value={bpm} onChange={(event) => setBpm(event.target.value)} placeholder="120" className="h-9 w-full rounded-lg border bg-background pl-7 pr-2 text-xs" />
          </div>
        </label>
      </div>

      <div className="mt-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium"><Clock3 className="h-3.5 w-3.5" /> Duração</div>
            <p className="mt-1 text-xs text-muted-foreground">{duration}</p>
          </div>
          <button type="button" disabled={detecting || !resolvedUrl} onClick={() => void detectDuration()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs disabled:opacity-50">
            {detecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Detectar
          </button>
        </div>
        <input type="number" min={0.1} max={21600} step={0.1} value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)} placeholder="Segundos" className="mt-2 h-9 w-full rounded-lg border bg-background px-2 text-xs" />
      </div>

      <button disabled={saving} onClick={() => void save()} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Salvar metadados
      </button>
    </div>
  );
}
