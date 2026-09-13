import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Rocket, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Decision = "collect" | "organic" | "replicate" | "paid" | "hold";

type AssistedDraft = {
  mode: "automatic" | "assisted";
  requiresApproval: boolean;
  publishingPerformed: boolean;
  budgetChanged: boolean;
  title: string;
  objective: string;
  draft: Record<string, unknown>;
  executionPolicy?: {
    contentPublishing?: string;
    sponsoredMedia?: string;
    budgetIncreaseAllowed?: boolean;
  };
};

export function FollowerAssistedExecution({ decision }: { decision: Decision }) {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [draft, setDraft] = useState<AssistedDraft | null>(null);
  const [loading, setLoading] = useState(false);

  if (!tenantId || !token || decision === "collect" || decision === "hold") return null;

  async function prepare() {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/marketing/launch-command-center/assisted-draft`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "creative", filters: { platform: "instagram", period: "30d" } }),
      });
      if (!response.ok) throw new Error("Falha ao preparar execução assistida.");
      setDraft(await response.json() as AssistedDraft);
    } finally {
      setLoading(false);
    }
  }

  function openExecution() {
    const brief = draft ? encodeURIComponent(JSON.stringify(draft.draft)) : "";
    if (decision === "paid") {
      window.location.assign(`/content?tab=campanhas&objective=followers&from=follower-assisted-execution&brief=${brief}`);
      return;
    }
    window.location.assign(`/content?tab=gerador&objective=followers&format=reel&from=follower-assisted-execution&brief=${brief}`);
  }

  return (
    <Card className="border-emerald-500/25 bg-emerald-500/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Rocket className="h-5 w-5 text-emerald-600" /><CardTitle className="text-base">Execução assistida da decisão</CardTitle></div>
          <Badge variant="outline">{decision === "paid" ? "Teste pago" : "Criativo orgânico"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!draft ? (
          <>
            <p className="text-sm text-muted-foreground">Transforme a recomendação em um rascunho operacional usando o Marketing Assistido e as regras de autonomia já configuradas para este tenant.</p>
            <Button onClick={() => void prepare()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Preparar execução</Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2"><Badge>{draft.mode === "automatic" ? "Modo automático" : "Revisão humana"}</Badge><Badge variant="outline">{draft.requiresApproval ? "Aprovação necessária" : "Dentro da autonomia"}</Badge></div>
            <div><p className="font-semibold">{draft.title}</p><p className="mt-1 text-sm text-muted-foreground">{draft.objective}</p></div>
            <div className="rounded-lg border bg-background p-3 text-xs text-muted-foreground"><pre className="whitespace-pre-wrap font-sans">{JSON.stringify(draft.draft, null, 2)}</pre></div>
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">Publicação executada agora: <strong>não</strong> · Orçamento alterado: <strong>não</strong> · Aumento automático de orçamento: <strong>bloqueado</strong>.</div>
            <Button onClick={openExecution}>{draft.requiresApproval ? "Aprovar e abrir execução" : "Abrir execução"}</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
