import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, CreditCard, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type LicenseStatus = {
  enrolled: boolean;
  mode: "legacy" | "prepaid" | "annual";
  status: "active" | "read_only" | "pending_contract";
  active: boolean;
  readOnly: boolean;
  accessEndsAt?: string | null;
  annualEndsAt?: string | null;
  freeAvailable?: boolean;
  remainingHours?: number;
  pass?: { days: number; price: number };
};

type Contract = {
  id: string;
  responsibleName: string;
  responsibleRole: string;
  responsibleEmail: string;
  status: string;
  termsVersion: string;
  acceptedAt?: string | null;
  monthlyAmount?: string | null;
};

type Purchase = {
  id: string;
  status: string;
  days: number;
  amount: string;
  paidAt?: string | null;
  createdAt?: string | null;
};

type AdminLicenseResponse = {
  license: LicenseStatus;
  purchases: Purchase[];
  contracts: Contract[];
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatMoney(value?: string | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

export function AccessLicenseAdminCard({ tenantId }: { tenantId: string }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmEnrollment, setConfirmEnrollment] = useState(false);
  const queryKey = ["admin-access-license", tenantId];

  const licenseQuery = useQuery<AdminLicenseResponse>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/admin/access-license/tenants/${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as AdminLicenseResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao consultar a licença");
      return result;
    },
    enabled: Boolean(tenantId && token),
  });

  const enroll = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/access-license/enroll", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tenantIds: [tenantId] }),
      });
      const result = await response.json() as { enrolled?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao matricular empresa");
      return result;
    },
    onSuccess: async () => {
      setConfirmEnrollment(false);
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: "Empresa matriculada no acesso pré-pago" });
    },
    onError: (error) => toast({
      title: error instanceof Error ? error.message : "Falha ao matricular empresa",
      variant: "destructive",
    }),
  });

  const activateContract = useMutation({
    mutationFn: async (contractId: string) => {
      const response = await fetch(`/api/admin/access-license/contracts/${contractId}/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha ao ativar contrato anual");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: "Contrato anual ativado por 12 meses" });
    },
    onError: (error) => toast({
      title: error instanceof Error ? error.message : "Falha ao ativar contrato",
      variant: "destructive",
    }),
  });

  const data = licenseQuery.data;
  const license = data?.license;
  const pendingContracts = data?.contracts.filter((contract) => contract.status === "pending_payment") ?? [];
  const paidPurchases = data?.purchases.filter((purchase) => purchase.status === "paid") ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Licença de acesso VendorAI
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Acesso completo, ciclos de 5 dias e contrato anual desta empresa.
            </p>
          </div>
          {license && (
            <Badge variant="outline" className={license.active ? "text-emerald-600 border-emerald-200" : "text-orange-600 border-orange-200"}>
              {license.mode === "legacy" ? "Legado — contínuo" : license.mode === "annual" ? "Contrato anual" : license.active ? "Pré-pago ativo" : "Somente leitura"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {licenseQuery.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : licenseQuery.isError || !license ? (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <TriangleAlert className="h-4 w-4" />
            {licenseQuery.error instanceof Error ? licenseQuery.error.message : "Licença indisponível"}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Situação</p>
                <p className="text-sm font-medium mt-1">{license.active ? "Pode gerar atividades" : "Consulta somente"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Acesso até</p>
                <p className="text-sm font-medium mt-1">{license.mode === "legacy" ? "Contínuo" : formatDate(license.accessEndsAt)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Benefício mensal</p>
                <p className="text-sm font-medium mt-1">{license.mode !== "prepaid" ? "Não se aplica" : license.freeAvailable ? "5 dias disponíveis" : "Já utilizado"}</p>
              </div>
            </div>

            {!license.enrolled && (
              <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-4 space-y-3">
                <div className="flex gap-2">
                  <TriangleAlert className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-orange-900">
                    Esta empresa ainda está no acesso legado. Ao matricular no pré-pago, ficará somente leitura até ativar os 5 dias gratuitos do mês ou comprar acesso.
                  </p>
                </div>
                {!confirmEnrollment ? (
                  <Button variant="outline" size="sm" onClick={() => setConfirmEnrollment(true)}>
                    Matricular no pré-pago
                  </Button>
                ) : (
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button size="sm" onClick={() => enroll.mutate()} disabled={enroll.isPending}>
                      {enroll.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Confirmar mudança
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmEnrollment(false)} disabled={enroll.isPending}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            )}

            {pendingContracts.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Aceites anuais aguardando efetivação</p>
                  {pendingContracts.map((contract) => (
                    <div key={contract.id} className="rounded-lg border p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="text-sm">
                        <p className="font-medium">{contract.responsibleName} · {contract.responsibleRole}</p>
                        <p className="text-xs text-muted-foreground">{contract.responsibleEmail} · aceite em {formatDate(contract.acceptedAt)} · {formatMoney(contract.monthlyAmount)}/mês</p>
                      </div>
                      <Button size="sm" onClick={() => activateContract.mutate(contract.id)} disabled={activateContract.isPending}>
                        {activateContract.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        Efetivar 12 meses
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <Separator />
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> {paidPurchases.length} compra(s) paga(s)</span>
              <span>{data?.contracts.length ?? 0} aceite(s) anual(is)</span>
              {license.remainingHours != null && license.mode !== "legacy" && <span>{license.remainingHours} hora(s) restantes</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
