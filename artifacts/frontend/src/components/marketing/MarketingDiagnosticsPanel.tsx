import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type PieceStatus = { code: string; label: string; tone: string };
type PieceAction = { code: string; label: string; enabled: boolean; reason?: string };
type Piece = {
  id: string;
  tipo: string;
  canal: string;
  temaSugerido: string;
  status: PieceStatus;
  media: "pending" | "processing" | "ready" | "failed";
  action: PieceAction;
};

const FUNNEL: Array<{ code: string; label: string }> = [
  { code: "planned", label: "Planejado" },
  { code: "authorized", label: "Liberado" },
  { code: "producing", label: "Em produção" },
  { code: "in_review", label: "Em revisão" },
  { code: "approved", label: "Aprovado" },
  { code: "scheduled", label: "Agendado" },
  { code: "published", label: "Publicado" },
];

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function MarketingDiagnosticsPanel({ tenantId }: { tenantId: string }) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/tenants/${tenantId}/marketing/pieces`, { headers: authHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { pieces?: Piece[] };
      setPieces(Array.isArray(body.pieces) ? body.pieces : []);
    } catch {
      setError("Não foi possível carregar o diagnóstico. Atualize para tentar de novo.");
      setPieces([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const counts = new Map<string, number>();
  for (const piece of pieces) counts.set(piece.status.code, (counts.get(piece.status.code) ?? 0) + 1);
  const totalFunnel = FUNNEL.reduce((sum, stage) => sum + (counts.get(stage.code) ?? 0), 0);
  const failures = pieces.filter((piece) => piece.status.code === "failed" || piece.media === "failed");
  const blocked = pieces.filter((piece) => piece.action.code === "wait" && piece.media !== "ready");

  if (!tenantId) return null;

  return (
    <Card className="mb-3">
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Diagnóstico do Marketing</p>
            <Badge variant="outline" className="text-[10px]">{pieces.length} peça(s)</Badge>
          </div>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} />Atualizar
          </Button>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {loading && pieces.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />Calculando funil…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {FUNNEL.map((stage) => {
                const value = counts.get(stage.code) ?? 0;
                const share = totalFunnel > 0 ? Math.round((value / totalFunnel) * 100) : 0;
                return (
                  <div key={stage.code} className="rounded-lg border bg-background px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{stage.label}</p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
                    <div className="mt-1 h-1 w-full rounded bg-muted">
                      <div className="h-1 rounded bg-primary" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${failures.length ? "border-red-300 bg-red-50 text-red-700" : "border-border text-muted-foreground"}`}>
                <AlertTriangle className="h-3 w-3" />{failures.length} falha(s)
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-muted-foreground">
                {blocked.length} aguardando mídia
              </span>
              <span className="text-muted-foreground">Clique em “Atualizar” após uma produção para ver o funil mudar.</span>
            </div>

            {failures.length > 0 ? (
              <div className="space-y-1 rounded-lg border border-red-200 bg-red-50/40 p-2">
                {failures.slice(0, 5).map((piece) => (
                  <div key={piece.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-red-800">
                    <span className="min-w-0 truncate"><strong>{piece.temaSugerido}</strong> · {piece.tipo} · {piece.canal}</span>
                    <span className="shrink-0">{piece.status.label} · mídia {piece.media}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
