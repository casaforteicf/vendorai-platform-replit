import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useListTenants, getListTenantsQueryKey, type Tenant } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { VerticalTemplateEditor } from "@/components/admin/VerticalTemplateEditor";
import {
  Building2, Search, Plus, Settings2, Users, Eye, ExternalLink, Loader2,
  HardHat, Shirt, ShoppingCart, Shield, DraftingCompass, Scissors,
  Stethoscope, Layers, Bot, GitBranch, Tag, Archive, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SegmentTemplate = {
  id: string;
  nome: string;
  descricao?: string | null;
  promptsSugeridos?: Record<string, string> | null;
  funilPadrao?: string[] | null;
  categoriasProdutoSugeridas?: string[] | null;
  ativo: boolean;
  createdAt?: string | null;
};

type TenantAdmin = Tenant & { tenantCode?: string | null; vertical?: string | null };

type SegmentMeta = {
  label?: string;
  icon: React.ElementType;
  color: string;
  route?: string;
};

const SEGMENT_META: Record<string, SegmentMeta> = {
  "Construção & Reforma": { label: "Construção Civil", icon: HardHat, color: "text-amber-700 bg-amber-50 border-amber-200", route: "/obras" },
  "Varejo de Roupas & Acessórios": { label: "Varejo de Moda", icon: Shirt, color: "text-pink-700 bg-pink-50 border-pink-200", route: "/varejo/produtos" },
  "Supermercado": { icon: ShoppingCart, color: "text-emerald-700 bg-emerald-50 border-emerald-200", route: "/supermercado" },
  "Seguros Corporativos": { icon: Shield, color: "text-blue-700 bg-blue-50 border-blue-200", route: "/scout/seguros/renovacoes" },
  "Clínica": { icon: Stethoscope, color: "text-sky-700 bg-sky-50 border-sky-200", route: "/clinic" },
  "Salão de Beleza": { icon: Scissors, color: "text-fuchsia-700 bg-fuchsia-50 border-fuchsia-200", route: "/beauty" },
  "Arquitetura & Design": { label: "Arch — Arquitetura & Design", icon: DraftingCompass, color: "text-violet-700 bg-violet-50 border-violet-200", route: "/arch" },
  "Distribuidora de Materiais de Construção": { icon: Building2, color: "text-orange-700 bg-orange-50 border-orange-200", route: "/scout" },
  "Distribuidora de Alimentos": { icon: ShoppingCart, color: "text-lime-700 bg-lime-50 border-lime-200", route: "/scout" },
  "Distribuidora de Máquinas e Insumos": { icon: Layers, color: "text-cyan-700 bg-cyan-50 border-cyan-200", route: "/scout" },
};

function metaFor(segment: SegmentTemplate): SegmentMeta {
  return SEGMENT_META[segment.nome] ?? {
    icon: Building2,
    color: "text-slate-700 bg-slate-50 border-slate-200",
  };
}

function displayName(segment: SegmentTemplate) {
  return metaFor(segment).label ?? segment.nome;
}

function lines(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export default function AdminVerticals() {
  const { token, setTenantOverride } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "with" | "without" | "archived">("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignTenantId, setAssignTenantId] = useState("");
  const [newSegment, setNewSegment] = useState({ nome: "", descricao: "", funil: "", categorias: "", ativo: true });

  const { data: tenantsRaw = [], isLoading: tenantsLoading } = useListTenants();
  const tenants = tenantsRaw as TenantAdmin[];

  const { data: segments = [], isLoading: segmentsLoading, refetch: refetchSegments } = useQuery<SegmentTemplate[]>({
    queryKey: ["admin-segment-templates"],
    queryFn: async () => {
      const response = await fetch("/api/admin/segment-templates", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível carregar segmentos");
      return data as SegmentTemplate[];
    },
    enabled: Boolean(token),
  });

  const detail = segments.find((segment) => segment.id === detailId) ?? null;
  const linkedTenants = detail ? tenants.filter((tenant) => tenant.vertical === detail.nome) : [];
  const availableTenants = detail ? tenants.filter((tenant) => tenant.status === "active" && tenant.vertical !== detail.nome) : [];

  const filteredSegments = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return segments.filter((segment) => {
      const count = tenants.filter((tenant) => tenant.vertical === segment.nome).length;
      const matchesSearch = !q || segment.nome.toLocaleLowerCase("pt-BR").includes(q) || (segment.descricao ?? "").toLocaleLowerCase("pt-BR").includes(q);
      const matchesFilter = filter === "all"
        ? segment.ativo
        : filter === "with"
          ? segment.ativo && count > 0
          : filter === "without"
            ? segment.ativo && count === 0
            : !segment.ativo;
      return matchesSearch && matchesFilter;
    });
  }, [segments, tenants, search, filter]);

  async function createSegment() {
    if (!newSegment.nome.trim()) {
      toast({ title: "Informe o nome do segmento", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/admin/segment-templates", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: newSegment.nome.trim(),
          descricao: newSegment.descricao.trim() || null,
          funilPadrao: lines(newSegment.funil),
          categoriasProdutoSugeridas: lines(newSegment.categorias),
          promptsSugeridos: {},
          ativo: newSegment.ativo,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível criar o segmento");
      await refetchSegments();
      setCreateOpen(false);
      setNewSegment({ nome: "", descricao: "", funil: "", categorias: "", ativo: true });
      toast({ title: "Segmento criado", description: "Agora configure módulos, agentes, funil e categorias antes de atribuí-lo aos tenants." });
    } catch (error) {
      toast({ title: "Erro ao criar segmento", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function assignSegment() {
    if (!detail || !assignTenantId) return;
    setAssigning(true);
    try {
      const response = await fetch(`/api/tenants/${assignTenantId}/segment-templates/${detail.id}/apply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível aplicar o segmento");
      await qc.invalidateQueries({ queryKey: getListTenantsQueryKey() });
      setAssignTenantId("");
      toast({ title: "Segmento aplicado", description: "Tenant, perfil, funil e prompts sugeridos foram sincronizados." });
    } catch (error) {
      toast({ title: "Erro ao aplicar segmento", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  }

  function previewSegment(segment: SegmentTemplate) {
    const meta = metaFor(segment);
    if (!meta.route) {
      toast({ title: "Preview ainda não definido", description: "Este novo segmento já pode ser usado como template operacional. Defina um módulo/layout específico quando necessário." });
      return;
    }
    setTenantOverride({ id: `__vertical_preview__:${segment.id}`, name: "Preview de layout", vertical: segment.nome, preview: true });
    setLocation(meta.route);
  }

  function accessTenant(segment: SegmentTemplate, tenant: TenantAdmin) {
    const meta = metaFor(segment);
    setTenantOverride({ id: tenant.id, name: tenant.name, vertical: segment.nome });
    setLocation(meta.route ?? "/");
  }

  const loading = tenantsLoading || segmentsLoading;

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-5 pb-24 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            Gestão de Segmentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Crie e configure templates oficiais. O tenant herda segmento, funil e orientações dos agentes sem criar regras paralelas.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 w-full sm:w-auto">
          <Plus className="h-4 w-4" /> Novo Segmento
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar segmento..." className="pl-9" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              ["all", "Ativos"],
              ["with", "Com clientes"],
              ["without", "Sem clientes"],
              ["archived", "Arquivados"],
            ].map(([value, label]) => (
              <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value as typeof filter)} className="shrink-0">
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filteredSegments.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhum segmento encontrado.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filteredSegments.map((segment) => {
            const meta = metaFor(segment);
            const Icon = meta.icon;
            const linked = tenants.filter((tenant) => tenant.vertical === segment.nome);
            const promptCount = Object.values(segment.promptsSugeridos ?? {}).filter(Boolean).length;
            const healthOk = (segment.funilPadrao?.length ?? 0) > 0 && promptCount > 0;
            return (
              <Card key={segment.id} className={cn(!segment.ativo && "opacity-70")}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn("p-2 rounded-lg border shrink-0", meta.color)}><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm sm:text-base break-words">{displayName(segment)}</p>
                        <Badge variant="outline" className={segment.ativo ? "text-emerald-700 border-emerald-200" : "text-slate-600"}>{segment.ativo ? "Ativo" : "Arquivado"}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{segment.descricao || "Sem descrição cadastrada."}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {linked.length} tenant{linked.length === 1 ? "" : "s"}</span>
                        <span className="flex items-center gap-1"><GitBranch className="h-3.5 w-3.5" /> {segment.funilPadrao?.length ?? 0} etapas</span>
                        <span className="flex items-center gap-1"><Bot className="h-3.5 w-3.5" /> {promptCount} agentes</span>
                        <span className={cn("flex items-center gap-1", healthOk ? "text-emerald-600" : "text-amber-600")}>
                          {healthOk ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                          {healthOk ? "Configuração completa" : "Revisar configuração"}
                        </span>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setDetailId(segment.id)} className="gap-1.5 shrink-0">
                      <Settings2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Configurar</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={Boolean(detail)} onOpenChange={(open) => { if (!open) { setDetailId(null); setAssignTenantId(""); } }}>
        {detail && (
          <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
            <div className="p-5 sm:p-6 border-b">
              <SheetHeader>
                <div className="flex items-center gap-3 pr-8">
                  {(() => { const meta = metaFor(detail); const Icon = meta.icon; return <div className={cn("p-2 rounded-lg border", meta.color)}><Icon className="h-5 w-5" /></div>; })()}
                  <div className="min-w-0">
                    <SheetTitle className="text-lg break-words">{displayName(detail)}</SheetTitle>
                    <SheetDescription>{detail.ativo ? "Segmento ativo" : "Segmento arquivado"}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
              <section className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border p-3 text-center"><Users className="h-4 w-4 mx-auto text-muted-foreground" /><p className="text-lg font-bold mt-1">{linkedTenants.length}</p><p className="text-[10px] text-muted-foreground">Tenants</p></div>
                <div className="rounded-lg border p-3 text-center"><Bot className="h-4 w-4 mx-auto text-muted-foreground" /><p className="text-lg font-bold mt-1">{Object.values(detail.promptsSugeridos ?? {}).filter(Boolean).length}</p><p className="text-[10px] text-muted-foreground">Agentes</p></div>
                <div className="rounded-lg border p-3 text-center"><GitBranch className="h-4 w-4 mx-auto text-muted-foreground" /><p className="text-lg font-bold mt-1">{detail.funilPadrao?.length ?? 0}</p><p className="text-[10px] text-muted-foreground">Etapas</p></div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Resumo</h3>
                <p className="text-sm text-muted-foreground">{detail.descricao || "Sem descrição cadastrada."}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  <VerticalTemplateEditor template={detail} onSaved={async () => { await refetchSegments(); }} />
                  <Button variant="outline" className="gap-2" onClick={() => previewSegment(detail)}><Eye className="h-4 w-4" /> Visualizar layout</Button>
                </div>
              </section>

              {(detail.funilPadrao?.length ?? 0) > 0 && (
                <section className="space-y-2"><h3 className="text-sm font-semibold flex items-center gap-2"><GitBranch className="h-4 w-4" /> Funil padrão</h3><div className="flex flex-wrap gap-1.5">{detail.funilPadrao!.map((etapa, index) => <Badge key={`${etapa}-${index}`} variant="secondary">{index + 1}. {etapa}</Badge>)}</div></section>
              )}

              {(detail.categoriasProdutoSugeridas?.length ?? 0) > 0 && (
                <section className="space-y-2"><h3 className="text-sm font-semibold flex items-center gap-2"><Tag className="h-4 w-4" /> Categorias</h3><div className="flex flex-wrap gap-1.5">{detail.categoriasProdutoSugeridas!.map((categoria) => <Badge key={categoria} variant="outline">{categoria}</Badge>)}</div></section>
              )}

              <section className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Tenants vinculados</h3>
                {linkedTenants.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum tenant usando este segmento.</p> : linkedTenants.map((tenant) => (
                  <div key={tenant.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                    <div className="min-w-0"><p className="text-sm font-medium truncate">{tenant.name}</p><p className="text-xs text-muted-foreground"><span className="font-mono">{tenant.tenantCode ?? "VAI —"}</span> · {tenant.status === "active" ? "Ativo" : tenant.status === "suspended" ? "Suspenso" : "Cancelado"}</p></div>
                    <Button size="sm" variant="ghost" className="gap-1.5 shrink-0" onClick={() => accessTenant(detail, tenant)}><ExternalLink className="h-3.5 w-3.5" /> Acessar</Button>
                  </div>
                ))}
              </section>

              {detail.ativo && (
                <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
                  <h3 className="text-sm font-semibold">Aplicar a um tenant</h3>
                  <p className="text-xs text-muted-foreground">Aplica o template oficial sem sobrescrever prompts personalizados já existentes.</p>
                  <select value={assignTenantId} onChange={(e) => setAssignTenantId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Selecionar tenant...</option>
                    {availableTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.tenantCode ?? "sem código"}</option>)}
                  </select>
                  <Button className="w-full" disabled={!assignTenantId || assigning} onClick={() => void assignSegment()}>{assigning && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Aplicar segmento</Button>
                </section>
              )}
            </div>
          </SheetContent>
        )}
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Segmento</DialogTitle>
            <DialogDescription>Crie um template operacional único. Depois você poderá adicionar prompts dos agentes e atribuí-lo aos tenants.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Nome *</Label><Input value={newSegment.nome} onChange={(e) => setNewSegment((current) => ({ ...current, nome: e.target.value }))} placeholder="Ex.: Distribuidora de Ferragens" /></div>
            <div className="space-y-2"><Label>Descrição</Label><Textarea rows={3} value={newSegment.descricao} onChange={(e) => setNewSegment((current) => ({ ...current, descricao: e.target.value }))} placeholder="Para quem é este segmento e qual problema resolve?" /></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Funil padrão</Label><p className="text-xs text-muted-foreground">Uma etapa por linha.</p><Textarea rows={7} value={newSegment.funil} onChange={(e) => setNewSegment((current) => ({ ...current, funil: e.target.value }))} placeholder={"Novo lead\nQualificação\nProposta\nGanho"} /></div>
              <div className="space-y-2"><Label>Categorias sugeridas</Label><p className="text-xs text-muted-foreground">Uma categoria por linha.</p><Textarea rows={7} value={newSegment.categorias} onChange={(e) => setNewSegment((current) => ({ ...current, categorias: e.target.value }))} placeholder={"Categoria A\nCategoria B"} /></div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">Criar como ativo</p><p className="text-xs text-muted-foreground">Desative para salvar como rascunho/arquivado.</p></div><Switch checked={newSegment.ativo} onCheckedChange={(checked) => setNewSegment((current) => ({ ...current, ativo: checked }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancelar</Button><Button onClick={() => void createSegment()} disabled={creating || !newSegment.nome.trim()}>{creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Criar segmento</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
