import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BrainCircuit, CheckCircle2, Clock } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}` };
}

interface MlStatus {
  totalExemplosRotulados: number;
  ganhos: number;
  perdidos: number;
  minimoNecessario: number;
  minimoPorClasse: number;
  prontoParaTreinar: boolean;
}

function Barra({ atual, minimo, label }: { atual: number; minimo: number; label: string }) {
  const pct = Math.min(100, Math.round((atual / minimo) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{atual} / {minimo}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AdminMlStatus() {
  const { data, isLoading } = useQuery<MlStatus>({
    queryKey: ["admin-ml-status"],
    queryFn: () => fetch("/api/admin/ml-status", { headers: authHeaders() }).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><BrainCircuit className="h-5 w-5" /> Progresso do Modelo de ML</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quanto a feature store já acumulou de exemplo real (leads/negócios que resolveram) — sem isso, nenhum modelo de propensão pode ser treinado de verdade.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Não foi possível carregar.</p>
      ) : (
        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center gap-3">
              {data.prontoParaTreinar ? (
                <>
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  <div>
                    <p className="font-semibold text-emerald-700">Pronto pra treinar!</p>
                    <p className="text-xs text-muted-foreground">Já tem dado suficiente — o microserviço de ML pode treinar o primeiro modelo real quando for implantado.</p>
                  </div>
                </>
              ) : (
                <>
                  <Clock className="h-6 w-6 text-amber-600" />
                  <div>
                    <p className="font-semibold text-amber-700">Ainda acumulando dado</p>
                    <p className="text-xs text-muted-foreground">Continua sozinho, conforme os tenants forem operando (vendas fechando, negócios ganhos/perdidos).</p>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-4">
              <Barra atual={data.totalExemplosRotulados} minimo={data.minimoNecessario} label="Total de exemplos rotulados" />
              <Barra atual={data.ganhos} minimo={data.minimoPorClasse} label="Negócios ganhos" />
              <Barra atual={data.perdidos} minimo={data.minimoPorClasse} label="Negócios perdidos" />
            </div>

            <p className="text-xs text-muted-foreground pt-2 border-t">
              Precisa dos dois — total e mínimo por classe — porque um modelo treinado só com "ganhos" (ou só "perdidos") não aprende a diferenciar nada.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
