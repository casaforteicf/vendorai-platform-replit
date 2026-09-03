import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { clearMediaHandoff, readMediaHandoff, type MediaHandoffPayload } from "@/lib/media-handoff";

export default function MediaHandoffBanner({ target }: { target: string }) {
  const [handoff, setHandoff] = useState<MediaHandoffPayload | null>(null);

  useEffect(() => {
    const current = readMediaHandoff();
    if (current?.target === target) setHandoff(current);
  }, [target]);

  if (!handoff) return null;

  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 text-sm">
      <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><div><p className="font-medium">Mídia selecionada na Biblioteca</p><p className="mt-0.5 text-xs text-muted-foreground">{handoff.originalFilename || "Mídia"} · ativo {handoff.assetId.slice(0, 8)}…</p></div></div>
      <button type="button" onClick={() => { clearMediaHandoff(); setHandoff(null); }} className="rounded-md p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
    </div>
  );
}
