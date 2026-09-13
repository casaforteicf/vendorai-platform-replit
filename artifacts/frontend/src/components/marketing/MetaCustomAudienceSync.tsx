import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, Users } from "lucide-react";

type AudienceKey =
  | "meta_engaged_30d"
  | "meta_hot_intent_30d"
  | "instagram_dm_30d"
  | "instagram_comments_30d";

type AudienceRow = {
  audience_key: AudienceKey;
  label: string;
  external_audience_id: string | null;
  status: string;
  eligible_count: number;
  synced_count: number;
  last_error: string | null;
  last_synced_at: string | null;
};

type AudienceList = {
  audiences: AudienceRow[];
  supportedKeys: Array<{ key: AudienceKey; label: string }>;
};

function n(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

function statusLabel(status: string | undefined) {
  if (status === "synced") return "Sincronizada";
  if (status === "reconciled_empty") return "Reconciliada e vazia";
  if (status === "error") return "Erro";
  if (status === "no_matchable_contacts") return "Sem contatos utilizáveis";
  return "Não sincronizada";
}

function isReconciled(status: string | undefined) {
  return status === "synced" || status === "reconciled_empty";
}

export function MetaCustomAudienceSync() {
  const { user, tenantOverride, token } = useAuth();
  const tenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [data, setData] = useState<AudienceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<AudienceKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!tenantId || !token) return;
    const response = await fetch(`/api/tenants/${tenantId}/meta-growth/custom-audiences`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Não foi possível carregar as Custom Audiences.");
    setData(await response.json() as AudienceList);
  }

  useEffect(() => {
    let cancelled = false;
    if (!tenantId || !token) return;
    setLoading(true);
    load()
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Falha ao carregar audiências."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantId, token]);

  const byKey = useMemo(() => new Map((data?.audiences ?? []).map((row) => [row.audience_key, row])), [data]);

  async function sync(key: AudienceKey) {
    if (!tenantId || !token || syncing) return;
    setSyncing(key);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/meta-growth/custom-audiences/${key}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({})) as {
        error?: string;
        status?: string;
        uploadedIdentifiers?: number;
        eligibleLeads?: number;
        message?: string;
      };
      if (!response.ok) throw new Error(result.error || "A Meta recusou a sincronização.");
      setMessage(
        result.status === "synced"
          ? `Audiência sincronizada com ${n(result.uploadedIdentifiers)} identificador(es). Nenhuma campanha foi ativada.`
          : result.message || "Audiência analisada; nenhuma campanha foi ativada.",
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao sincronizar audiência.");
    } finally {
      setSyncing(null);
    }
  }

  if (loading) {
    return <Card><CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando sincronização Meta…</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><CardTitle className="text-base">Custom Audiences na Meta</CardTitle></div>
            <p className="mt-1 text-xs text-muted-foreground">Envia somente contatos com consentimento publicitário e identificadores utilizáveis. E-mail/telefone são hashados antes do envio.</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Reconciliação diária · nunca ativa campanha ou orçamento</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          {(data?.supportedKeys ?? []).map((supported) => {
            const row = byKey.get(supported.key);
            const busy = syncing === supported.key;
            const reconciled = isReconciled(row?.status);
            return (
              <div key={supported.key} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{supported.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row?.status === "reconciled_empty"
                        ? "Nenhum contato consentido e elegível no momento; a lista externa foi esvaziada."
                        : row
                          ? `${n(row.eligible_count)} lead(s) elegíveis · ${n(row.synced_count)} identificador(es) enviados`
                          : "Ainda não sincronizada"}
                    </p>
                  </div>
                  <Badge variant={reconciled ? "default" : "outline"}>{statusLabel(row?.status)}</Badge>
                </div>
                {row?.last_synced_at ? <p className="mt-2 text-[11px] text-muted-foreground">Última sincronização: {new Date(row.last_synced_at).toLocaleString("pt-BR")}</p> : null}
                {row?.last_error ? <p className="mt-2 text-xs text-destructive">{row.last_error}</p> : null}
                <Button size="sm" variant="outline" className="mt-3" onClick={() => void sync(supported.key)} disabled={Boolean(syncing)}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : reconciled ? <RefreshCw className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  {reconciled ? "Atualizar audiência" : "Sincronizar na Meta"}
                </Button>
              </div>
            );
          })}
        </div>
        {message ? <p className="rounded-md bg-muted p-3 text-xs">{message}</p> : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
