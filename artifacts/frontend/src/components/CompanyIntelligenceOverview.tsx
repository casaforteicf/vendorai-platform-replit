import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Building2,
  CheckCircle2,
  Palette,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";

type HealthPayload = {
  overallScore: number;
  status: "ready" | "progress" | "initial" | "attention";
  metrics: {
    profile: { score: number; completed: number; total: number };
    businessPlan: { score: number; approvedSections: number; totalSections: number };
    brand: { score: number };
    catalog: { score: number; count: number };
    knowledge: { score: number; count: number };
  };
  sources: {
    importedDocuments: string[];
    extractionConfidence: number | null;
    onboardingSource: string | null;
    lastProfileUpdate: string | null;
    lastBrandUpdate: string | null;
  };
  conflicts: Array<{ key: string; message: string }>;
  recommendations: Array<{
    key: string;
    title: string;
    detail: string;
    action: string;
    href: string;
  }>;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function statusCopy(status: HealthPayload["status"]) {
  if (status === "ready") return { title: "Empresa pronta para operar", detail: "A base principal está consistente e disponível para os agentes." };
  if (status === "attention") return { title: "Existem informações para revisar", detail: "O Vendi encontrou fontes divergentes que podem afetar os agentes." };
  if (status === "progress") return { title: "Sua empresa está ficando mais inteligente", detail: "Já existe uma boa base; complete os pontos abaixo para melhorar a operação." };
  return { title: "Vamos completar a base da empresa", detail: "O Vendi usa estes dados para CRM, prospecção, marketing, propostas e atendimento." };
}

export default function CompanyIntelligenceOverview() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const health = useQuery({
    queryKey: ["company-intelligence-health", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/company-intelligence/health`, {
        headers: authHeaders(),
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((data as { error?: string }).error || `HTTP ${response.status}`);
      return data as HealthPayload;
    },
    staleTime: 30_000,
  });

  if (!tenantId) return null;

  if (health.isLoading) {
    return (
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Vendi está verificando a base da empresa...
        </div>
      </section>
    );
  }

  if (!health.data || health.isError) {
    return (
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Central da Empresa</p>
            <p className="mt-1 text-sm text-muted-foreground">Não foi possível calcular a saúde da empresa agora.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void health.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
        </div>
      </section>
    );
  }

  const data = health.data;
  const copy = statusCopy(data.status);
  const metrics = [
    { key: "profile", label: "Empresa", score: data.metrics.profile.score, detail: `${data.metrics.profile.completed}/${data.metrics.profile.total} essenciais`, Icon: Building2 },
    { key: "plan", label: "Estratégia", score: data.metrics.businessPlan.score, detail: `${data.metrics.businessPlan.approvedSections}/${data.metrics.businessPlan.totalSections} blocos aprovados`, Icon: Target },
    { key: "brand", label: "Marca", score: data.metrics.brand.score, detail: "identidade oficial", Icon: Palette },
    { key: "catalog", label: "Ofertas", score: data.metrics.catalog.score, detail: `${data.metrics.catalog.count} itens ativos`, Icon: Boxes },
    { key: "knowledge", label: "Conhecimento", score: data.metrics.knowledge.score, detail: `${data.metrics.knowledge.count} fontes ativas`, Icon: BookOpen },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b bg-muted/20 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">Central da Empresa</h2>
                <span className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium">
                  {data.overallScore}% preparada
                </span>
              </div>
              <p className="mt-1 font-medium">{copy.title}</p>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{copy.detail}</p>
            </div>
          </div>
          <div className="w-full lg:w-56">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Saúde da empresa</span>
              <strong>{data.overallScore}%</strong>
            </div>
            <Progress value={data.overallScore} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-5">
        {metrics.map(({ key, label, score, detail, Icon }) => (
          <div key={key} className="rounded-xl border bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <Icon className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold">{score}%</span>
            </div>
            <p className="mt-3 text-sm font-semibold">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            <Progress className="mt-3 h-1.5" value={score} />
          </div>
        ))}
      </div>

      {(data.conflicts.length > 0 || data.recommendations.length > 0) && (
        <div className="border-t p-5 sm:p-6">
          {data.conflicts.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-300/60 bg-amber-50/50 p-4 dark:bg-amber-950/10">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold">Vendi encontrou informação divergente</p>
                  {data.conflicts.map((conflict) => (
                    <p key={conflict.key} className="mt-1 text-xs text-muted-foreground">{conflict.message}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Próximas melhorias recomendadas</p>
              <p className="mt-1 text-xs text-muted-foreground">O Vendi prioriza o que mais aumenta a qualidade da operação.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void health.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.recommendations.map((item) => (
              <div key={item.key} className="rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                    <a
                      href={item.href}
                      className="mt-3 inline-flex text-xs font-semibold text-primary hover:underline"
                    >
                      {item.action} →
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground sm:px-6">
        <span>
          {data.sources.importedDocuments.length > 0
            ? `${data.sources.importedDocuments.length} documento(s) usados na implantação`
            : "Nenhum documento de implantação registrado"}
        </span>
        {typeof data.sources.extractionConfidence === "number" && (
          <span>Confiança da última extração: {Math.round(data.sources.extractionConfidence * 100)}%</span>
        )}
      </div>
    </section>
  );
}
