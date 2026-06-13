import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListTenants,
  getListTenantsQueryKey,
  getListIntelligenceAnalysisLogQueryOptions,
  type Tenant,
  type IntelligenceAnalysisLogStats,
} from "@workspace/api-client-react";
import { useQueries } from "@tanstack/react-query";
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
import { ArrowDown, ArrowUp, ArrowUpDown, BrainCircuit, Loader2 } from "lucide-react";

type SortField = "name" | "totalCalls" | "totalTokens";
type SortDir = "asc" | "desc";

interface TenantRow {
  tenant: Tenant;
  stats: IntelligenceAnalysisLogStats | null;
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

export default function AdminAIUsage() {
  const { user } = useAuth();
  const [sortField, setSortField] = useState<SortField>("totalTokens");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const isSuperAdmin = user?.platformRole === "super_admin";

  const { data: tenants = [], isLoading: tenantsLoading } = useListTenants({
    query: { enabled: isSuperAdmin, queryKey: getListTenantsQueryKey() },
  });

  const analysisQueries = useQueries({
    queries: isSuperAdmin
      ? tenants.map((t) =>
          getListIntelligenceAnalysisLogQueryOptions(t.id, { limit: 1 })
        )
      : [],
  });

  const rows: TenantRow[] = tenants.map((tenant, i) => ({
    tenant,
    stats: analysisQueries[i]?.data?.stats ?? null,
    isLoading: analysisQueries[i]?.isLoading ?? false,
  }));

  const totalTokensAll = rows.reduce(
    (sum, r) => sum + (r.stats?.totalTokens ?? 0),
    0
  );
  const totalCallsAll = rows.reduce(
    (sum, r) => sum + (r.stats?.totalCalls ?? 0),
    0
  );
  const tenantsWithUsage = rows.filter(
    (r) => (r.stats?.totalCalls ?? 0) > 0
  ).length;

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      if (sortField === "name") {
        aVal = a.tenant.name.toLowerCase();
        bVal = b.tenant.name.toLowerCase();
      } else if (sortField === "totalCalls") {
        aVal = a.stats?.totalCalls ?? 0;
        bVal = b.stats?.totalCalls ?? 0;
      } else {
        aVal = a.stats?.totalTokens ?? 0;
        bVal = b.stats?.totalTokens ?? 0;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortField, sortDir]);

  const allLoading = tenantsLoading || analysisQueries.some((q) => q.isLoading);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BrainCircuit className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            AI Analysis Usage
          </h1>
          <p className="text-muted-foreground text-sm">
            Token consumption across all tenants — sorted by highest usage
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Tokens Consumed
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allLoading ? (
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-2xl font-bold">{formatNumber(totalTokensAll)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Analysis Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            {allLoading ? (
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-2xl font-bold">{formatNumber(totalCallsAll)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
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
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">
                  <SortButton
                    field="name"
                    current={sortField}
                    dir={sortDir}
                    onSort={handleSort}
                  >
                    Tenant
                  </SortButton>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <SortButton
                    field="totalCalls"
                    current={sortField}
                    dir={sortDir}
                    onSort={handleSort}
                  >
                    Analysis Calls
                  </SortButton>
                </TableHead>
                <TableHead className="text-right pr-6">
                  <SortButton
                    field="totalTokens"
                    current={sortField}
                    dir={sortDir}
                    onSort={handleSort}
                  >
                    Tokens Used
                  </SortButton>
                </TableHead>
                <TableHead className="text-right">Hourly Cap</TableHead>
                <TableHead className="text-right pr-6">Breakdown</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenantsLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-32 text-center text-muted-foreground"
                  >
                    No tenants found.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map(({ tenant, stats, isLoading }) => {
                  const byTrigger = stats?.byTriggeredBy ?? {};
                  return (
                    <TableRow key={tenant.id}>
                      <TableCell className="pl-6">
                        <div>
                          <p className="font-medium">{tenant.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {tenant.slug}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            tenant.status === "active"
                              ? "default"
                              : tenant.status === "suspended"
                              ? "destructive"
                              : "secondary"
                          }
                          className="capitalize text-xs"
                        >
                          {tenant.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isLoading ? (
                          <div className="h-4 w-12 bg-muted animate-pulse rounded ml-auto" />
                        ) : (
                          <span className="font-mono">
                            {formatNumber(stats?.totalCalls ?? 0)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {isLoading ? (
                          <div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto" />
                        ) : (
                          <span className="font-mono font-medium">
                            {formatNumber(stats?.totalTokens ?? 0)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isLoading ? (
                          <div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" />
                        ) : stats ? (
                          <HourlyCapCell
                            used={stats.rollingHourCount}
                            limit={stats.hourlyLimit}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {isLoading ? (
                          <div className="h-4 w-24 bg-muted animate-pulse rounded ml-auto" />
                        ) : Object.keys(byTrigger).length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-col items-end gap-0.5">
                            {Object.entries(byTrigger).map(([trigger, data]) => (
                              <span
                                key={trigger}
                                className="text-xs text-muted-foreground"
                              >
                                <span className="capitalize">{trigger}</span>:{" "}
                                <span className="font-mono">
                                  {formatNumber(data.tokens)}
                                </span>{" "}
                                tok / {data.calls} call
                                {data.calls !== 1 ? "s" : ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
