import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Loader2, Pause, Play, RefreshCw, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const TOKEN_KEY = "vendorai_token";

type Variable = "gancho" | "oferta" | "cta" | "formato" | "mensagem";
type CampaignRow = {
  id: string;
  nome: string;
  tipo?: string;
  status?: string;
  mensagem?: string;
  abTestEnabled?: number | null;
  abTestSamplePct?: number | null;
  variantAText?: string | null;
  variantBText?: string | null;
  winningVariant?: string | null;
};
type Verdict = {
  campaignId: string;
  winner: "A" | "B" | null;
  status: "sem_teste" | "coletando" | "inconclusivo" | "vencedor";
  reason: string;
  sampleA: number;
  sampleB: number;
  readsA: number;
  readsB: number;
  conversionsA: number;
  conversionsB: number;
  readRateA: number;
  readRateB: number;
  conversionRateA: number;
  conversionRateB: number;
};
type Experiment = { variable?: Variable; hypothesis?: string; createdAt?: string; baselineMessage?: string };

type StatusResponse = { verdict: Verdict; experiment?: Experiment };

type ConfigureResponse = {
  campaign?: CampaignRow;
  experiment?: Experiment;
  guardrails?: { minPerVariant?: number; minRelativeLift?: number; conversionPriorityAfterTotalConversions?: number };
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

export function CampaignAbTestControl() {
  const [visible, setVisible] = useState(isCampaignPath);
  const [open, setOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [variable, setVariable] = useState<Variable>("gancho");
  const [samplePct, setSamplePct] = useState("30");
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const { tenantId, token } = readSession();

  const selected = useMemo(() => campaigns.find((item) => item.id === campaignId) ?? null, [campaigns, campaignId]);

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

  async function loadCampaigns() {
    if (!tenantId || !token) return;
    setLoading(true);
    setMessage("");
    try {
      const body = await api(`/api/tenants/${tenantId}/campaigns`);
      const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.campaigns) ? body.campaigns : [];
      setCampaigns(rows);
      if (!campaignId && rows[0]?.id) setCampaignId(rows[0].id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao carregar campanhas");
    } finally {
      setLoading(false);
    }
  }

  async function loadStatus(id = campaignId) {
    if (!tenantId || !token || !id) return;
    setLoading(true);
    setMessage("");
    try {
      const body = await api(`/api/tenants/${tenantId}/marketing/campaigns/${id}/ab-test`) as StatusResponse;
      setStatus(body);
      const exp = body.experiment ?? {};
      if (exp.variable) setVariable(exp.variable);
      const row = campaigns.find((item) => item.id === id);
      if (row?.abTestSamplePct) setSamplePct(String(row.abTestSamplePct));
    } catch (err) {
      setStatus(null);
      setMessage(err instanceof Error ? err.message : "Falha ao carregar o teste A/B");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void loadCampaigns();
  }, [open, tenantId, token]);

  useEffect(() => {
    if (open && campaignId) void loadStatus(campaignId);
  }, [campaignId]);

  async function configure() {
    if (!tenantId || !token || !campaignId) return;
    setSaving(true);
    setMessage("");
    try {
      const body = await api(`/api/tenants/${tenantId}/marketing/campaigns/${campaignId}/ab-test/configure`, {
        method: "POST",
        body: JSON.stringify({ variable, samplePct: Number(samplePct) }),
      }) as ConfigureResponse;
      if (body.campaign) {
        setCampaigns((prev) => prev.map((row) => row.id === campaignId ? { ...row, ...body.campaign } : row));
      }
      setMessage("Teste A/B configurado. As variantes já estão prontas para a amostra controlada.");
      await loadStatus(campaignId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao configurar o teste A/B");
    } finally {
      setSaving(false);
    }
  }

  async function stop() {
    if (!tenantId || !token || !campaignId) return;
    setSaving(true);
    setMessage("");
    try {
      await api(`/api/tenants/${tenantId}/marketing/campaigns/${campaignId}/ab-test/stop`, { method: "POST" });
      setCampaigns((prev) => prev.map((row) => row.id === campaignId ? { ...row, abTestEnabled: 0 } : row));
      setMessage("Teste pausado. Histórico e eventual vencedor foram preservados.");
      await loadStatus(campaignId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha ao pausar o teste A/B");
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  const verdict = status?.verdict;
  const active = selected?.abTestEnabled === 1 || (verdict && verdict.status !== "sem_teste");

  return (
    <>
      <Button
        type="button"
        className="fixed bottom-24 left-4 z-40 gap-2 rounded-full shadow-lg md:bottom-6 md:left-6"
        onClick={() => setOpen(true)}
      >
        <FlaskConical className="h-4 w-4" /> Teste A/B
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" /> Experimento A/B controlado</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Card>
              <CardContent className="grid gap-3 pt-5 md:grid-cols-[1.4fr_1fr_140px_auto] md:items-end">
                <div>
                  <label className="text-xs font-medium">Campanha</label>
                  <Select value={campaignId} onValueChange={setCampaignId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">Variável única</label>
                  <Select value={variable} onValueChange={(value) => setVariable(value as Variable)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gancho">Gancho</SelectItem>
                      <SelectItem value="oferta">Oferta</SelectItem>
                      <SelectItem value="cta">CTA</SelectItem>
                      <SelectItem value="formato">Formato</SelectItem>
                      <SelectItem value="mensagem">Mensagem</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">Amostra</label>
                  <Select value={samplePct} onValueChange={setSamplePct}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{[10, 20, 30, 40, 50].map((value) => <SelectItem key={value} value={String(value)}>{value}%</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button type="button" onClick={() => void configure()} disabled={!campaignId || saving || loading}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Gerar teste
                </Button>
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={active ? "default" : "secondary"}>{active ? "Teste ativo" : "Sem teste ativo"}</Badge>
              {verdict && <Badge variant="outline">{verdict.status.replace("_", " ")}</Badge>}
              {verdict?.winner && <Badge className="gap-1"><Trophy className="h-3 w-3" /> Vencedor {verdict.winner}</Badge>}
              <Button type="button" size="sm" variant="ghost" onClick={() => void loadStatus()} disabled={!campaignId || loading}>
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Atualizar leitura
              </Button>
              {active && <Button type="button" size="sm" variant="outline" onClick={() => void stop()} disabled={saving}><Pause className="mr-2 h-3.5 w-3.5" />Pausar teste</Button>}
            </div>

            {status?.experiment?.hypothesis && (
              <Card><CardContent className="pt-5"><p className="text-xs font-semibold">Hipótese</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{status.experiment.hypothesis}</p></CardContent></Card>
            )}

            {verdict && verdict.status !== "sem_teste" && (
              <div className="grid gap-3 md:grid-cols-2">
                {(["A", "B"] as const).map((variant) => {
                  const isA = variant === "A";
                  const sample = isA ? verdict.sampleA : verdict.sampleB;
                  const reads = isA ? verdict.readsA : verdict.readsB;
                  const conversions = isA ? verdict.conversionsA : verdict.conversionsB;
                  const readRate = isA ? verdict.readRateA : verdict.readRateB;
                  const conversionRate = isA ? verdict.conversionRateA : verdict.conversionRateB;
                  const text = isA ? selected?.variantAText : selected?.variantBText;
                  return (
                    <Card key={variant} className={verdict.winner === variant ? "border-primary" : ""}>
                      <CardContent className="space-y-3 pt-5">
                        <div className="flex items-center justify-between"><p className="font-semibold">Variante {variant}</p>{verdict.winner === variant && <Trophy className="h-4 w-4 text-primary" />}</div>
                        {text && <p className="rounded-lg bg-muted/40 p-3 text-xs leading-5">{text}</p>}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-lg border p-2"><p className="text-lg font-semibold">{sample}</p><p className="text-[10px] text-muted-foreground">envios</p></div>
                          <div className="rounded-lg border p-2"><p className="text-lg font-semibold">{pct(readRate)}</p><p className="text-[10px] text-muted-foreground">leitura · {reads}</p></div>
                          <div className="rounded-lg border p-2"><p className="text-lg font-semibold">{pct(conversionRate)}</p><p className="text-[10px] text-muted-foreground">conversão · {conversions}</p></div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {verdict && (
              <div className="rounded-xl border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">Leitura do experimento:</span> {verdict.reason}
                <br />Guardrails: mínimo de 20 envios por variante, conversão priorizada quando houver volume e lift relativo mínimo de 20% para declarar vencedor.
              </div>
            )}

            {message && <p className="text-xs font-medium">{message}</p>}
            {!tenantId || !token ? <p className="text-xs text-destructive">Sessão do tenant não encontrada. Reabra a tela após autenticar.</p> : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
