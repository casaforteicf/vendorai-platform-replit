import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BrainCircuit, FileText, Loader2, ShieldCheck, Sparkles, Target } from "lucide-react";

type DraftKind = "creative" | "landing_page" | "audience" | "keyword";
type AssistedDraft = {
  mode: "assisted";
  kind: DraftKind;
  requiresApproval: boolean;
  publishingPerformed: boolean;
  budgetChanged: boolean;
  title: string;
  objective: string;
  context: Record<string, unknown>;
  draft: Record<string, unknown>;
};

const options: Array<{ kind: DraftKind; label: string }> = [
  { kind: "creative", label: "Novo criativo" },
  { kind: "landing_page", label: "Variação de LP" },
  { kind: "audience", label: "Hipótese de público" },
  { kind: "keyword", label: "Novas keywords" },
];

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function readable(value: unknown): string {
  if (Array.isArray(value)) return value.join(" · ");
  if (value == null) return "—";
  return String(value);
}

export function AssistedMarketingManager() {
  const { user } = useAuth();
  const tenantId = (user as any)?.tenantId ?? "";
  const [loading, setLoading] = useState<DraftKind | null>(null);
  const [result, setResult] = useState<AssistedDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async (kind: DraftKind) => {
    if (!tenantId) return;
    setLoading(kind);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/marketing/launch-command-center/assisted-draft`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ kind, filters: { period: "30d" } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível gerar o rascunho");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar o rascunho");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><BrainCircuit className="h-5 w-5 text-primary" />AI Marketing Manager · Modo Assistido</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Gera hipóteses usando diagnóstico, receita, ROAS, intenção e fit. Nada é publicado nem altera orçamento automaticamente.</p>
          </div>
          <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" />Aprovação obrigatória</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {options.map((option) => (
            <Button key={option.kind} variant="secondary" className="justify-start" disabled={!!loading} onClick={() => generate(option.kind)}>
              {loading === option.kind ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : option.kind === "creative" ? <Sparkles className="mr-2 h-4 w-4" /> : option.kind === "audience" ? <Target className="mr-2 h-4 w-4" /> : <FileText className="mr-2 h-4 w-4" />}
              {option.label}
            </Button>
          ))}
        </div>

        {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        {result && (
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{result.title}</h3>
              <Badge variant="secondary">rascunho</Badge>
              <Badge variant="outline">sem publicação</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{result.objective}</p>
            <div className="grid gap-2 md:grid-cols-2">
              {Object.entries(result.draft).map(([key, value]) => (
                <div key={key} className="rounded-md border bg-background p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{key.replaceAll("_", " ")}</div>
                  <div className="mt-1 text-xs leading-relaxed">{readable(value)}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" />
              Este modo só prepara o rascunho. Publicação, segmentação e qualquer mudança de verba exigem uma etapa explícita de aprovação.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
