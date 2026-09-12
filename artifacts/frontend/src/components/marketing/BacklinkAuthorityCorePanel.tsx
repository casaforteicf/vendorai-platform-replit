import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

const statusLabels: Record<BacklinkStatus, string> = {
  identified: "Identificada",
  contacted: "Em contato",
  negotiating: "Negociação",
  won: "Conquistada",
  lost: "Perdida",
};

function authHeaders(json = false): HeadersInit {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token")}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export default function BacklinkAuthorityPanel({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<BacklinkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ sourceDomain: "", sourceUrl: "", targetUrl: "", priorityCluster: "", notes: "" });

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/seo/backlinks`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível carregar a rotina de autoridade.");
      setData(await response.json() as BacklinkResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar backlinks.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  const activeCount = useMemo(() => {
    if (!data) return 0;
    return data.summary.byStatus.identified + data.summary.byStatus.contacted + data.summary.byStatus.negotiating;
  }, [data]);

  const create = async () => {
    if (!form.sourceDomain.trim() || !form.targetUrl.trim()) {
      setError("Informe o domínio de origem e a página alvo.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/seo/backlinks`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          sourceDomain: form.sourceDomain.trim(),
          sourceUrl: form.sourceUrl.trim() || null,
          targetUrl: form.targetUrl.trim(),
          priorityCluster: form.priorityCluster.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });
      if (!response.ok) throw new Error("Não foi possível salvar a oportunidade.");
      setForm({ sourceDomain: "", sourceUrl: "", targetUrl: "", priorityCluster: "", notes: "" });
      setShowForm(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar oportunidade.");
    } finally {
      setSaving(false);
    }
  };

  const update = async (item: BacklinkOpportunity, patch: Partial<BacklinkOpportunity>) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/seo/backlinks/${item.id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("Não foi possível atualizar a oportunidade.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar oportunidade.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: BacklinkOpportunity) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/seo/backlinks/${item.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error("Não foi possível excluir a oportunidade.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao excluir oportunidade.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" />Autoridade & Backlinks</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Rotina contínua de conquista de links externos para páginas e clusters prioritários.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading || saving}><RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Atualizar</Button>
            <Button size="sm" onClick={() => setShowForm((value) => !value)}><Plus className="h-3.5 w-3.5 mr-1.5" />Nova oportunidade</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}

        {data && (
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Em andamento</p><p className="mt-1 text-xl font-semibold">{activeCount}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Identificadas</p><p className="mt-1 text-xl font-semibold">{data.summary.byStatus.identified}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Em contato</p><p className="mt-1 text-xl font-semibold">{data.summary.byStatus.contacted}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Negociação</p><p className="mt-1 text-xl font-semibold">{data.summary.byStatus.negotiating}</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Conquistadas</p><p className="mt-1 text-xl font-semibold">{data.summary.byStatus.won}</p></div>
          </div>
        )}

        {showForm && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <input className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Domínio parceiro (ex.: portal.com.br)" value={form.sourceDomain} onChange={(e) => setForm({ ...form, sourceDomain: e.target.value })} />
              <input className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="URL da oportunidade (opcional)" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
              <input className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Página alvo no site" value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} />
              <input className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Cluster prioritário" value={form.priorityCluster} onChange={(e) => setForm({ ...form, priorityCluster: e.target.value })} />
            </div>
            <textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Observações, contato, estratégia ou próximo passo" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button><Button onClick={create} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar</Button></div>
          </div>
        )}

        {loading && !data ? (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando rotina de autoridade…</div>
        ) : data?.opportunities.length ? (
          <div className="rounded-lg border overflow-hidden divide-y">
            {data.opportunities.map((item) => (
              <div key={item.id} className="p-3 space-y-2">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-sm">{item.sourceDomain}</span><Badge variant={item.status === "won" ? "default" : "outline"}>{statusLabels[item.status]}</Badge>{item.priorityCluster && <Badge variant="secondary">{item.priorityCluster}</Badge>}</div>
                    <p className="mt-1 text-xs text-muted-foreground break-all">Alvo: {item.targetUrl}</p>
                    {item.notes && <p className="mt-1 text-sm text-muted-foreground">{item.notes}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="h-9 rounded-md border bg-background px-2 text-sm" value={item.status} disabled={saving} onChange={(e) => void update(item, { status: e.target.value as BacklinkStatus })}>
                      {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    {item.sourceUrl && <Button size="sm" variant="outline" asChild><a href={item.sourceUrl} target="_blank" rel="noreferrer">Origem <ExternalLink className="h-3.5 w-3.5 ml-1" /></a></Button>}
                    {item.liveUrl && <Button size="sm" variant="outline" asChild><a href={item.liveUrl} target="_blank" rel="noreferrer">Link ativo <ExternalLink className="h-3.5 w-3.5 ml-1" /></a></Button>}
                    <Button size="icon" variant="ghost" disabled={saving} onClick={() => void remove(item)} aria-label="Excluir oportunidade"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                {item.status === "won" && !item.liveUrl && (
                  <Button size="sm" variant="outline" onClick={() => {
                    const liveUrl = window.prompt("Cole a URL onde o backlink foi publicado:");
                    if (liveUrl) void update(item, { liveUrl });
                  }}>Registrar URL publicada</Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma oportunidade registrada ainda. Comece pelos portais, parceiros, fornecedores, associações e conteúdos com maior afinidade ao cluster prioritário.</p>
        )}
      </CardContent>
    </Card>
  );
}
