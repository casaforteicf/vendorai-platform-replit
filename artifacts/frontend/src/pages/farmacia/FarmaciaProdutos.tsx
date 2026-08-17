import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2, Pill, Loader2, ShieldAlert, Upload, Plug, Download, Copy, Key } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const CATEGORIAS = [
  { value: "medicamento_generico", label: "Medicamento genérico" },
  { value: "medicamento_referencia", label: "Medicamento referência" },
  { value: "medicamento_similar", label: "Medicamento similar" },
  { value: "perfumaria", label: "Perfumaria" },
  { value: "higiene_pessoal", label: "Higiene pessoal" },
  { value: "dermocosmeticos", label: "Dermocosméticos" },
  { value: "infantil", label: "Infantil" },
  { value: "ortopedicos", label: "Ortopédicos" },
  { value: "suplementos", label: "Suplementos" },
  { value: "outros", label: "Outros" },
] as const;

function fmt(v: number | string) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const CSV_TEMPLATE = "erp_id,nome,principio_ativo,categoria,exige_receita,unidade,preco_venda,preco_promocional,estoque,ativo,vende_no_praca_ai,destaque_whatsapp,imagem_url\nMED-001,Paracetamol 500mg,Paracetamol,medicamento_generico,false,un,12.90,10.90,50,true,true,true,";

function parseCsvLine(line: string, separator: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) { current += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) { cells.push(current.trim()); current = ""; }
    else current += char;
  }
  cells.push(current.trim());
  return cells;
}

function csvBoolean(value: string, fallback = false) {
  if (!value) return fallback;
  return ["1", "true", "sim", "yes"].includes(value.trim().toLowerCase());
}

const EMPTY_FORM = {
  nome: "", principioAtivo: "", descricao: "", categoria: "outros" as string,
  exigeReceita: false, unidade: "un", precoVenda: "", precoPromocional: "",
  estoque: 0, ativo: true, destaqueWhatsapp: false,
  posologiaFonteUrl: "", posologiaRevisadaPor: "", posologiaAprovada: false,
  posologia: {
    concentracao: "", formaFarmaceutica: "", viaAdministracao: "", faixaEtaria: "",
    pesoMinimoKg: "", pesoMaximoKg: "", dosePorAdministracao: "", intervaloMinimo: "",
    duracaoMaxima: "", doseMaximaDiaria: "", modoDeUsar: "", contraindicacoes: "",
    interacoes: "", alertas: "",
  },
};

export default function FarmaciaProdutos() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);
  const [importItems, setImportItems] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const QK = ["farmacia-produtos", tenantId, search, catFilter];

  const { data: produtos = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (catFilter !== "todos") params.set("categoria", catFilter);
      return fetch(`/api/tenants/${tenantId}/farmacia/produtos?${params}`, { headers: authHeaders() }).then((r) => r.json());
    },
    enabled: !!tenantId,
  });

  const { data: integration } = useQuery<{ apiKeyEstoque: string | null }>({
    queryKey: ["pharmacy-integration", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/integration-settings`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId && apiOpen,
  });

  const regenerateKey = useMutation({
    mutationFn: () => fetch(`/api/tenants/${tenantId}/integration-settings/regenerate-key`, { method: "POST", headers: authHeaders() }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro ao gerar chave");
      return r.json();
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pharmacy-integration", tenantId] }),
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const importProducts = useMutation({
    mutationFn: () => fetch(`/api/tenants/${tenantId}/farmacia/produtos/import`, {
      method: "POST", headers: authHeaders(), body: JSON.stringify({ items: importItems }),
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "Erro ao importar");
      return data as { created: number; updated: number; failed: number };
    }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["farmacia-produtos"] });
      toast({ title: "Importação concluída", description: `${result.created} criados, ${result.updated} atualizados e ${result.failed} com erro.` });
      setImportOpen(false); setImportItems([]); setImportFileName("");
    },
    onError: (e: any) => toast({ title: "Erro ao importar", description: e.message, variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: (payload: any) => {
      const url = editing
        ? `/api/tenants/${tenantId}/farmacia/produtos/${editing.id}`
        : `/api/tenants/${tenantId}/farmacia/produtos`;
      return fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmacia-produtos"] });
      toast({ title: editing ? "Produto atualizado." : "Produto criado." });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/tenants/${tenantId}/farmacia/produtos/${id}`, { method: "DELETE", headers: authHeaders() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["farmacia-produtos"] });
      toast({ title: "Produto removido." });
      setDeleteTarget(null);
    },
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "modelo-produtos-farmacia.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  async function readCsv(file: File) {
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) throw new Error("O CSV precisa ter cabeçalho e ao menos um produto.");
    const separator = lines[0].includes(";") ? ";" : ",";
    const headers = parseCsvLine(lines[0], separator).map((h) => h.trim().toLowerCase());
    const required = ["erp_id", "nome", "preco_venda", "estoque"];
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length) throw new Error(`Colunas obrigatórias ausentes: ${missing.join(", ")}`);
    const value = (cells: string[], name: string) => cells[headers.indexOf(name)] ?? "";
    const items = lines.slice(1).map((line) => {
      const cells = parseCsvLine(line, separator);
      const decimal = (name: string) => {
        const raw = value(cells, name).trim();
        if (raw.includes(",") && raw.includes(".")) return raw.replace(/\./g, "").replace(",", ".");
        return raw.replace(",", ".");
      };
      return {
        erpId: value(cells, "erp_id"), nome: value(cells, "nome"),
        principioAtivo: value(cells, "principio_ativo") || null,
        categoria: value(cells, "categoria") || "outros",
        exigeReceita: csvBoolean(value(cells, "exige_receita")), unidade: value(cells, "unidade") || "un",
        precoVenda: decimal("preco_venda"), precoPromocional: decimal("preco_promocional") || null,
        estoque: Number(value(cells, "estoque")), ativo: csvBoolean(value(cells, "ativo"), true),
        vendeNoPracaAi: csvBoolean(value(cells, "vende_no_praca_ai")),
        destaqueWhatsapp: csvBoolean(value(cells, "destaque_whatsapp")), imagemUrl: value(cells, "imagem_url") || null,
      };
    });
    setImportItems(items); setImportFileName(file.name);
  }
  function openEdit(p: any) {
    setEditing(p);
    setForm({
      nome: p.nome ?? "", principioAtivo: p.principioAtivo ?? "", descricao: p.descricao ?? "",
      categoria: p.categoria ?? "outros", exigeReceita: !!p.exigeReceita, unidade: p.unidade ?? "un",
      precoVenda: String(p.precoVenda ?? ""), precoPromocional: p.precoPromocional != null ? String(p.precoPromocional) : "",
      estoque: p.estoque ?? 0, ativo: p.ativo !== false, destaqueWhatsapp: !!p.destaqueWhatsapp,
      posologiaFonteUrl: p.posologiaFonteUrl ?? "", posologiaRevisadaPor: p.posologiaRevisadaPor ?? "",
      posologiaAprovada: !!p.posologiaAprovada,
      posologia: { ...EMPTY_FORM.posologia, ...(p.posologia ?? {}), pesoMinimoKg: p.posologia?.pesoMinimoKg ?? "", pesoMaximoKg: p.posologia?.pesoMaximoKg ?? "" },
    });
    setDialogOpen(true);
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome || !form.precoVenda) {
      toast({ title: "Nome e preço são obrigatórios", variant: "destructive" });
      return;
    }
    save.mutate({
      ...form,
      estoque: Number(form.estoque),
      precoPromocional: form.precoPromocional || null,
      posologiaFonteUrl: form.posologiaFonteUrl || null,
      posologiaRevisadaPor: form.posologiaRevisadaPor || null,
      posologia: {
        ...form.posologia,
        pesoMinimoKg: form.posologia.pesoMinimoKg === "" ? undefined : Number(form.posologia.pesoMinimoKg),
        pesoMaximoKg: form.posologia.pesoMaximoKg === "" ? undefined : Number(form.posologia.pesoMaximoKg),
      },
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Pill className="h-5 w-5" /> Catálogo de Produtos
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{produtos.length} produto{produtos.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Importar produtos
          </Button>
          <Button size="sm" variant="outline" onClick={() => setApiOpen(true)}>
            <Plug className="h-4 w-4 mr-1" /> Integrar API
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Novo Produto
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar produto..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as categorias</SelectItem>
            {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : produtos.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <Pill className="h-12 w-12 opacity-20" />
          <p className="text-sm">Nenhum produto encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {produtos.map((p: any) => (
            <Card key={p.id} className={`relative ${!p.ativo ? "opacity-50" : ""}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm leading-tight line-clamp-2">{p.nome}</p>
                    {p.principioAtivo && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{p.principioAtivo}</p>
                    )}
                  </div>
                  {p.exigeReceita && (
                    <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200 shrink-0 gap-0.5">
                      <ShieldAlert className="h-3 w-3" /> Receita
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {p.precoPromocional ? (
                    <>
                      <span className="text-xs line-through text-muted-foreground">{fmt(p.precoVenda)}</span>
                      <span className="text-sm font-bold text-emerald-600">{fmt(p.precoPromocional)}</span>
                    </>
                  ) : (
                    <span className="text-sm font-bold">{fmt(p.precoVenda)}</span>
                  )}
                  <span className="text-xs text-muted-foreground">/{p.unidade}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Estoque: {p.estoque}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Importar produtos da farmácia</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Importe até 1.000 produtos. O campo <code>erp_id</code> identifica o produto: se já existir, preço e estoque serão atualizados.</p>
            <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="h-4 w-4 mr-2" />Baixar modelo CSV</Button>
            <label className="block rounded-lg border-2 border-dashed p-7 text-center cursor-pointer hover:bg-muted/40">
              <Upload className="h-7 w-7 mx-auto mb-2 text-muted-foreground" />
              <span className="text-sm font-medium">{importFileName || "Selecionar arquivo CSV"}</span>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return;
                try { await readCsv(file); } catch (error) { toast({ title: "CSV inválido", description: error instanceof Error ? error.message : "Confira o arquivo.", variant: "destructive" }); }
              }} />
            </label>
            {importItems.length > 0 && <p className="text-sm"><strong>{importItems.length}</strong> produto(s) pronto(s) para importar.</p>}
            <Button className="w-full" disabled={!importItems.length || importProducts.isPending} onClick={() => importProducts.mutate()}>
              {importProducts.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Importar e sincronizar catálogo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={apiOpen} onOpenChange={setApiOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Integração de produtos por API</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Conecte o ERP ou sistema de balcão. Produtos são incluídos ou atualizados pelo <code>erpId</code> e sincronizados com o catálogo geral.</p>
            <div className="rounded-lg border p-4 space-y-2">
              <Label>Endpoint</Label>
              <div className="flex gap-2"><Input readOnly value={`${window.location.origin}/api/tenants/${tenantId}/farmacia/produtos/sync`} className="font-mono text-xs" /><Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/tenants/${tenantId}/farmacia/produtos/sync`)}><Copy className="h-4 w-4" /></Button></div>
            </div>
            <div className="rounded-lg border p-4 space-y-2">
              <Label className="flex items-center gap-2"><Key className="h-4 w-4" />Chave no cabeçalho x-api-key</Label>
              {integration?.apiKeyEstoque ? (
                <div className="flex gap-2"><Input readOnly value={integration.apiKeyEstoque} className="font-mono text-xs" /><Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(integration.apiKeyEstoque!)}><Copy className="h-4 w-4" /></Button></div>
              ) : <Button onClick={() => regenerateKey.mutate()} disabled={regenerateKey.isPending}>Gerar chave de API</Button>}
            </div>
            <div className="rounded-lg bg-muted/50 border p-4">
              <pre className="text-xs whitespace-pre-wrap overflow-x-auto">{`POST /api/tenants/${tenantId}/farmacia/produtos/sync
Headers: x-api-key: SUA_CHAVE

{
  "items": [{
    "erpId": "MED-001",
    "nome": "Paracetamol 500mg",
    "principioAtivo": "Paracetamol",
    "categoria": "medicamento_generico",
    "exigeReceita": false,
    "unidade": "un",
    "precoVenda": 12.90,
    "estoque": 50,
    "ativo": true,
    "vendeNoPracaAi": true
  }]
}`}</pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-destructive">*</span></Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Princípio ativo</Label>
              <Input value={form.principioAtivo} onChange={(e) => setForm((f) => ({ ...f, principioAtivo: e.target.value }))} placeholder="ex: Paracetamol" />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Preço (R$) <span className="text-destructive">*</span></Label>
                <Input value={form.precoVenda} onChange={(e) => setForm((f) => ({ ...f, precoVenda: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Promoção (R$)</Label>
                <Input value={form.precoPromocional} onChange={(e) => setForm((f) => ({ ...f, precoPromocional: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Estoque</Label>
              <Input type="number" min={0} value={form.estoque} onChange={(e) => setForm((f) => ({ ...f, estoque: Number(e.target.value) }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.exigeReceita} onCheckedChange={(v) => setForm((f) => ({ ...f, exigeReceita: v }))} />
              <Label>Exige receita médica (produto controlado)</Label>
            </div>
            <div className="rounded-lg border p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-sm">Posologia oficial da apresentação</h3>
                <p className="text-xs text-muted-foreground">Copie os dados da bula desta concentração e forma farmacêutica. A IA não fará cálculos nem adaptações.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Concentração</Label><Input value={form.posologia.concentracao} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, concentracao: e.target.value } }))} placeholder="ex: 500 mg" /></div>
                <div className="space-y-1.5"><Label>Forma farmacêutica</Label><Input value={form.posologia.formaFarmaceutica} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, formaFarmaceutica: e.target.value } }))} placeholder="ex: comprimido" /></div>
                <div className="space-y-1.5"><Label>Via</Label><Input value={form.posologia.viaAdministracao} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, viaAdministracao: e.target.value } }))} placeholder="ex: oral" /></div>
                <div className="space-y-1.5"><Label>Faixa etária</Label><Input value={form.posologia.faixaEtaria} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, faixaEtaria: e.target.value } }))} placeholder="ex: adultos e maiores de 12 anos" /></div>
                <div className="space-y-1.5"><Label>Peso mínimo (kg)</Label><Input type="number" min={0} value={form.posologia.pesoMinimoKg} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, pesoMinimoKg: e.target.value } }))} /></div>
                <div className="space-y-1.5"><Label>Peso máximo (kg)</Label><Input type="number" min={0} value={form.posologia.pesoMaximoKg} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, pesoMaximoKg: e.target.value } }))} /></div>
                <div className="space-y-1.5"><Label>Dose por administração</Label><Input value={form.posologia.dosePorAdministracao} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, dosePorAdministracao: e.target.value } }))} /></div>
                <div className="space-y-1.5"><Label>Intervalo mínimo</Label><Input value={form.posologia.intervaloMinimo} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, intervaloMinimo: e.target.value } }))} /></div>
                <div className="space-y-1.5"><Label>Duração máxima</Label><Input value={form.posologia.duracaoMaxima} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, duracaoMaxima: e.target.value } }))} /></div>
                <div className="space-y-1.5 sm:col-span-3"><Label>Dose máxima diária</Label><Input value={form.posologia.doseMaximaDiaria} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, doseMaximaDiaria: e.target.value } }))} /></div>
              </div>
              {(["modoDeUsar", "contraindicacoes", "interacoes", "alertas"] as const).map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label>{{ modoDeUsar: "Modo de usar", contraindicacoes: "Contraindicações", interacoes: "Interações", alertas: "Alertas" }[field]}</Label>
                  <Textarea value={form.posologia[field]} onChange={(e) => setForm((f) => ({ ...f, posologia: { ...f.posologia, [field]: e.target.value } }))} rows={2} />
                </div>
              ))}
              <div className="space-y-1.5"><Label>URL da bula oficial</Label><Input type="url" value={form.posologiaFonteUrl} onChange={(e) => setForm((f) => ({ ...f, posologiaFonteUrl: e.target.value }))} placeholder="Bulário Eletrônico da Anvisa" /></div>
              <div className="space-y-1.5"><Label>Revisada por (farmacêutico/CRF)</Label><Input value={form.posologiaRevisadaPor} onChange={(e) => setForm((f) => ({ ...f, posologiaRevisadaPor: e.target.value }))} /></div>
              <div className="flex items-center gap-2">
                <Switch checked={form.posologiaAprovada} onCheckedChange={(v) => setForm((f) => ({ ...f, posologiaAprovada: v }))} />
                <Label>Liberar esta posologia para o agente após revisão farmacêutica</Label>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} />
                <Label className="font-normal">Ativo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.destaqueWhatsapp} onCheckedChange={(v) => setForm((f) => ({ ...f, destaqueWhatsapp: v }))} />
                <Label className="font-normal">Destaque WhatsApp</Label>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Salvar" : "Criar Produto"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Remover "{deleteTarget?.nome}"?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => remove.mutate(deleteTarget.id)} disabled={remove.isPending}>Remover</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
