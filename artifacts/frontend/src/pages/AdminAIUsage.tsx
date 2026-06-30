import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListTenants,
  getListTenantsQueryKey,
  useCreateInvite,
  useListInvitesByTenant,
  getListInvitesByTenantQueryKey,
  useGetAdminAIUsage,
  getGetAdminAIUsageQueryKey,
  type Tenant,
  type InviteItem,
  type AdminAIUsage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BrainCircuit,
  Mail,
  Copy,
  Check,
  Loader2,
  Clock,
  UserCheck,
  CreditCard,
  DollarSign,
  Activity,
  Key,
  Hash,
  BarChart3,
} from "lucide-react";

type SortField = "name" | "totalCost" | "totalCalls" | "byokRatio";
type SortDir = "asc" | "desc";

interface TenantRow {
  tenant: Tenant;
  usage: AdminAIUsage["tenantBreakdown"][0] | null;
  isLoading: boolean;
}

function SortButton({
  field,
  current,
  dir,
  onSort,
  children,
}: {
  field: SortField;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
  children: React.ReactNode;
}) {
  const active = current === field;
  return (
    <button
      onClick={() => onSort(field)}
      className="flex items-center gap-1 font-semibold hover:text-foreground transition-colors"
    >
      {children}
      {active ? (
        dir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </button>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function HourlyCapCell({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(1, used / limit) : 0;
  const isNearLimit = pct >= 0.8;
  const isAtLimit = pct >= 1;

  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className={`text-xs font-mono font-medium ${
          isAtLimit
            ? "text-destructive"
            : isNearLimit
            ? "text-amber-600"
            : "text-foreground"
        }`}
      >
        {used} / {limit}
      </span>
      <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isAtLimit
              ? "bg-destructive"
              : isNearLimit
              ? "bg-amber-500"
              : "bg-primary"
          }`}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="flex-shrink-0"
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </Button>
  );
}

function InviteStatusBadge({ invite }: { invite: InviteItem }) {
  if (invite.usedAt) {
    return (
      <Badge variant="secondary" className="text-xs gap-1">
        <UserCheck className="h-3 w-3" />
        Aceito
      </Badge>
    );
  }
  const isExpired = new Date(invite.expiresAt) < new Date();
  if (isExpired) {
    return (
      <Badge variant="destructive" className="text-xs gap-1">
        Expirado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300">
      <Clock className="h-3 w-3" />
      Pendente
    </Badge>
  );
}

function InviteDialog({
  tenant,
  open,
  onClose,
}: {
  tenant: Tenant;
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createInvite = useCreateInvite();

  const { data: invites = [], isLoading: invitesLoading } =
    useListInvitesByTenant(tenant.id, {
      query: { enabled: open, queryKey: getListInvitesByTenantQueryKey(tenant.id) },
    });

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    createInvite.mutate(
      { data: { tenantId: tenant.id, email } },
      {
        onSuccess: (data) => {
          setGeneratedUrl(data.inviteUrl);
          setEmail("");
          queryClient.invalidateQueries({
            queryKey: ["listInvitesByTenant", tenant.id],
          });
        },
        onError: (err) => {
          toast({
            title: "Erro ao gerar convite",
            description: err.message || "Tente novamente.",
            variant: "destructive",
          });
        },
      }
    );
  }

  function handleClose() {
    setEmail("");
    setGeneratedUrl(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Convidar para {tenant.name}
          </DialogTitle>
          <DialogDescription>
            Gere um link de convite com validade de 7 dias. O cliente usará o
            link para criar sua conta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleGenerate} className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="email@cliente.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={createInvite.isPending || !email}
            >
              {createInvite.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Gerar"
              )}
            </Button>
          </div>
        </form>

        {generatedUrl && (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 p-3 space-y-2">
            <p className="text-sm font-medium text-green-800 dark:text-green-400">
              ✓ Link gerado — compartilhe com o cliente:
            </p>
            <div className="flex gap-2 items-center">
              <Input
                readOnly
                value={generatedUrl}
                className="flex-1 text-xs font-mono"
              />
              <CopyButton text={generatedUrl} />
            </div>
          </div>
        )}

        {invites.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Convites anteriores
            </p>
            {invitesLoading ? (
              <div className="h-4 w-full bg-muted animate-pulse rounded" />
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Expira:{" "}
                        {new Date(inv.expiresAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <InviteStatusBadge invite={inv} />
                      {!inv.usedAt && (
                        <CopyButton text={inv.inviteUrl} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminAIUsage() {
  const { user } = useAuth();
  const [sortField, setSortField] = useState<SortField>("totalCost");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [inviteDialogTenant, setInviteDialogTenant] = useState<Tenant | null>(
    null
  );

  const isSuperAdmin = user?.platformRole === "super_admin";

  const { data: tenants = [], isLoading: tenantsLoading } = useListTenants({
    query: { enabled: isSuperAdmin, queryKey: getListTenantsQueryKey() },
  });

  const {
    data: adminUsage,
    isLoading: usageLoading,
  } = useGetAdminAIUsage({
    query: { enabled: isSuperAdmin, queryKey: getGetAdminAIUsageQueryKey() },
  });

  // Merge tenant list with usage data
  const usageByTenant = new Map(
    (adminUsage?.tenantBreakdown ?? []).map((u) => [u.tenantId, u])
  );

  const rows: TenantRow[] = tenants.map((tenant) => ({
    tenant,
    usage: usageByTenant.get(tenant.id) ?? null,
    isLoading: usageLoading,
  }));

  const totalCostUsd = adminUsage?.totalCostUsd ?? 0;
  const totalCalls = adminUsage?.totalCalls ?? 0;
  const tenantsWithUsage = rows.filter(
    (r) => (r.usage?.totalCalls ?? 0) > 0
  ).length;

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    let aVal: string | number;
    let bVal: string | number;
    if (sortField === "name") {
      aVal = a.tenant.name.toLowerCase();
      bVal = b.tenant.name.toLowerCase();
    } else if (sortField === "totalCost") {
      aVal = a.usage?.totalCost ?? 0;
      bVal = b.usage?.totalCost ?? 0;
    } else if (sortField === "totalCalls") {
      aVal = a.usage?.totalCalls ?? 0;
      bVal = b.usage?.totalCalls ?? 0;
    } else {
      // byokRatio
      const aRatio = a.usage && (a.usage.totalCalls ?? 0) > 0
        ? (a.usage.byokCalls ?? 0) / a.usage.totalCalls! : 0;
      const bRatio = b.usage && (b.usage.totalCalls ?? 0) > 0
        ? (b.usage.byokCalls ?? 0) / b.usage.totalCalls! : 0;
      aVal = aRatio;
      bVal = bRatio;
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const allLoading = tenantsLoading || usageLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BrainCircuit className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            AI Usage & Cost
          </h1>
          <p className="text-muted-foreground text-sm">
            Cost governance across all tenants — real usage from AI Gateway
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              Total Cost (USD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allLoading ? (
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-2xl font-bold">${totalCostUsd.toFixed(2)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" />
              Total AI Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allLoading ? (
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-2xl font-bold">{formatNumber(totalCalls)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Tenants with Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allLoading ? (
              <div className="h-8 w-12 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-2xl font-bold">
                {tenantsWithUsage}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  / {tenants.length}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Features Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allLoading ? (
              <div className="h-8 w-12 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-2xl font-bold">
                {adminUsage?.featureBreakdown?.length ?? 0}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Feature Breakdown */}
      {(adminUsage?.featureBreakdown?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cost by Feature
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {adminUsage?.featureBreakdown?.map((f) => (
                <div key={f.feature ?? "unknown"} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="capitalize font-medium">{(f.feature ?? "unknown").replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">${Number(f.totalCost ?? 0).toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground">({f.totalCalls ?? 0} calls)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {tenantsLoading ? (
            <div className="h-32 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sorted.length === 0 ? (
            <p className="h-32 flex items-center justify-center text-muted-foreground text-sm">
              No tenants found.
            </p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="divide-y sm:hidden">
                {sorted.map((row) => {
                  const { tenant, usage } = row;
                  const byokRatio = usage && (usage.totalCalls ?? 0) > 0
                    ? Math.round(((usage.byokCalls ?? 0) / (usage.totalCalls ?? 1)) * 100)
                    : 0;
                  return (
                    <div key={tenant.id} className="px-4 py-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{tenant.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{tenant.slug}</p>
                        </div>
                        <Badge
                          variant={tenant.status === "active" ? "default" : tenant.status === "suspended" ? "destructive" : "secondary"}
                          className="capitalize text-xs shrink-0"
                        >
                          {tenant.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="text-muted-foreground mb-0.5">AI Calls</p>
                          <p className="font-mono font-medium">{usageLoading ? "…" : formatNumber(usage?.totalCalls ?? 0)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Cost (USD)</p>
                          <p className="font-mono font-medium">{usageLoading ? "…" : `$${Number(usage?.totalCost ?? 0).toFixed(2)}`}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">BYOK</p>
                          {usageLoading ? (
                            <p className="text-muted-foreground">…</p>
                          ) : usage && (usage.totalCalls ?? 0) > 0 ? (
                            <p className="flex items-center gap-1 font-mono">
                              <Key className="h-3 w-3 text-muted-foreground" />
                              {byokRatio}%
                            </p>
                          ) : (
                            <p className="text-muted-foreground">—</p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs w-full"
                        onClick={() => setInviteDialogTenant(tenant)}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Convidar
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">
                        <SortButton field="name" current={sortField} dir={sortDir} onSort={handleSort}>
                          Tenant
                        </SortButton>
                      </TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">
                        <SortButton field="totalCalls" current={sortField} dir={sortDir} onSort={handleSort}>
                          AI Calls
                        </SortButton>
                      </TableHead>
                      <TableHead className="text-right pr-6">
                        <SortButton field="totalCost" current={sortField} dir={sortDir} onSort={handleSort}>
                          Cost (USD)
                        </SortButton>
                      </TableHead>
                      <TableHead className="text-right pr-6">
                        <SortButton field="byokRatio" current={sortField} dir={sortDir} onSort={handleSort}>
                          BYOK
                        </SortButton>
                      </TableHead>
                      <TableHead className="text-right pr-6">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((row) => {
                      const { tenant, usage } = row;
                      const byokRatio = usage && (usage.totalCalls ?? 0) > 0
                        ? Math.round(((usage.byokCalls ?? 0) / (usage.totalCalls ?? 1)) * 100)
                        : 0;
                      return (
                        <TableRow key={tenant.id}>
                          <TableCell className="pl-6">
                            <div>
                              <p className="font-medium">{tenant.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">{tenant.slug}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={tenant.status === "active" ? "default" : tenant.status === "suspended" ? "destructive" : "secondary"}
                              className="capitalize text-xs"
                            >
                              {tenant.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {usageLoading ? (
                              <div className="h-4 w-12 bg-muted animate-pulse rounded ml-auto" />
                            ) : (
                              <span className="font-mono">{formatNumber(usage?.totalCalls ?? 0)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            {usageLoading ? (
                              <div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto" />
                            ) : (
                              <span className="font-mono font-medium">${Number(usage?.totalCost ?? 0).toFixed(2)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            {usageLoading ? (
                              <div className="h-4 w-12 bg-muted animate-pulse rounded ml-auto" />
                            ) : usage && (usage.totalCalls ?? 0) > 0 ? (
                              <div className="flex items-center justify-end gap-1">
                                <Key className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs font-mono">{byokRatio}%</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={() => setInviteDialogTenant(tenant)}
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Convidar
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {inviteDialogTenant && (
        <InviteDialog
          tenant={inviteDialogTenant}
          open={!!inviteDialogTenant}
          onClose={() => setInviteDialogTenant(null)}
        />
      )}
    </div>
  );
}
