import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, GitMerge, PackagePlus, Plus, RefreshCw, Rocket, ShieldCheck, TestTube2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Improvement = {
  id: string;
  title: string;
  description: string;
  module: string;
  priority: "baixa" | "media" | "alta" | "urgente";
  status: string;
  branch: string | null;
  prNumber: number | null;
  prUrl: string | null;
  homologUrl: string | null;
  productionUrl: string | null;
  packageKey: string | null;
  testStatus: "pending" | "running" | "passed" | "failed";
  testSummary: string | null;
  approvedHomologBy: string | null;
  approvedHomologAt: string | null;
  approvedProductionBy: string | null;
  approvedProductionAt: string | null;
  mergedStagingSha: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  solicitada: "Solicitada",
  em_desenvolvimento: "Em desenvolvimento",
  testando: "Testando",
  pronto_staging: "Pronto para staging",
  em_homologacao: "Em homologação",
  homologado: "Homologado",
  aguardando_producao: "Aguardando produção",
  producao_validada: "Produção validada",
  bloqueada: "Bloqueada",
};

const TEST_LABELS: Record<string, string> = {
  pending: "Pendente",
  running: "Executando",
  passed: "Aprovado",
  failed: "Falhou",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function AdminImprovements() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Improvement | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [packageOpen, setPackageOpen] = useState(false);
  const [packageKey, setPackageKey] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    module: "Plataforma",
    priority: "media",
    branch: "",
    prNumber: "",
    prUrl: "",
    homologUrl: "https://homolog.appvendorai.com",
  });

  const headers = useMemo(() => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }), [token]);

  const query = useQuery<{ items: Improvement[] }>({
    queryKey: ["admin", "improvements"],
    enabled: !!token,
    queryFn: async () => {
      const response = await fetch("/api/admin/improvements", { headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
      return body;
    },
  });

  const github = useQuery<{ ready: boolean; repository?: string; reason?: string }>({
    queryKey: ["admin", "improvements", "github-readiness"],
    enabled: !!token,
    queryFn: async () => {
      const response = await fetch("/api/admin/improvements/github-readiness", { headers });
      return response.json();
    },
    staleTime: 60_000,
  });

  const items = query.data?.items ?? [];
  const selectedItems = items.filter((item) => selected.has(item.id));

  async function action(path: string, payload: unknown, successMessage: string) {
    setBusy(path);
    try {
      const response = await fetch(path, { method: "POST", headers, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207) throw new Error(body?.error ?? `HTTP ${response.status}`);
      const partialFailures = Array.isArray(body?.results) ? body.results.filter((item: any) => !item.ok) : [];
      toast({
        title: partialFailures.length ? "Ação concluída com pendências" : successMessage,
        description: partialFailures.length ? partialFailures.map((item: any) => item.error).join(" • ").slice(0, 500) : undefined,
        variant: partialFailures.length ? "destructive" : "default",
      });
      await qc.invalidateQueries({ queryKey: ["admin", "improvements"] });
      setSelected(new Set());
      return body;
    } catch (error) {
      toast({ title: "Não foi possível concluir", description: error instanceof Error ? error.message : "Falha inesperada", variant: "destructive" });
      throw error;
    } finally {
      setBusy("");
    }
  }

  async function createImprovement() {
    setBusy("create");
    try {
      const payload = {
        title: form.title,
        description: form.description,
        module: form.module,
        priority: form.priority,
        branch: form.branch || null,
        prNumber: form.prNumber ? Number(form.prNumber) : null,
        prUrl: form.prUrl || null,
        homologUrl: form.homologUrl || null,
      };
      const response = await fetch("/api/admin/improvements", { method: "POST", headers, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
      toast({ title: "Melhoria criada" });
      setCreateOpen(false);
      setForm({ title: "", description: "", module: "Plataforma", priority: "media", branch: "", prNumber: "", prUrl: "", homologUrl: "https://homolog.appvendorai.com" });
      await qc.invalidateQueries({ queryKey: ["admin", "improvements"] });
    } catch (error) {
      toast({ title: "Falha ao criar melhoria", description: error instanceof Error ? error.message : "Erro inesperado", variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  async function patch(item: Improvement, payload: Partial<Improvement>) {
    setBusy(`patch-${item.id}`);
    try {
      const response = await fetch(`/api/admin/improvements/${item.id}`, { method: "PATCH", headers, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`);
      await qc.invalidateQueries({ queryKey: ["admin", "improvements"] });
      setDetail((current) => current?.id === item.id ? { ...current, ...payload } as Improvement : current);
    } catch (error) {
      toast({ title: "Falha ao atualizar", description: error instanceof Error ? error.message : "Erro inesperado", variant: "destructive" });
    } finally {
      setBusy("");
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Superadmin</Badge>
            <Badge variant={github.data?.ready ? "default" : "outline"}>
              GitHub {github.data?.ready ? "conectado" : "não conectado"}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Melhorias & Releases</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Acompanhe melhorias, testes, PRs, pacotes, homologação e aprovações para produção em um único fluxo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Atualizar
          </Button>
          <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova melhoria</Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Total", items.length],
          ["Em desenvolvimento", items.filter((item) => ["em_desenvolvimento", "testando", "pronto_staging"].includes(item.status)).length],
          ["Em homologação", items.filter((item) => item.status === "em_homologacao").length],
          ["Aguardando produção", items.filter((item) => item.status === "aguardando_producao").length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-20 flex flex-col gap-3 rounded-2xl border bg-background/95 p-3 shadow-sm backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div className="text-sm font-medium">{selected.size} melhoria(s) selecionada(s)</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPackageOpen(true)}><PackagePlus className="mr-2 h-4 w-4" />Preparar pacote</Button>
            <Button variant="outline" size="sm" onClick={() => action("/api/admin/improvements/approve-homologation", { ids: [...selected] }, "Aprovado para homologação")} disabled={!!busy}>
              <ShieldCheck className="mr-2 h-4 w-4" />Aprovar homologação
            </Button>
            <Button size="sm" onClick={() => action("/api/admin/improvements/merge-homologation", { ids: [...selected], target: "staging" }, "Merge para staging concluído")} disabled={!!busy || github.data?.ready === false}>
              <GitMerge className="mr-2 h-4 w-4" />Merge staging
            </Button>
            <Button variant="outline" size="sm" onClick={() => action("/api/admin/improvements/mark-homologated", { ids: [...selected] }, "Marcado como homologado")} disabled={!!busy}>
              <TestTube2 className="mr-2 h-4 w-4" />Homologado
            </Button>
            <Button variant="outline" size="sm" onClick={() => action("/api/admin/improvements/approve-production", { ids: [...selected] }, "Aprovado para produção")} disabled={!!busy}>
              <Rocket className="mr-2 h-4 w-4" />Aprovar produção
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3"><Checkbox checked={allSelected} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))} /></th>
                <th className="px-3 py-3">Melhoria</th>
                <th className="px-3 py-3">Módulo</th>
                <th className="px-3 py-3">Pacote</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Teste</th>
                <th className="px-3 py-3">PR</th>
                <th className="px-3 py-3">Atualização</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3"><Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggle(item.id)} /></td>
                  <td className="max-w-[360px] px-3 py-3">
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => setDetail(item)}>{item.title}</button>
                    <div className="mt-1 flex gap-2 text-xs text-muted-foreground"><span>{item.priority}</span>{item.branch && <span className="truncate">• {item.branch}</span>}</div>
                  </td>
                  <td className="px-3 py-3">{item.module}</td>
                  <td className="px-3 py-3">{item.packageKey ? <Badge variant="outline">{item.packageKey}</Badge> : "—"}</td>
                  <td className="px-3 py-3"><Badge variant="outline">{STATUS_LABELS[item.status] ?? item.status}</Badge></td>
                  <td className="px-3 py-3">
                    <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => patch(item, { testStatus: item.testStatus === "passed" ? "pending" : "passed" } as any)}>
                      {TEST_LABELS[item.testStatus] ?? item.testStatus}
                    </button>
                  </td>
                  <td className="px-3 py-3">{item.prNumber ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={item.prUrl ?? "#"} target="_blank" rel="noreferrer">#{item.prNumber}<ExternalLink className="h-3 w-3" /></a> : "—"}</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(item.updatedAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDetail(item)}>Abrir melhoria</Button>
                      {item.homologUrl && <Button variant="ghost" size="sm" asChild><a href={item.homologUrl} target="_blank" rel="noreferrer">Homologação<ExternalLink className="ml-1 h-3 w-3" /></a></Button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!query.isLoading && items.length === 0 && (
                <tr><td colSpan={9} className="px-6 py-14 text-center text-muted-foreground">Nenhuma melhoria cadastrada ainda.</td></tr>
              )}
              {query.isLoading && <tr><td colSpan={9} className="px-6 py-14 text-center text-muted-foreground">Carregando melhorias…</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nova melhoria</DialogTitle><DialogDescription>Crie o registro operacional da melhoria. Branch e PR podem ser vinculados agora ou depois.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <Input placeholder="Título da melhoria" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Textarea placeholder="Descrição, objetivo e critérios de aceite" rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder="Módulo" value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })} />
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="urgente">Urgente</option>
              </select>
              <Input placeholder="Branch" value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
              <Input placeholder="Número do PR" inputMode="numeric" value={form.prNumber} onChange={(e) => setForm({ ...form, prNumber: e.target.value })} />
              <Input placeholder="URL do PR" value={form.prUrl} onChange={(e) => setForm({ ...form, prUrl: e.target.value })} />
              <Input placeholder="URL da homologação" value={form.homologUrl} onChange={(e) => setForm({ ...form, homologUrl: e.target.value })} />
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button onClick={createImprovement} disabled={busy === "create" || form.title.trim().length < 3}>Criar melhoria</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={packageOpen} onOpenChange={setPackageOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Preparar pacote</DialogTitle><DialogDescription>Agrupe as {selected.size} melhorias selecionadas em uma única release/deploy.</DialogDescription></DialogHeader>
          <Input placeholder="Ex.: UI-2026.10.01" value={packageKey} onChange={(e) => setPackageKey(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPackageOpen(false)}>Cancelar</Button>
            <Button onClick={async () => { await action("/api/admin/improvements/package", { ids: [...selected], packageKey }, "Pacote criado"); setPackageOpen(false); setPackageKey(""); }} disabled={packageKey.trim().length < 3 || !!busy}>Agrupar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          {detail && <>
            <DialogHeader><DialogTitle>{detail.title}</DialogTitle><DialogDescription>{detail.module} • criada em {formatDate(detail.createdAt)}</DialogDescription></DialogHeader>
            <div className="grid gap-4">
              <div className="rounded-xl border bg-muted/20 p-4 text-sm whitespace-pre-wrap">{detail.description || "Sem descrição."}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Status</p><p className="mt-1 font-medium">{STATUS_LABELS[detail.status] ?? detail.status}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Teste</p><p className="mt-1 font-medium">{TEST_LABELS[detail.testStatus] ?? detail.testStatus}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Branch</p><p className="mt-1 break-all font-mono text-xs">{detail.branch || "—"}</p></div>
                <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Pacote</p><p className="mt-1">{detail.packageKey || "—"}</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                {detail.prUrl && <Button variant="outline" asChild><a href={detail.prUrl} target="_blank" rel="noreferrer">Abrir PR<ExternalLink className="ml-2 h-4 w-4" /></a></Button>}
                {detail.homologUrl && <Button variant="outline" asChild><a href={detail.homologUrl} target="_blank" rel="noreferrer">Abrir homologação<ExternalLink className="ml-2 h-4 w-4" /></a></Button>}
                {detail.productionUrl && <Button variant="outline" asChild><a href={detail.productionUrl} target="_blank" rel="noreferrer">Abrir produção<ExternalLink className="ml-2 h-4 w-4" /></a></Button>}
              </div>
              {detail.testSummary && <div className="rounded-xl border p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Resultado dos testes</p><p className="mt-2 whitespace-pre-wrap text-sm">{detail.testSummary}</p></div>}
            </div>
          </>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
