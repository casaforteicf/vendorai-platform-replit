import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Layers3 } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { SMART_STORYBOARD_MANIFEST_KEY, parseStoryboardManifest, type SmartStoryboardManifest } from "./smart-storyboard";

export default function SmartStoryboardNavigator() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [, navigate] = useLocation();
  const [manifest, setManifest] = useState<SmartStoryboardManifest | null>(null);
  const projectId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("projectId") ?? "" : "";

  useEffect(() => {
    if (!tenantId) return;
    const refresh = () => setManifest(parseStoryboardManifest(sessionStorage.getItem(SMART_STORYBOARD_MANIFEST_KEY), tenantId));
    refresh();
    const timer = window.setInterval(refresh, 1200);
    return () => window.clearInterval(timer);
  }, [tenantId]);

  const activeIndex = useMemo(() => manifest?.scenes.findIndex((scene) => scene.projectId === projectId) ?? -1, [manifest, projectId]);
  if (!manifest || activeIndex < 0) return null;

  const go = (index: number) => {
    const scene = manifest.scenes[index];
    if (!scene) return;
    navigate(`/content-studio/video/edicao?projectId=${encodeURIComponent(scene.projectId)}&from=smart-storyboard&scene=${scene.sceneIndex + 1}`);
  };

  return (
    <section className="rounded-2xl border border-fuchsia-500/25 bg-gradient-to-r from-fuchsia-500/[0.08] via-card to-card p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300"><Layers3 className="h-4 w-4" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-foreground">Storyboard · Cena {activeIndex + 1} de {manifest.scenes.length}</p><span className="rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700 dark:text-fuchsia-300">{manifest.targetFormat}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Design {manifest.designScore}/100</span></div>
            <p className="mt-0.5 text-xs text-muted-foreground">Cada cena é uma prancheta independente: edite livremente sem misturar layers das outras cenas.</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => go(activeIndex - 1)} disabled={activeIndex <= 0} aria-label="Cena anterior" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <div className="flex flex-wrap gap-1.5">
            {manifest.scenes.map((scene, index) => (
              <button key={scene.projectId} type="button" onClick={() => go(index)} className={cn("min-w-[88px] rounded-lg border px-2.5 py-1.5 text-left transition", index === activeIndex ? "border-fuchsia-500/40 bg-fuchsia-500/10" : "border-border bg-background/55 hover:border-fuchsia-500/25")}>
                <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{index === activeIndex && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}Cena {index + 1}</span>
                <span className="block max-w-[130px] truncate text-[10px] font-semibold text-foreground">{scene.headline}</span>
                <span className="block text-[9px] text-fuchsia-700 dark:text-fuchsia-300">Match {scene.mediaScore}/100</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => go(activeIndex + 1)} disabled={activeIndex >= manifest.scenes.length - 1} aria-label="Próxima cena" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </section>
  );
}
