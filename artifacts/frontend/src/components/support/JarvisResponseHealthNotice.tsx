import { useEffect, useState } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JARVIS_RESPONSE_STATE_EVENT } from "@/lib/jarvisResponseHealthBridge";

type StateDetail = {
  state?: "waiting" | "healthy" | "failed";
  message?: string;
};

export function JarvisResponseHealthNotice() {
  const [detail, setDetail] = useState<StateDetail | null>(null);

  useEffect(() => {
    const onState = (event: Event) => {
      const next = (event as CustomEvent<StateDetail>).detail;
      if (next?.state === "healthy") {
        setDetail(null);
        return;
      }
      if (next?.state === "waiting" || next?.state === "failed") {
        setDetail(next);
      }
    };

    window.addEventListener(JARVIS_RESPONSE_STATE_EVENT, onState);
    return () => window.removeEventListener(JARVIS_RESPONSE_STATE_EVENT, onState);
  }, []);

  if (!detail) return null;

  return (
    <div className="jarvis-response-health fixed left-1/2 top-16 z-[70] w-[calc(100vw-24px)] max-w-sm -translate-x-1/2 rounded-xl border bg-background px-3 py-2 shadow-lg">
      <div className="flex items-start gap-2">
        {detail.state === "waiting"
          ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
        <p className="flex-1 text-xs leading-relaxed">
          {detail.message ?? "O JARVIS ainda não concluiu a resposta."}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => setDetail(null)}
          aria-label="Fechar aviso"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
