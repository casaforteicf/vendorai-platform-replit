import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";

const STATUS_LABELS: Record<BacklinkStatus, string> = {
  identified: "Identificada",
  contacted: "Contato iniciado",
  negotiating: "Em andamento",
  won: "Publicada",
  lost: "Descartada",
};

type BacklinkStatus = "identified" | "contacted" | "negotiating" | "won" | "lost";

type BacklinkOpportunity = {
  id: string;
  tenantId: string;
  sourceDomain: string;
  sourceUrl: string | null;
  targetUrl: string;
  priorityCluster: string | null;
  status: BacklinkStatus;
  liveUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  wonAt: string | null;
};

type BacklinkResponse = {
  opportunities: BacklinkOpportunity[];
  summary: {
    total: number;
    byStatus: Record<BacklinkStatus, number>;
  };
};

type FormState = {
  sourceDomain: string;
  sourceUrl: string;
  targetUrl: string;
  priorityCluster: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  sourceDomain: "",
  sourceUrl: "",
  targetUrl: "https://appvendorai.com/",
  priorityCluster: "Marca VendorAI",
  notes: "",
};

const STARTER_SOURCES: Array<Omit<FormState, "notes"> & { notes: string }> = [
  {
    sourceDomain: "g2.com",
    sourceUrl: "https://www.g2.com/categories/crm",
    targetUrl: "https://appvendorai.com/produtos/crm",
    priorityCluster: "CRM com IA",
    notes: "Perfil de software / autoridade de categoria. Prioridade alta.",
  },
  {
    sourceDomain: "capterra.com",
    sourceUrl: "https://www.capterra.com/crm-software/",
    targetUrl: "https://appvendorai.com/produtos/crm",
    priorityCluster: "CRM com IA",
    notes: "Diretório de software. Validar elegibilidade e perfil oficial.",
  },
  {
    sourceDomain: "producthunt.com",
    sourceUrl: "https://www.producthunt.com/",
    targetUrl: "https://appvendorai.com/",
    priorityCluster: "Marca VendorAI",
    notes: "Lançamento / descoberta de produto. Preparar página e ativos oficiais.",
  },
  {
    sourceDomain: "linkedin.com",
    sourceUrl: "https://www.linkedin.com/",
    targetUrl: "https://appvendorai.com/",
    priorityCluster: "Marca VendorAI",
    notes: "Perfil oficial da empresa com domínio canônico e identidade consistente.",
  },
];

function parseStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function decodeTokenTenantId(): string | null {
  try {
    const token = localStorage.getItem("vendorai_token");
    const payload = token?.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    const parsed = JSON.parse(atob(padded)) as { tenantId?: string; tenant_id?: string };
    return parsed.tenantId || parsed.tenant_id || null;
  } catch {
    return null;
  }
}

function currentTenantId() {
  const override = parseStorage<{ id?: string; preview?: boolean }>(OVERRIDE_KEY);
  if (override?.id && !override.preview) return override.id;
  const user = parseStorage<{ tenantId?: string | null }>(USER_CACHE_KEY);
  return user?.tenantId || decodeTokenTenantId();
}

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function compactTarget(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname === "/" ? parsed.hostname : parsed.pathname;
  } catch {
    return url;
  }
}

export function SeoAuthorityTrackingCard() {
  const [tenantId] = useState(() => currentTenantId());
  const [data, setData] = useState<BacklinkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      setError("Não foi possível identificar o tenant atual.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/seo/backlinks`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível carregar Autoridade agora.");
      setData(await response.json() as BacklinkResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar Autoridade.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const uniqueDomains = useMemo(
    () => new Set((data?.opportunities ?? []).filter((item) => item.status === "won").map((item) => item.sourceDomain)).size,
    [data],
  );

  const createOpportunity = async (payload: FormState) => {
    if (!tenantId) return false;
    const response = await fetch(`/api/tenants/${tenantId}/seo/backlinks`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        sourceDomain: payload.sourceDomain.trim().toLowerCase(),
        sourceUrl: payload.sourceUrl.trim() || null,
        targetUrl: payload.targetUrl.trim(),
        priorityCluster: payload.priorityCluster.trim() || null,
        notes: payload.notes.trim() || null,
        status: "identified",
      }),
    });
    if (!response.ok) throw new Error("Não foi possível cadastrar esta oportunidade.");
    return true;
  };

  const submit = async () => {
    if (!form.sourceDomain.trim() || !form.targetUrl.trim()) {
      setError("Informe o domínio de origem e a página-alvo.");
      return;
    }
    setBusy("create");
    setError(null);
    try {
      await createOpportunity(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao cadastrar oportunidade.");
    } finally {
      setBusy(null);
    }
  };

  const seedPriorities = async () => {
    setBusy("seed");
    setError(null);
    try {
      const existing = new Set((data?.opportunities ?? []).map((item) => item.sourceDomain));
      for (const item of STARTER_SOURCES) {
        if (!existing.has(item.sourceDomain)) await createOpportunity(item);
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao adicionar prioridades iniciais.");
    } finally {
      setBusy(null);
    }
  };

  const updateStatus = async (item: BacklinkOpportunity, status: BacklinkStatus) => {
    if (!tenantId) return;
    setBusy(item.id);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/seo/backlinks/${item.id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Não foi possível atualizar o status.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar oportunidade.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!tenantId) return;
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/seo/backlinks/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error("Não foi possível remover a oportunidade.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao remover oportunidade.");
    } finally {
      setBusy(null);
    }
  };

  const opportunities = data?.opportunities ?? [];
  const published = data?.summary.byStatus.won ?? 0;
  const inProgress = (data?.summary.byStatus.contacted ?? 0) + (data?.summary.byStatus.negotiating ?? 0);

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Autoridade e backlinks">
      <div className="flex flex-col gap-3 border-b px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />Autoridade · backlinks</div>
          <p className="mt-1 text-xs text-muted-foreground">Acompanhe fontes relevantes que fortalecem marca, produto e páginas comerciais. Evite diretórios de baixa qualidade e links artificiais.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading || !!busy}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Atualizar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowForm((value) => !value)} disabled={!!busy}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Nova fonte
          </Button>
          <Button size="sm" onClick={seedPriorities} disabled={!!busy}>
            {busy === "seed" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
            Adicionar prioridades
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Fontes mapeadas</p><p className="mt-1 text-xl font-semibold">{data?.summary.total ?? 0}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Em andamento</p><p className="mt-1 text-xl font-semibold">{inProgress}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Links publicados</p><p className="mt-1 text-xl font-semibold">{published}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Domínios únicos</p><p className="mt-1 text-xl font-semibold">{uniqueDomains}</p></div>
        </div>

        {showForm && (
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Input placeholder="dominio.com" value={form.sourceDomain} onChange={(event) => setForm((prev) => ({ ...prev, sourceDomain: event.target.value }))} />
              <Input placeholder="URL da fonte" value={form.sourceUrl} onChange={(event) => setForm((prev) => ({ ...prev, sourceUrl: event.target.value }))} />
              <Input placeholder="Página-alvo" value={form.targetUrl} onChange={(event) => setForm((prev) => ({ ...prev, targetUrl: event.target.value }))} />
              <Input placeholder="Cluster / objetivo" value={form.priorityCluster} onChange={(event) => setForm((prev) => ({ ...prev, priorityCluster: event.target.value }))} />
              <Input placeholder="Observação" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>Cancelar</Button>
              <Button size="sm" onClick={submit} disabled={busy === "create"}>{busy === "create" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Salvar fonte</Button>
            </div>
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando autoridade…</div>
        ) : opportunities.length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-center">
            <p className="text-sm font-medium">Nenhuma fonte de autoridade cadastrada.</p>
            <p className="mt-1 text-xs text-muted-foreground">Comece pelas prioridades recomendadas ou cadastre uma fonte específica deste tenant.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Fonte</th>
                  <th className="px-3 py-2 font-medium">Objetivo</th>
                  <th className="px-3 py-2 font-medium">Página-alvo</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Publicação</th>
                  <th className="px-3 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {opportunities.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium">{item.sourceDomain}</div>
                      {item.sourceUrl && <a className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline" href={item.sourceUrl} target="_blank" rel="noreferrer">Abrir fonte <ExternalLink className="h-3 w-3" /></a>}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{item.priorityCluster || "—"}</td>
                    <td className="px-3 py-3 text-xs"><span title={item.targetUrl}>{compactTarget(item.targetUrl)}</span></td>
                    <td className="px-3 py-3">
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        value={item.status}
                        disabled={busy === item.id}
                        onChange={(event) => void updateStatus(item, event.target.value as BacklinkStatus)}
                      >
                        {(Object.keys(STATUS_LABELS) as BacklinkStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {item.liveUrl ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={item.liveUrl} target="_blank" rel="noreferrer">Ver link <ExternalLink className="h-3 w-3" /></a> : item.status === "won" ? "Confirmada" : "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void remove(item.id)} disabled={busy === item.id} aria-label={`Remover ${item.sourceDomain}`}>
                        {busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}
