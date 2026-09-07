import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const TOKEN_KEY = "vendorai_token";

type Campaign = { id: string; nome: string; winningVariant?: string | null; abTestEnabled?: number | null };
type WinnerRow = {
  campaign: Campaign;
  winner: "A" | "B";
  reason: string;
  conversionsA: number;
  conversionsB: number;
  conversionRateA: number;
  conversionRateB: number;
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function readSession() {
  const override = readJson<{ id?: string }>(OVERRIDE_KEY);
  const user = readJson<{ tenantId?: string | null }>(USER_CACHE_KEY);
  return { tenantId: override?.id ?? user?.tenantId ?? "", token: localStorage.getItem(TOKEN_KEY) ?? "" };
}

function isCampaignPath() {
  const path = window.location.pathname.toLowerCase();
  return path === "/campaigns" || path === "/campanhas" || path.endsWith("/campaigns") || path.endsWith("/campanhas");
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function CampaignAbWinnerApprovalBridge() {
  const [visible, setVisible] = useState(isCampaignPath);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<WinnerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const { tenantId, token } = readSession();

  useEffect(() => {
    const sync = () => setVisible(isCampaignPath());
    window.addEventListener("popstate", sync);
    const timer = window.setInterval(sync, 400);
    return () => { window.removeEventListener("popstate", sync); window.clearInterval(timer); };
  }, []);

  async function api(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? `Falha na operação (${response.status})`);
    return body;
  }

  async function load() {
    if (!tenantId || !token) return;
    setLoading(true);
    setMessage("");
    try {
      const campaignBody = await api(`/api/tenants/${tenantId}/campaigns`);
      const campaigns: Campaign[] = Array.isArray(campaignBody)
        ? campaignBody
        : Array.isArray(campaignBody?.data)
          ? campaignBody.data
          : Array.isArray(campaignBody?.campaigns)
            ? campaignBody.campaigns
            : [];

      const candidates = campaigns.filter((campaign) => campaign.abTestEnabled === 1).slice(0, 50);
      const results = await Promise.all(candidates.map(async (campaign) => {
        try {
          const status = await api(`/api/tenants/${tenantId}/marketing/campaigns/${campaign.id}/ab-test`);
          const verdict = status?.verdict;
          if (verdict?.status !== "vencedor" || (verdict?.winner !== "A" && verdict?.winner !== "B")) return null;
          return {
            campaign,
            winner: verdict.winner,
            reason: String(verdict.reason ?? "Vencedor com evidência suficiente."),
            conversionsA: Number(verdict.conversionsA ?? 0),
            conversionsB: Number(verdict.conversionsB ?? 0),
            conversionRateA: Number(verdict.conversionRateA ?? 0),
            conversionRateB: Number(verdict.conversionRateB ?? 0),
          } satisfies WinnerRow;
        } catch {
          return null;
        }
      }));
      setRows(results.filter((item): item is WinnerRow => Boolean(item)));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao procurar vencedores A/B");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible && tenantId && token) void load();
  }, [visible, tenantId, token]);

  useEffect(() => {
    if (open) void load();
  }, [open]);

  async function apply(row: WinnerRow) {
    setApplyingId(row.campaign.id);
    setMessage("");
    try {
      const result = await api(`/api/tenants/${tenantId}/marketing/campaigns/${row.campaign.id}/ab-test/apply-winner`, {
        method: "POST",
      });
      if (!result?.applied) {
        setMessage(result?.reason ?? "O vencedor ainda não pode ser aplicado.");
      } else {
        setMessage(`Variante ${row.winner} aplicada em ${row.campaign.nome}.`);
      }
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao aplicar o vencedor A/B");
    } finally {
      setApplyingId(null);
    }
  }

  const badgeLabel = useMemo(() => rows.length === 1 ? "1 vencedor para aprovar" : `${rows.length} vencedores para aprovar`, [rows.length]);
  if (!visible || rows.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="fixed bottom-36 left-4 z-40 gap-2 rounded-full shadow-lg md:bottom-20 md:left-6"
        onClick={() => setOpen(true)}
      >
        <Trophy className="h-4 w-4" /> {badgeLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trophy className="h-5 w-5" /> Aprovar vencedor A/B</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs leading-5 text-muted-foreground">
              Aqui a decisão continua humana. O sistema só mostra campanhas em que o avaliador já encontrou vencedor pelos guardrails do teste.
            </p>

            {rows.map((row) => (
              <Card key={row.campaign.id}>
                <CardContent className="space-y-3 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{row.campaign.nome}</p>
                        <Badge>Vencedor {row.winner}</Badge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.reason}</p>
                    </div>
                    <Button type="button" size="sm" onClick={() => void apply(row)} disabled={Boolean(applyingId)}>
                      {applyingId === row.campaign.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Aplicar vencedor
                    </Button>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border p-3 text-xs">
                      <p className="font-medium">Variante A</p>
                      <p className="mt-1 text-muted-foreground">{row.conversionsA} conversões · {pct(row.conversionRateA)}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-xs">
                      <p className="font-medium">Variante B</p>
                      <p className="mt-1 text-muted-foreground">{row.conversionsB} conversões · {pct(row.conversionRateB)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Atualizando vencedores…</div>}
            {message && <p className="text-xs font-medium">{message}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
