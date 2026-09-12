import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ScanSearch } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import SmartMediaCanvasAutocomposePanel from "./SmartMediaCanvasAutocomposePanel";
import { DESIGN_PLAN_KEY, parseSmartDesign } from "./smart-storyboard";

export default function SmartMediaCanvasAutocomposeGate() {
  const { user, tenantOverride } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    if (!tenantId) return;
    const stored = parseSmartDesign(sessionStorage.getItem(DESIGN_PLAN_KEY), tenantId);
    setReady(Boolean(stored?.mediaAutocomposition?.scenes.length));
  }, [tenantId]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 900);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const reanalyse = () => {
    const raw = sessionStorage.getItem(DESIGN_PLAN_KEY);
    const stored = parseSmartDesign(raw, tenantId);
    if (!stored) return;
    const { mediaAutocomposition: _discarded, ...next } = stored;
    sessionStorage.setItem(DESIGN_PLAN_KEY, JSON.stringify(next));
    setReady(false);
  };

  if (!ready) return <SmartMediaCanvasAutocomposePanel />;

  return (
    <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.05] p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-300"><ScanSearch className="h-4 w-4" /></div>
          <div><p className="text-sm font-semibold text-foreground">Smart Media e Smart Crop prontos</p><p className="mt-0.5 text-xs text-muted-foreground">A seleção inteligente foi congelada para evitar reprocessamento da Biblioteca. Reanalise apenas quando quiser recalcular as escolhas.</p></div>
        </div>
        <button type="button" onClick={reanalyse} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:text-foreground"><RefreshCw className="h-3.5 w-3.5" />Reanalisar mídia</button>
      </div>
    </section>
  );
}
