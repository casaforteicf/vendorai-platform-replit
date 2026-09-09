import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  MousePointerClick,
  Pencil,
  QrCode,
  RefreshCw,
  Share2,
  ShoppingBag,
  Ticket,
  TrendingUp,
  UserPlus,
  Users,
  X,
} from "lucide-react";

type PartnerCommercial = {
  id: string;
  name?: string | null;
  nomeFantasia?: string | null;
  email: string;
  status: string;
  tipoParceiro: string;
  comissaoPercentual?: string | null;
  comissaoRecorrentePercentual?: string | null;
  cupomCodigo?: string | null;
  descontoCupomPercentual?: string | null;
  cupomAtivo: boolean;
  cupomValidoAte?: string | null;
  cupomAplicacao?: string | null;
};

type PartnerAnalytics = {
  partnerId: string;
  clicks: number;
  leads: number;
  orders: number;
  sales: number;
  commissions: number;
  commissionAmount: string;
  paidCommissionAmount: string;
  leadConversionPercent: string;
  saleConversionPercent: string;
  leadToSalePercent: string;
};

const TYPES = [
  ["revendedor", "Revendedor"],
  ["representante", "Representante"],
  ["influenciador", "Influenciador"],
  ["afiliado", "Afiliado"],
  ["indicador", "Indicador"],
  ["agencia", "Agência"],
  ["consultor", "Consultor"],
  ["integrador", "Integrador"],
  ["outro", "Outro"],
] as const;

const APPLICATIONS = [
  ["geral", "Geral"],
  ["implantacao", "Implantação"],
  ["mensalidade", "Mensalidade"],
  ["produto", "Produto"],
  ["servico", "Serviço"],
  ["marketplace", "Marketplace"],
] as const;

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
  return body as T;
}

function pct(value?: string | number | null) {
  return `${Number(value ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function money(value?: string | number | null) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function partnerName(partner: PartnerCommercial) {
  return partner.nomeFantasia || partner.name || partner.email;
}

function referralUrl(partner: PartnerCommercial) {
  if (!partner.cupomCodigo) return "";
  const productionBase = window.location.hostname.endsWith("appvendorai.com")
    ? "https://appvendorai.com/"
    : `${window.location.origin}/`;
  const url = new URL(productionBase);
  url.searchParams.set("ref", partner.cupomCodigo);
  url.searchParams.set("utm_source", "partner");
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", `partner_${partner.cupomCodigo.toLowerCase()}`);
  return url.toString();
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function FunnelMetric({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export function PartnerCommercialManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [linkPartner, setLinkPartner] = useState<PartnerCommercial | null>(null);

  const query = useQuery<PartnerCommercial[]>({
    queryKey: ["admin-partners-commercial"],
    queryFn: () => request("/api/admin/partners-commercial"),
  });
  const analyticsQuery = useQuery<PartnerAnalytics[]>({
    queryKey: ["admin-partners-commercial-analytics"],
    queryFn: () => request("/api/admin/partners-commercial/analytics"),
    retry: false,
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      request(`/api/admin/partners/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-partners-commercial"] });
      queryClient.invalidateQueries({ queryKey: ["admin-partners-commercial-analytics"] });
      setEditingId(null);
      setDraft({});
      toast({ title: "Regras comerciais atualizadas." });
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const partners = query.data ?? [];
  const analytics = analyticsQuery.data ?? [];
  const analyticsByPartner = useMemo(
    () => new Map(analytics.map((row) => [row.partnerId, row])),
    [analytics],
  );

  const stats = useMemo(() => {
    const clicks = analytics.reduce((sum, row) => sum + Number(row.clicks || 0), 0);
    const leads = analytics.reduce((sum, row) => sum + Number(row.leads || 0), 0);
    const sales = analytics.reduce((sum, row) => sum + Number(row.sales || 0), 0);
    return {
      ativos: partners.filter((p) => p.status === "ativo").length,
      influenciadores: partners.filter((p) => p.tipoParceiro === "influenciador").length,
      cupons: partners.filter((p) => p.cupomAtivo && p.cupomCodigo).length,
      descontoMedio: partners.length
        ? partners.reduce((sum, p) => sum + Number(p.descontoCupomPercentual ?? 0), 0) / partners.length
        : 0,
      clicks,
      leads,
      sales,
      conversion: clicks ? (sales / clicks) * 100 : 0,
    };
  }, [partners, analytics]);

  function startEdit(p: PartnerCommercial) {
    setEditingId(p.id);
    setDraft({
      tipoParceiro: p.tipoParceiro ?? "revendedor",
      comissaoPercentual: p.comissaoPercentual ?? "0",
      comissaoRecorrentePercentual: p.comissaoRecorrentePercentual ?? "0",
      cupomCodigo: p.cupomCodigo ?? "",
      descontoCupomPercentual: p.descontoCupomPercentual ?? "0",
      cupomAtivo: Boolean(p.cupomAtivo),
      cupomValidoAte: p.cupomValidoAte ? String(p.cupomValidoAte).slice(0, 10) : "",
      cupomAplicacao: p.cupomAplicacao ?? "geral",
    });
  }

  function save(id: string) {
    update.mutate({
      id,
      data: {
        tipoParceiro: String(draft.tipoParceiro || "revendedor"),
        comissaoPercentual: Number(draft.comissaoPercentual || 0),
        comissaoRecorrentePercentual: Number(draft.comissaoRecorrentePercentual || 0),
        cupomCodigo: String(draft.cupomCodigo || "").trim() || null,
        descontoCupomPercentual: Number(draft.descontoCupomPercentual || 0),
        cupomAtivo: Boolean(draft.cupomAtivo),
        cupomValidoAte: draft.cupomValidoAte ? String(draft.cupomValidoAte) : null,
        cupomAplicacao: String(draft.cupomAplicacao || "geral"),
      },
    });
  }

  async function copyPartnerLink(partner: PartnerCommercial) {
    const url = referralUrl(partner);
    if (!url) {
      toast({ title: "Defina um cupom para gerar o link.", variant: "destructive" });
      return;
    }
    await copyText(url);
    toast({ title: "Link de indicação copiado." });
  }

  async function sharePartnerLink(partner: PartnerCommercial) {
    const url = referralUrl(partner);
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Indicação — ${partnerName(partner)}`, url });
        return;
      } catch {
        // Cancelled shares fall back to copy only when the user tries again.
        return;
      }
    }
    await copyPartnerLink(partner);
  }

  if (query.isLoading) {
    return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Carregando regras comerciais...</div>;
  }

  const selectedLink = linkPartner ? referralUrl(linkPartner) : "";
  const selectedAnalytics = linkPartner ? analyticsByPartner.get(linkPartner.id) : undefined;
  const qrImage = selectedLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=280x280&format=svg&data=${encodeURIComponent(selectedLink)}`
    : "";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FunnelMetric label="Cliques indicados" value={stats.clicks} icon={MousePointerClick} />
        <FunnelMetric label="Leads indicados" value={stats.leads} icon={UserPlus} />
        <FunnelMetric label="Vendas atribuídas" value={stats.sales} icon={ShoppingBag} />
        <FunnelMetric label="Conversão clique → venda" value={pct(stats.conversion)} icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <div className="rounded-lg bg-muted/50 px-3 py-2"><span className="text-muted-foreground">Ativos</span><strong className="ml-2">{stats.ativos}</strong></div>
        <div className="rounded-lg bg-muted/50 px-3 py-2"><span className="text-muted-foreground">Influenciadores</span><strong className="ml-2">{stats.influenciadores}</strong></div>
        <div className="rounded-lg bg-muted/50 px-3 py-2"><span className="text-muted-foreground">Cupons ativos</span><strong className="ml-2">{stats.cupons}</strong></div>
        <div className="rounded-lg bg-muted/50 px-3 py-2"><span className="text-muted-foreground">Desconto médio</span><strong className="ml-2">{pct(stats.descontoMedio)}</strong></div>
      </div>

      {analyticsQuery.isError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          O painel de performance ainda está aguardando a estrutura de métricas do banco. As regras comerciais continuam disponíveis normalmente.
        </div>
      )}

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2"><Users className="h-4 w-4" /></div>
          <div>
            <h3 className="font-semibold">Parceiros & Afiliados</h3>
            <p className="text-sm text-muted-foreground">Defina tipo, comissão e cupom; gere link/QR individual e acompanhe o funil real de cada parceiro.</p>
          </div>
        </div>

        <div className="space-y-3 sm:hidden">
          {partners.map((p) => {
            const editing = editingId === p.id;
            const metric = analyticsByPartner.get(p.id);
            return (
              <div key={p.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-medium truncate">{partnerName(p)}</p><p className="text-xs text-muted-foreground truncate">{p.email}</p></div>
                  <Badge variant="secondary" className="capitalize">{p.tipoParceiro}</Badge>
                </div>
                {!editing ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-xs text-muted-foreground">Comissão</p><p>{pct(p.comissaoPercentual)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Recorrente</p><p>{pct(p.comissaoRecorrentePercentual)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Cupom</p><p>{p.cupomCodigo || "—"}</p></div>
                      <div><p className="text-xs text-muted-foreground">Desconto</p><p>{pct(p.descontoCupomPercentual)}</p></div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 rounded-lg bg-muted/40 p-2 text-center">
                      <div><p className="text-[10px] text-muted-foreground">Cliques</p><p className="font-semibold">{metric?.clicks ?? 0}</p></div>
                      <div><p className="text-[10px] text-muted-foreground">Leads</p><p className="font-semibold">{metric?.leads ?? 0}</p></div>
                      <div><p className="text-[10px] text-muted-foreground">Vendas</p><p className="font-semibold">{metric?.sales ?? 0}</p></div>
                      <div><p className="text-[10px] text-muted-foreground">Conv.</p><p className="font-semibold">{pct(metric?.saleConversionPercent)}</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" disabled={!p.cupomCodigo} onClick={() => setLinkPartner(p)}><Link2 className="mr-2 h-3.5 w-3.5" />Link & QR</Button>
                      <Button variant="outline" size="sm" onClick={() => startEdit(p)}><Pencil className="mr-2 h-3.5 w-3.5" />Editar</Button>
                    </div>
                  </>
                ) : (
                  <Editor draft={draft} setDraft={setDraft} onSave={() => save(p.id)} onCancel={() => setEditingId(null)} busy={update.isPending} />
                )}
              </div>
            );
          })}
        </div>

        <div className="hidden sm:block overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow><TableHead>Parceiro</TableHead><TableHead>Tipo</TableHead><TableHead>Comissão</TableHead><TableHead>Cupom</TableHead><TableHead>Desconto</TableHead><TableHead>Funil</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {partners.map((p) => {
                const editing = editingId === p.id;
                const metric = analyticsByPartner.get(p.id);
                return editing ? (
                  <TableRow key={p.id}><TableCell colSpan={7}><Editor draft={draft} setDraft={setDraft} onSave={() => save(p.id)} onCancel={() => setEditingId(null)} busy={update.isPending} /></TableCell></TableRow>
                ) : (
                  <TableRow key={p.id}>
                    <TableCell><div><p className="font-medium">{partnerName(p)}</p><p className="text-xs text-muted-foreground">{p.email}</p></div></TableCell>
                    <TableCell className="capitalize">{p.tipoParceiro}</TableCell>
                    <TableCell><div>{pct(p.comissaoPercentual)}</div><div className="text-[10px] text-muted-foreground">rec. {pct(p.comissaoRecorrentePercentual)}</div></TableCell>
                    <TableCell>{p.cupomCodigo ? <Badge variant="outline" className="gap-1"><Ticket className="h-3 w-3" />{p.cupomCodigo}</Badge> : "—"}</TableCell>
                    <TableCell>{pct(p.descontoCupomPercentual)}</TableCell>
                    <TableCell><div className="text-xs whitespace-nowrap">{metric?.clicks ?? 0} cliques → {metric?.leads ?? 0} leads → {metric?.sales ?? 0} vendas</div><div className="text-[10px] text-muted-foreground">Conversão {pct(metric?.saleConversionPercent)}</div></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" disabled={!p.cupomCodigo} onClick={() => setLinkPartner(p)} title="Link e QR"><QrCode className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(p)} title="Editar regras"><Pencil className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!linkPartner} onOpenChange={(open) => !open && setLinkPartner(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Link de indicação{linkPartner ? ` — ${partnerName(linkPartner)}` : ""}</DialogTitle></DialogHeader>
          {linkPartner && selectedLink && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[170px_1fr] sm:items-center">
                <div className="mx-auto rounded-xl border bg-white p-2">
                  <img src={qrImage} alt={`QR Code de ${partnerName(linkPartner)}`} className="h-40 w-40" />
                </div>
                <div className="space-y-2 text-sm">
                  <div className="rounded-lg bg-muted/45 p-3 break-all text-xs">{selectedLink}</div>
                  <p className="text-xs text-muted-foreground">O link identifica automaticamente o parceiro, guarda a indicação por até 30 dias e leva a atribuição até o checkout.</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border p-3 text-center"><p className="text-[10px] text-muted-foreground">Cliques</p><p className="text-xl font-semibold">{selectedAnalytics?.clicks ?? 0}</p></div>
                <div className="rounded-lg border p-3 text-center"><p className="text-[10px] text-muted-foreground">Leads</p><p className="text-xl font-semibold">{selectedAnalytics?.leads ?? 0}</p></div>
                <div className="rounded-lg border p-3 text-center"><p className="text-[10px] text-muted-foreground">Vendas</p><p className="text-xl font-semibold">{selectedAnalytics?.sales ?? 0}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/45 p-3"><span className="text-muted-foreground">Clique → venda</span><strong className="float-right">{pct(selectedAnalytics?.saleConversionPercent)}</strong></div>
                <div className="rounded-lg bg-muted/45 p-3"><span className="text-muted-foreground">Lead → venda</span><strong className="float-right">{pct(selectedAnalytics?.leadToSalePercent)}</strong></div>
                <div className="rounded-lg bg-muted/45 p-3"><span className="text-muted-foreground">Comissão gerada</span><strong className="float-right">{money(selectedAnalytics?.commissionAmount)}</strong></div>
                <div className="rounded-lg bg-muted/45 p-3"><span className="text-muted-foreground">Comissão paga</span><strong className="float-right">{money(selectedAnalytics?.paidCommissionAmount)}</strong></div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button variant="outline" size="sm" onClick={() => void copyPartnerLink(linkPartner)}><Copy className="mr-2 h-4 w-4" />Copiar</Button>
                <Button variant="outline" size="sm" onClick={() => void sharePartnerLink(linkPartner)}><Share2 className="mr-2 h-4 w-4" />Compartilhar</Button>
                <Button variant="outline" size="sm" onClick={() => window.open(selectedLink, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-2 h-4 w-4" />Abrir</Button>
                <Button size="sm" onClick={() => setLinkPartner(null)}><Check className="mr-2 h-4 w-4" />Concluir</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Editor({ draft, setDraft, onSave, onCancel, busy }: { draft: Record<string, string | boolean>; setDraft: (v: Record<string, string | boolean>) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  const set = (key: string, value: string | boolean) => setDraft({ ...draft, [key]: value });
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <div><label className="text-xs font-medium">Tipo</label><Select value={String(draft.tipoParceiro || "revendedor")} onValueChange={(v) => set("tipoParceiro", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
      <div><label className="text-xs font-medium">Comissão %</label><Input inputMode="decimal" value={String(draft.comissaoPercentual ?? "0")} onChange={(e) => set("comissaoPercentual", e.target.value)} /></div>
      <div><label className="text-xs font-medium">Comissão recorrente %</label><Input inputMode="decimal" value={String(draft.comissaoRecorrentePercentual ?? "0")} onChange={(e) => set("comissaoRecorrentePercentual", e.target.value)} /></div>
      <div><label className="text-xs font-medium">Cupom</label><Input value={String(draft.cupomCodigo ?? "")} onChange={(e) => set("cupomCodigo", e.target.value.toUpperCase())} placeholder="EX.: MARCOS10" /></div>
      <div><label className="text-xs font-medium">Desconto %</label><Input inputMode="decimal" value={String(draft.descontoCupomPercentual ?? "0")} onChange={(e) => set("descontoCupomPercentual", e.target.value)} /></div>
      <div><label className="text-xs font-medium">Aplicação</label><Select value={String(draft.cupomAplicacao || "geral")} onValueChange={(v) => set("cupomAplicacao", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{APPLICATIONS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
      <div><label className="text-xs font-medium">Validade</label><Input type="date" value={String(draft.cupomValidoAte ?? "")} onChange={(e) => set("cupomValidoAte", e.target.value)} /></div>
      <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(draft.cupomAtivo)} onChange={(e) => set("cupomAtivo", e.target.checked)} />Cupom ativo</label>
      <div className="flex gap-2 md:col-span-2 lg:col-span-4"><Button size="sm" onClick={onSave} disabled={busy}>{busy ? <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-2 h-3.5 w-3.5" />}Salvar</Button><Button size="sm" variant="outline" onClick={onCancel}><X className="mr-2 h-3.5 w-3.5" />Cancelar</Button></div>
    </div>
  );
}
