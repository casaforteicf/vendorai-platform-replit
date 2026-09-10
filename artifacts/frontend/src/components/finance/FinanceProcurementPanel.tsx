import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileCheck2, RefreshCw, ShieldCheck, ShoppingCart, Truck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProcurementSummary = {
  total?: number | string;
  average_match_percent?: number | string;
  matched_percent?: number | string;
  review_percent?: number | string;
  blocked_percent?: number | string;
  fiscal_coverage_percent?: number | string;
  payable_coverage_percent?: number | string;
};

type PurchaseMatch = {
  id: string;
  status: "pending" | "matched" | "review" | "blocked" | "approved" | string;
  purchase_order_id: string;
  receipt_id?: string | null;
  fiscal_document_id?: string | null;
  payable_title_id?: string | null;
  supplier_name?: string | null;
  fiscal_number?: string | null;
  fiscal_status?: string | null;
  payable_status?: string | null;
  purchase_order_status?: string | null;
  purchase_order_date?: string | null;
  purchase_order_match_percent?: number | string | null;
  receipt_match_percent?: number | string | null;
  fiscal_match_percent?: number | string | null;
  payable_match_percent?: number | string | null;
  overall_match_percent?: number | string | null;
  divergences?: unknown;
  updated_at?: string | null;
};

type SupplierScore = {
  supplier_id: string;
  supplier_name?: string | null;
  delivery_percent?: number | string | null;
  quality_percent?: number | string | null;
  fiscal_compliance_percent?: number | string | null;
  price_adherence_percent?: number | string | null;
  reconciliation_percent?: number | string | null;
  overall_score_percent?: number | string | null;
  risk_level?: "low" | "medium" | "high" | "critical" | string | null;
  incidents?: number | string | null;
  last_assessed_at?: string | null;
};

const asNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
};
const pct = (value: unknown) => `${asNumber(value).toFixed(1)}%`;

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  matched: "Compatível",
  review: "Revisão",
  blocked: "Bloqueado",
  approved: "Aprovado",
};

const riskLabels: Record<string, string> = {
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
  critical: "Crítico",
};

function compactDivergences(value: unknown) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).filter(Boolean).slice(0, 4);
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, detail]) => detail !== false && detail != null && detail !== "")
      .map(([key, detail]) => `${key}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`)
      .slice(0, 4);
  }
  return [String(value)];
}

function scoreTone(score: unknown) {
  const value = asNumber(score);
  if (value >= 95) return "secondary" as const;
  if (value >= 85) return "outline" as const;
  return "destructive" as const;
}

function statusTone(status: string) {
  if (status === "blocked") return "destructive" as const;
  if (status === "matched" || status === "approved") return "secondary" as const;
  return "outline" as const;
}

export default function FinanceProcurementPanel({ tenantId }: { tenantId: string }) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const isAdmin = user?.platformRole === "super_admin" || user?.platformRole === "tenant_admin";

  const fetchJson = async <T,>(path: string, fallback?: T): Promise<T> => {
    const response = await fetch(path, { headers });
    if (!response.ok) {
      if (fallback !== undefined) return fallback;
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error ?? "Não foi possível carregar os dados.");
    }
    return response.json();
  };

  const { data: summary = {}, isLoading: loadingSummary } = useQuery<ProcurementSummary>({
    queryKey: ["finance-procurement", tenantId, "summary"],
    enabled: Boolean(tenantId),
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/finance-procurement/summary`, {}),
  });

  const { data: matches = [], isLoading: loadingMatches } = useQuery<PurchaseMatch[]>({
    queryKey: ["finance-procurement", tenantId, "matches", status],
    enabled: Boolean(tenantId),
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/finance-procurement/matches${status === "all" ? "" : `?status=${encodeURIComponent(status)}`}`, []),
  });

  const { data: suppliers = [], isLoading: loadingSuppliers } = useQuery<SupplierScore[]>({
    queryKey: ["finance-procurement", tenantId, "suppliers"],
    enabled: Boolean(tenantId),
    queryFn: () => fetchJson(`/api/tenants/${tenantId}/finance-procurement/suppliers`, []),
  });

  const refreshQueries = () => qc.invalidateQueries({ queryKey: ["finance-procurement", tenantId] });

  const refreshMatch = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/tenants/${tenantId}/finance-procurement/matches/${id}/refresh`, { method: "POST", headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Falha ao recalcular a conferência.");
      return payload;
    },
    onSuccess: () => { refreshQueries(); toast({ title: "Conferência recalculada" }); },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const approveMatch = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/tenants/${tenantId}/finance-procurement/matches/${id}/approve`, { method: "POST", headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "A conferência não pôde ser aprovada.");
      return payload;
    },
    onSuccess: () => { refreshQueries(); toast({ title: "Conferência aprovada" }); },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const refreshSuppliers = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/finance-procurement/suppliers/refresh-scores`, { method: "POST", headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Falha ao atualizar os fornecedores.");
      return payload;
    },
    onSuccess: () => { refreshQueries(); toast({ title: "Scores de fornecedores atualizados" }); },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const riskSummary = useMemo(() => {
    const atRisk = suppliers.filter((supplier) => supplier.risk_level === "high" || supplier.risk_level === "critical").length;
    return suppliers.length ? (atRisk / suppliers.length) * 100 : 0;
  }, [suppliers]);

  const loading = loadingSummary || loadingMatches || loadingSuppliers;

  return <div className="space-y-4 min-w-0">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-primary"/><h2 className="font-semibold text-lg">Compras e fornecedores</h2></div>
        <p className="text-sm text-muted-foreground mt-1">Conferência Pedido → Recebimento → NF → Conta a pagar, com aderência e risco em percentuais.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => refreshQueries()} disabled={loading}><RefreshCw className="h-4 w-4 mr-2"/>Atualizar</Button>
        <Button variant="outline" onClick={() => refreshSuppliers.mutate()} disabled={refreshSuppliers.isPending}><ShieldCheck className="h-4 w-4 mr-2"/>{refreshSuppliers.isPending ? "Calculando..." : "Atualizar scores"}</Button>
      </div>
    </div>

    <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
      <ScoreCard label="Aderência média" value={summary.average_match_percent} />
      <ScoreCard label="Compatíveis" value={summary.matched_percent} />
      <ScoreCard label="Em revisão" value={summary.review_percent} attention />
      <ScoreCard label="Bloqueados" value={summary.blocked_percent} attention />
      <ScoreCard label="Cobertura fiscal" value={summary.fiscal_coverage_percent} />
      <ScoreCard label="Cobertura contas a pagar" value={summary.payable_coverage_percent} />
    </div>

    <div className="grid lg:grid-cols-[1.4fr_.6fr] gap-4">
      <Card className="min-w-0">
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle className="text-base">Conferências de compra</CardTitle><p className="text-xs text-muted-foreground mt-1">Valores financeiros ficam no fluxo operacional; aqui a análise é por aderência %.</p></div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm w-full sm:w-auto" aria-label="Filtrar conferências por status">
            <option value="all">Todos os status</option><option value="pending">Pendentes</option><option value="matched">Compatíveis</option><option value="review">Em revisão</option><option value="blocked">Bloqueados</option><option value="approved">Aprovados</option>
          </select>
        </CardHeader>
        <CardContent className="p-0">
          {loadingMatches ? <div className="py-12 text-center text-sm text-muted-foreground">Carregando conferências...</div> :
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Fornecedor / pedido</th><th>Status</th><th>Pedido %</th><th>Receb. %</th><th>Fiscal %</th><th>Pagar %</th><th>Geral %</th><th className="text-right pr-3">Ações</th></tr></thead>
                <tbody>{matches.map((match) => {
                  const divergences = compactDivergences(match.divergences);
                  return <tr key={match.id} className="border-b last:border-0 align-top">
                    <td className="p-3 max-w-[270px]"><p className="font-medium truncate">{match.supplier_name || "Fornecedor não vinculado"}</p><p className="text-xs text-muted-foreground mt-1">Pedido {match.purchase_order_id.slice(0, 8)} · {match.purchase_order_status || "—"}</p>{match.fiscal_number && <p className="text-xs text-muted-foreground">NF {match.fiscal_number}</p>}{divergences.length > 0 && <div className="mt-2 space-y-1">{divergences.map((item, index) => <p key={`${match.id}-d-${index}`} className="text-xs text-muted-foreground flex gap-1"><AlertTriangle className="h-3 w-3 shrink-0 mt-0.5"/>{item}</p>)}</div>}</td>
                    <td><Badge variant={statusTone(match.status)}>{statusLabels[match.status] ?? match.status}</Badge></td>
                    <td>{pct(match.purchase_order_match_percent)}</td><td>{pct(match.receipt_match_percent)}</td><td>{pct(match.fiscal_match_percent)}</td><td>{pct(match.payable_match_percent)}</td><td><Badge variant={scoreTone(match.overall_match_percent)}>{pct(match.overall_match_percent)}</Badge></td>
                    <td className="text-right pr-3"><div className="inline-flex gap-2"><Button size="sm" variant="outline" onClick={() => refreshMatch.mutate(match.id)} disabled={refreshMatch.isPending}>Recalcular</Button>{isAdmin && (match.status === "matched" || match.status === "review") && <Button size="sm" onClick={() => approveMatch.mutate(match.id)} disabled={approveMatch.isPending}>Aprovar</Button>}</div></td>
                  </tr>;
                })}</tbody>
              </table>
              {!matches.length && <p className="text-center text-muted-foreground py-12">Nenhuma conferência encontrada para este filtro.</p>}
            </div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Radar de fornecedores</CardTitle></CardHeader>
        <CardContent className="space-y-4"><div className="grid grid-cols-2 gap-3"><ScoreCard label="Fornecedores em risco" value={riskSummary} attention/><ScoreCard label="Base avaliada" value={suppliers.length ? 100 : 0}/></div><p className="text-xs text-muted-foreground">Risco alto/crítico considera aderência de entrega, qualidade, fiscal, preço e reconciliação.</p></CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader><CardTitle className="text-base">Score de fornecedores</CardTitle></CardHeader>
      <CardContent className="p-0">{loadingSuppliers ? <div className="py-10 text-center text-sm text-muted-foreground">Carregando fornecedores...</div> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Fornecedor</th><th>Risco</th><th>Entrega %</th><th>Qualidade %</th><th>Fiscal %</th><th>Preço %</th><th>Conciliação %</th><th>Score geral %</th></tr></thead><tbody>{suppliers.map((supplier) => <tr key={supplier.supplier_id} className="border-b last:border-0"><td className="p-3"><p className="font-medium">{supplier.supplier_name || "Fornecedor"}</p>{Number(supplier.incidents ?? 0) > 0 && <p className="text-xs text-muted-foreground mt-1">{supplier.incidents} ocorrência(s) bloqueada(s)</p>}</td><td><Badge variant={supplier.risk_level === "critical" || supplier.risk_level === "high" ? "destructive" : "secondary"}>{riskLabels[supplier.risk_level || ""] ?? supplier.risk_level ?? "—"}</Badge></td><td>{pct(supplier.delivery_percent)}</td><td>{pct(supplier.quality_percent)}</td><td>{pct(supplier.fiscal_compliance_percent)}</td><td>{pct(supplier.price_adherence_percent)}</td><td>{pct(supplier.reconciliation_percent)}</td><td><Badge variant={scoreTone(supplier.overall_score_percent)}>{pct(supplier.overall_score_percent)}</Badge></td></tr>)}</tbody></table>{!suppliers.length && <div className="py-10 text-center text-sm text-muted-foreground"><Truck className="h-5 w-5 mx-auto mb-2"/>Atualize os scores para iniciar a classificação dos fornecedores.</div>}</div>}</CardContent>
    </Card>

    <div className="grid sm:grid-cols-3 gap-3">
      <InfoCard icon={CheckCircle2} title="Conferência automática" text="Diferenças dentro da tolerância seguem como compatíveis; divergências relevantes vão para revisão ou bloqueio." />
      <InfoCard icon={FileCheck2} title="Cobertura documental" text="A tela evidencia em % quanto da carteira já possui documento fiscal e conta a pagar vinculados." />
      <InfoCard icon={ShieldCheck} title="Aprovação auditável" text="A aprovação não apaga divergências nem histórico; somente usuários administrativos podem confirmar." />
    </div>
  </div>;
}

function ScoreCard({ label, value, attention = false }: { label: string; value: unknown; attention?: boolean }) {
  const n = asNumber(value);
  return <div className="rounded-lg border p-3 min-w-0"><p className="text-[11px] text-muted-foreground leading-tight">{label}</p><p className="text-xl font-bold mt-1">{pct(n)}</p>{attention && n > 0 && <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2"><div className="h-full bg-foreground/70" style={{ width: `${n}%` }} /></div>}</div>;
}

function InfoCard({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return <Card><CardContent className="p-4"><Icon className="h-5 w-5 text-primary"/><p className="font-medium mt-3 text-sm">{title}</p><p className="text-xs text-muted-foreground mt-1">{text}</p></CardContent></Card>;
}
