import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Check, Pencil, RefreshCw, Ticket, Users, X } from "lucide-react";

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

function pct(value?: string | null) {
  return `${Number(value ?? 0)}%`;
}

export function PartnerCommercialManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});

  const query = useQuery<PartnerCommercial[]>({
    queryKey: ["admin-partners-commercial"],
    queryFn: () => request("/api/admin/partners-commercial"),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      request(`/api/admin/partners/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-partners-commercial"] });
      setEditingId(null);
      setDraft({});
      toast({ title: "Regras comerciais atualizadas." });
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const partners = query.data ?? [];
  const stats = useMemo(() => ({
    ativos: partners.filter((p) => p.status === "ativo").length,
    influenciadores: partners.filter((p) => p.tipoParceiro === "influenciador").length,
    cupons: partners.filter((p) => p.cupomAtivo && p.cupomCodigo).length,
    descontoMedio: partners.length
      ? partners.reduce((sum, p) => sum + Number(p.descontoCupomPercentual ?? 0), 0) / partners.length
      : 0,
  }), [partners]);

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

  if (query.isLoading) {
    return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Carregando regras comerciais...</div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Parceiros ativos</p><p className="mt-1 text-2xl font-semibold">{stats.ativos}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Influenciadores</p><p className="mt-1 text-2xl font-semibold">{stats.influenciadores}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Cupons ativos</p><p className="mt-1 text-2xl font-semibold">{stats.cupons}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Desconto médio</p><p className="mt-1 text-2xl font-semibold">{stats.descontoMedio.toFixed(1)}%</p></div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-lg bg-muted p-2"><Users className="h-4 w-4" /></div>
          <div>
            <h3 className="font-semibold">Parceiros & Afiliados</h3>
            <p className="text-sm text-muted-foreground">Defina tipo, comissão e cupom em um único lugar. Configurações comparativas são sempre em percentual.</p>
          </div>
        </div>

        <div className="space-y-3 sm:hidden">
          {partners.map((p) => {
            const editing = editingId === p.id;
            return (
              <div key={p.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-medium truncate">{p.nomeFantasia || p.name}</p><p className="text-xs text-muted-foreground truncate">{p.email}</p></div>
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
                    <Button variant="outline" size="sm" className="w-full" onClick={() => startEdit(p)}><Pencil className="mr-2 h-3.5 w-3.5" />Editar regras</Button>
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
            <TableHeader><TableRow><TableHead>Parceiro</TableHead><TableHead>Tipo</TableHead><TableHead>Comissão</TableHead><TableHead>Recorrente</TableHead><TableHead>Cupom</TableHead><TableHead>Desconto</TableHead><TableHead>Aplicação</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {partners.map((p) => {
                const editing = editingId === p.id;
                return editing ? (
                  <TableRow key={p.id}><TableCell colSpan={8}><Editor draft={draft} setDraft={setDraft} onSave={() => save(p.id)} onCancel={() => setEditingId(null)} busy={update.isPending} /></TableCell></TableRow>
                ) : (
                  <TableRow key={p.id}>
                    <TableCell><div><p className="font-medium">{p.nomeFantasia || p.name}</p><p className="text-xs text-muted-foreground">{p.email}</p></div></TableCell>
                    <TableCell className="capitalize">{p.tipoParceiro}</TableCell>
                    <TableCell>{pct(p.comissaoPercentual)}</TableCell>
                    <TableCell>{pct(p.comissaoRecorrentePercentual)}</TableCell>
                    <TableCell>{p.cupomCodigo ? <Badge variant="outline" className="gap-1"><Ticket className="h-3 w-3" />{p.cupomCodigo}</Badge> : "—"}</TableCell>
                    <TableCell>{pct(p.descontoCupomPercentual)}</TableCell>
                    <TableCell className="capitalize">{p.cupomAplicacao || "geral"}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
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
