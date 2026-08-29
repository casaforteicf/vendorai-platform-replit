import { useState } from "react";
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
  const [annualOpen, setAnnualOpen] = useState(false);
  const [annualForm, setAnnualForm] = useState({ responsibleName: "", responsibleCpf: "", responsibleRole: "", responsibleEmail: "", accepted: false });
  const enabled = !!token && !!user?.tenantId && user.platformRole !== "super_admin";
  const statusQuery = useQuery<AccessStatus>({
    queryKey: ["access-license", user?.tenantId],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const response = await fetch("/api/access-license/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Não foi possível consultar a licença.");
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

  const annualContract = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/access-license/annual-contract", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(annualForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível registrar o contrato.");
      return data;
    },
    onSuccess: () => setAnnualOpen(false),
  });

  const status = statusQuery.data;
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
              {status.readOnly ? "VendorAI em modo somente consulta" : `Acesso completo ativo${date ? ` até ${date}` : ""}`}
            </p>
            <p className="text-xs opacity-80">
              {status.readOnly
                ? "Seus dados permanecem disponíveis. Ative seus 5 dias grátis ou compre mais 5 dias para voltar a executar atividades."
                : `${status.remainingHours ?? 0} horas restantes. Antecipe a renovação sem perder os dias atuais.`}
            </p>
            {(activate.error || buy.error) && <p className="mt-1 text-xs font-medium text-red-700">{String((activate.error || buy.error)?.message)}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {status.freeAvailable && (
            <Button size="sm" onClick={() => activate.mutate()} disabled={activate.isPending}>
              <CalendarClock className="mr-2 h-4 w-4" />
              {activate.isPending ? "Ativando..." : "Ativar 5 dias grátis"}
            </Button>
          )}
          <Button size="sm" variant={status.readOnly ? "default" : "outline"} onClick={() => buy.mutate()} disabled={buy.isPending}>
            <CreditCard className="mr-2 h-4 w-4" />
            {buy.isPending ? "Preparando..." : "Mais 5 dias — R$ 399"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAnnualOpen(true)}>Contrato de 1 ano</Button>
        </div>
      </div>
      {annualOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="annual-contract-title">
          <form
            className="w-full max-w-lg rounded-2xl bg-background p-6 text-foreground shadow-2xl"
            onSubmit={(event) => { event.preventDefault(); annualContract.mutate(); }}
          >
            <h2 id="annual-contract-title" className="text-lg font-semibold">Licença VendorAI por 1 ano</h2>
            <p className="mt-1 text-sm text-muted-foreground">Acesso completo e contínuo por 12 meses, com a mensalidade comercial já definida para sua empresa.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input required aria-label="Nome do responsável" placeholder="Nome do responsável" className="rounded-lg border bg-background px-3 py-2 text-sm" value={annualForm.responsibleName} onChange={(e) => setAnnualForm((v) => ({ ...v, responsibleName: e.target.value }))} />
              <input required aria-label="CPF do responsável" placeholder="CPF do responsável" inputMode="numeric" className="rounded-lg border bg-background px-3 py-2 text-sm" value={annualForm.responsibleCpf} onChange={(e) => setAnnualForm((v) => ({ ...v, responsibleCpf: e.target.value }))} />
              <input required aria-label="Cargo" placeholder="Cargo" className="rounded-lg border bg-background px-3 py-2 text-sm" value={annualForm.responsibleRole} onChange={(e) => setAnnualForm((v) => ({ ...v, responsibleRole: e.target.value }))} />
              <input required type="email" aria-label="E-mail" placeholder="E-mail" className="rounded-lg border bg-background px-3 py-2 text-sm" value={annualForm.responsibleEmail} onChange={(e) => setAnnualForm((v) => ({ ...v, responsibleEmail: e.target.value }))} />
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input required type="checkbox" className="mt-1" checked={annualForm.accepted} onChange={(e) => setAnnualForm((v) => ({ ...v, accepted: e.target.checked }))} />
              <span>Declaro que represento a empresa e aceito a licença completa do VendorAI pelo prazo de 12 meses, conforme os termos apresentados.</span>
            </label>
            {annualContract.error ? <p className="mt-3 text-sm text-red-600">{annualContract.error.message}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAnnualOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!annualForm.accepted || annualContract.isPending}>{annualContract.isPending ? "Registrando..." : "Aceitar contrato"}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
