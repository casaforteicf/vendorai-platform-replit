import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, MousePointer2, Play, RefreshCw, ShieldCheck } from "lucide-react";

type LiveSession = {
  id: string;
  status: "idle" | "running" | "paused" | "completed" | "error" | "closed";
  url: string;
  title: string | null;
  screenshotDataUrl?: string;
  pauseReason: "manual" | "human_verification" | "approval_required" | null;
  answer: string | null;
  error: string | null;
};

function params() {
  const search = new URLSearchParams(window.location.search);
  return {
    sessionId: search.get("browserSession") || "",
    handoff: search.get("handoff") || "",
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Não foi possível controlar a sessão do Vendi.");
  return body as T;
}

export default function VendiHandoff() {
  const { sessionId, handoff } = useMemo(params, []);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const base = sessionId && handoff
    ? `/api/browser-agent/handoff/${encodeURIComponent(sessionId)}`
    : "";

  const refresh = async () => {
    if (!base) {
      setError("Link de controle inválido.");
      return;
    }
    try {
      const data = await request<LiveSession>(`${base}/screenshot?handoff=${encodeURIComponent(handoff)}`);
      setSession(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sessão indisponível.");
    }
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1200);
    return () => window.clearInterval(timer);
  }, [base, handoff]);

  const control = async (command: Record<string, unknown>) => {
    if (!base || busy) return;
    setBusy(true);
    try {
      const data = await request<LiveSession>(`${base}/control?handoff=${encodeURIComponent(handoff)}`, {
        method: "POST",
        body: JSON.stringify(command),
      });
      setSession(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Controle manual falhou.");
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    if (!base || busy) return;
    setBusy(true);
    try {
      const data = await request<LiveSession>(`${base}/pause?handoff=${encodeURIComponent(handoff)}`, {
        method: "POST",
        body: JSON.stringify({ paused: false }),
      });
      setSession(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível devolver o controle ao Vendi.");
    } finally {
      setBusy(false);
    }
  };

  const screenshot = session?.screenshotDataUrl;

  return (
    <div className="min-h-screen bg-muted/20 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-semibold">Controle seguro do Vendi</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Use esta tela somente para concluir uma verificação humana legítima. Depois, devolva o controle ao agente.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full border px-3 py-1">
                {session?.status || "conectando"}
              </span>
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                <RefreshCw className="mr-2 h-4 w-4" />Atualizar
              </Button>
            </div>
          </div>
        </Card>

        {error && (
          <Card className="border-destructive/30 p-4 text-sm text-destructive">{error}</Card>
        )}

        <Card className="overflow-hidden">
          <div className="border-b p-3 text-sm text-muted-foreground">
            {session?.title || "Navegador remoto"} · {session?.url || "aguardando"}
          </div>
          <div className="flex min-h-[520px] items-center justify-center bg-black/5 p-2">
            {screenshot ? (
              <img
                src={screenshot}
                alt="Tela do navegador remoto"
                className="max-h-[72vh] w-auto max-w-full cursor-crosshair rounded border bg-white object-contain"
                onClick={(event) => {
                  if (busy) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const naturalWidth = event.currentTarget.naturalWidth || 1365;
                  const naturalHeight = event.currentTarget.naturalHeight || 768;
                  const x = ((event.clientX - rect.left) / rect.width) * naturalWidth;
                  const y = ((event.clientY - rect.top) / rect.height) * naturalHeight;
                  void control({ action: "click", x, y });
                }}
              />
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />Carregando sessão…
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
            <Input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Digite um texto para o campo atualmente selecionado"
              onKeyDown={(event) => {
                if (event.key === "Enter" && text.trim()) {
                  event.preventDefault();
                  void control({ action: "type", text });
                  setText("");
                }
              }}
            />
            <Button variant="outline" disabled={busy || !text.trim()} onClick={() => {
              void control({ action: "type", text });
              setText("");
            }}>
              Digitar
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void control({ action: "key", key: "Enter" })}>
              Enter
            </Button>
            <Button disabled={busy} onClick={() => void resume()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Retomar Vendi
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <MousePointer2 className="h-3.5 w-3.5" />
            Clique diretamente na imagem para interagir com a página remota.
          </div>
        </Card>
      </div>
    </div>
  );
}
