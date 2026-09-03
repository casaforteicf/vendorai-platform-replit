import { useState } from "react";
import { Crop, Image as ImageIcon, Loader2, Maximize2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type Position = "centre" | "north" | "south" | "east" | "west" | "northeast" | "northwest" | "southeast" | "southwest";

type Props = {
  assetId: string;
  filename?: string | null;
  onUpdated?: () => Promise<void> | void;
};

const PRESETS = [
  { id: "square", label: "Feed 1:1", detail: "1080 × 1080", width: 1080, height: 1080 },
  { id: "portrait", label: "Feed 4:5", detail: "1080 × 1350", width: 1080, height: 1350 },
  { id: "story", label: "Story / Reel 9:16", detail: "1080 × 1920", width: 1080, height: 1920 },
  { id: "landscape", label: "Anúncio 1.91:1", detail: "1200 × 628", width: 1200, height: 628 },
  { id: "video", label: "Horizontal 16:9", detail: "1920 × 1080", width: 1920, height: 1080 },
  { id: "site", label: "Site / Banner", detail: "1600 × 900", width: 1600, height: 900 },
] as const;

const POSITIONS: Array<[Position, string]> = [
  ["centre", "Centro"], ["north", "Topo"], ["south", "Base"], ["west", "Esquerda"], ["east", "Direita"],
];

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    "Content-Type": "application/json",
  };
}

export default function ImageFormatPresetsPanel({ assetId, filename, onUpdated }: Props) {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const { toast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState<string>("portrait");
  const [fit, setFit] = useState<"cover" | "inside">("cover");
  const [position, setPosition] = useState<Position>("centre");
  const [quality, setQuality] = useState(92);
  const [customWidth, setCustomWidth] = useState(1080);
  const [customHeight, setCustomHeight] = useState(1080);
  const [running, setRunning] = useState(false);

  async function apply(width: number, height: number, label: string) {
    if (!tenantId || !assetId || running) return;
    setRunning(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media-engine/image-tools`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          assetId,
          operation: "image_resize",
          title: `${filename || "Imagem"} — ${label}`,
          options: { width, height, fit, position, quality, format: "webp" },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao gerar formato");
      toast({ title: "Novo formato criado", description: `${label} foi salvo como nova versão. O original foi preservado.` });
      await onUpdated?.();
    } catch (error) {
      toast({ title: "Não foi possível gerar o formato", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }

  const preset = PRESETS.find((item) => item.id === selectedPreset) ?? PRESETS[0];

  return (
    <details className="rounded-xl border bg-background">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-semibold"><Crop className="h-4 w-4 text-primary" /> Formatos e enquadramento</summary>
      <div className="space-y-3 border-t p-3">
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((item) => (
            <button key={item.id} type="button" onClick={() => setSelectedPreset(item.id)} className={`rounded-lg border p-2 text-left ${selectedPreset === item.id ? "border-primary/50 bg-primary/[0.05]" : "hover:bg-muted/50"}`}>
              <p className="text-[11px] font-medium">{item.label}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{item.detail}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-muted-foreground">Enquadramento<select value={fit} onChange={(event) => setFit(event.target.value as "cover" | "inside")} className="mt-1 h-8 w-full rounded-lg border bg-background px-2 text-[11px]"><option value="cover">Preencher / recortar</option><option value="inside">Mostrar imagem inteira</option></select></label>
          <label className="text-[10px] text-muted-foreground">Foco do corte<select value={position} onChange={(event) => setPosition(event.target.value as Position)} disabled={fit !== "cover"} className="mt-1 h-8 w-full rounded-lg border bg-background px-2 text-[11px] disabled:opacity-50">{POSITIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>

        <label className="block text-[10px] text-muted-foreground">Qualidade · {quality}%<input type="range" min={60} max={100} value={quality} onChange={(event) => setQuality(Number(event.target.value))} className="mt-1 w-full accent-primary" /></label>

        <button disabled={running} onClick={() => void apply(preset.width, preset.height, preset.label)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">{running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />} Gerar {preset.label}</button>

        <div className="border-t pt-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold"><Maximize2 className="h-3.5 w-3.5" /> Tamanho personalizado</div>
          <div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-muted-foreground">Largura<input type="number" min={1} max={12000} value={customWidth} onChange={(event) => setCustomWidth(Number(event.target.value))} className="mt-1 h-8 w-full rounded-lg border px-2 text-xs" /></label><label className="text-[10px] text-muted-foreground">Altura<input type="number" min={1} max={12000} value={customHeight} onChange={(event) => setCustomHeight(Number(event.target.value))} className="mt-1 h-8 w-full rounded-lg border px-2 text-xs" /></label></div>
          <button disabled={running || customWidth < 1 || customHeight < 1} onClick={() => void apply(customWidth, customHeight, `${customWidth}×${customHeight}`)} className="mt-2 w-full rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50">Gerar tamanho personalizado</button>
        </div>

        <p className="text-[9px] leading-relaxed text-muted-foreground">“Preencher” ajusta ao formato e pode recortar as bordas; escolha o foco para controlar o enquadramento. “Mostrar imagem inteira” preserva todo o conteúdo.</p>
      </div>
    </details>
  );
}
