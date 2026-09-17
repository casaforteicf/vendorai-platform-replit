import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

type AccessStatus = {
  enrolled: boolean;
  mode: "prepaid" | "annual" | "legacy" | "admin";
  active: boolean;
  readOnly: boolean;
  freeAvailable?: boolean;
  remainingHours?: number;
  accessEndsAt?: string | null;
  pass?: { days: number; price: number };
};

export function AccessLicenseBanner() {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const enabled = !!token && !!user?.tenantId && user.platformRole !== "super_admin";
  const statusQuery = useQuery<AccessStatus>({
    queryKey: ["access-license", user?.tenantId],
    enabled,
    refetchInterval: 60_000,
    staleTime: 50_000,
    retry: (failureCount, error) => !String(error).includes("429") && failureCount < 2,
    queryFn: async () => {
      const response = await fetch("/api/access-license/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(response.status === 429 ? "429: too many requests" : "Não foi possível consultar a licença.");
      return response.json();
    },
  });

  const activate = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/access-license/activate-monthly", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Não foi possível ativar o benefício mensal.");
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["access-license"] }),
  });

  const buy = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/access-license/purchases", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar a compra.");
      return data as { invoiceUrl?: string };
    },
    onSuccess: (data) => {
      if (data.invoiceUrl) window.open(data.invoiceUrl, "_blank", "noopener,noreferrer");
    },
  });

  const status = statusQuery.data;
  // Annual remains recognized only for legacy contracts already in the database;
  // it is no longer offered to new customers.
  if (!enabled || !status || !status.enrolled || status.mode === "legacy" || status.mode === "annual") return null;

  const date = status.accessEndsAt
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(status.accessEndsAt))
    : null;

  return (
    <div className={status.readOnly
      ? "shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950"
      : "shrink-0 border-b border-blue-200 bg-blue-50 px-4 py-2 text-blue-950"}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          {status.readOnly ? <AlertTriangle className="mt-0.5 h-5 w-5" /> : <CheckCircle2 className="mt-0.5 h-5 w-5" />}
          <div>
            <p className="text-sm font-semibold">
              {status.readOnly ? "VendorAI Growth em modo somente consulta" : `Growth completo ativo${date ? ` até ${date}` : ""}`}
            </p>
            <p className="text-xs opacity-80">
              {status.readOnly
                ? "Seus dados permanecem disponíveis. Ative seus 5 dias grátis do mês ou compre mais 5 dias para voltar a executar atividades."
                : `${status.remainingHours ?? 0} horas restantes. Growth inclui todos os módulos liberados para sua operação, sem limite de usuários.`}
            </p>
            {(activate.error || buy.error) && <p className="mt-1 text-xs font-medium text-red-700">{String((activate.error || buy.error)?.message)}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {status.freeAvailable && (
            <Button size="sm" onClick={() => activate.mutate()} disabled={activate.isPending}>
              <CalendarClock className="mr-2 h-4 w-4" />
              {activate.isPending ? "Ativando..." : "Ativar 5 dias grátis do mês"}
            </Button>
          )}
          <Button size="sm" variant={status.readOnly ? "default" : "outline"} onClick={() => buy.mutate()} disabled={buy.isPending}>
            <CreditCard className="mr-2 h-4 w-4" />
            {buy.isPending ? "Preparando..." : "Comprar mais 5 dias"}
          </Button>
        </div>
      </div>
    </div>
  );
}
