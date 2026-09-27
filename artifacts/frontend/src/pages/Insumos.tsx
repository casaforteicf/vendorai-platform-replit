import { useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListInsumos,
  useCreateInsumo,
  useUpdateInsumo,
  useDeleteInsumo,
  getListInsumosQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Package, Pencil, Trash2, Search, Upload, Download, FileSpreadsheet, AlertCircle, Maximize2, Minimize2, Layers } from "lucide-react";
import type { Insumo } from "@workspace/api-client-react";
import { csvDecimal, downloadCsvTemplate, parseConstructionCsv } from "@/lib/construction-csv";
import { useToast } from "@/hooks/use-toast";

const CATEGORIAS_PADRAO = ["Mão de obra", "Alvenaria", "Concreto", "Cobertura", "Elétrica", "Hidráulica", "Acabamento", "Estrutura", "Movimento de terra", "Ferramentas", "Outros"];
const NOVA_CATEGORIA_VALUE = "__nova_categoria__";

const UNIDADES = ["un", "m²", "m³", "m", "kg", "t", "l", "cj", "pc", "sc", "cx", "h", "dia", "mês"];
const UNIDADES_MAO_DE_OBRA = ["m²", "h", "dia", "mês"];

const TIPOS_INSUMO = [
  ["material", "Material"],
  ["mao_de_obra", "Mão de obra"],
  ["equipamento", "Equipamento"],
  ["servico", "Serviço"],
] as const;

function tipoLabel(value?: string | null) {
  return TIPOS_INSUMO.find(([key]) => key === value)?.[1] ?? "Material";
}

type ImportRow = {
  codigo?: string;
  nome: string;
  descricao?: string;
  unidade: string;
  tipo?: string;
  precoUnitario?: string;
  categoria?: string;
};

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function normalizeImportRows(rows: Record<string, string>[]): ImportRow[] {
  return rows
    .map((row) => {
      const nome = row.nome?.trim() ?? "";
      const unidade = row.unidade?.trim() ?? "";
      const precoUnitario = csvDecimal(row.preco_unitario);
      return {
        ...(row.codigo?.trim() ? { codigo: row.codigo.trim() } : {}),
        nome,
        ...(row.descricao?.trim() ? { descricao: row.descricao.trim() } : {}),
        unidade,
        ...(row.tipo?.trim() ? { tipo: row.tipo.trim() } : {}),
        ...(precoUnitario ? { precoUnitario } : {}),
        ...(row.categoria?.trim() ? { categoria: row.categoria.trim() } : {}),
      };
    })
    .filter((row) => row.nome && row.unidade);
}

async function readSpreadsheet(file: File): Promise<ImportRow[]> {
  const isExcel = /\.(xlsx|xls)$/i.test(file.name);
  const rows = isExcel
    ? (() => {
        const workbookPromise = file.arrayBuffer().then((buffer) => XLSX.read(buffer, { type: "array" }));
        return workbookPromise.then((workbook) => {
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) return [];
          const sheet = workbook.Sheets[sheetName];
          return parseConstructionCsv(XLSX.utils.sheet_to_csv(sheet, { FS: ";" }));
        });
      })()
    : Promise.resolve(parseConstructionCsv(await file.text()));

  return normalizeImportRows(await rows);
}

function exportInsumos(items: Insumo[], format: "csv" | "xlsx") {
  const data = items.map((item) => ({
    codigo: item.codigo ?? "",
    nome: item.nome,
    descricao: item.descricao ?? "",
    unidade: item.unidade,
    tipo: (item as any).tipo ?? "material",
    preco_unitario: item.precoUnitario ?? "",
    categoria: item.categoria ?? "",
  }));
  const sheet = XLSX.utils.json_to_sheet(data);
  const date = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Insumos");
    XLSX.writeFile(workbook, `insumos-${date}.xlsx`);
    return;
  }

  downloadCsvTemplate(`insumos-${date}.csv`, XLSX.utils.sheet_to_csv(sheet, { FS: ";" }));
}

function InsumoForm({
  initial,
  categorias = [],
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<Insumo>;
  categorias?: string[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    nome: initial?.nome ?? "",
    descricao: initial?.descricao ?? "",
    unidade: initial?.unidade ?? "un",
    tipo: (initial as any)?.tipo ?? "material",
    precoUnitario: initial?.precoUnitario ?? "",
    categoria: initial?.categoria ?? "",
    codigo: initial?.codigo ?? "",
  });
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const unitOptions = form.tipo === "mao_de_obra" ? UNIDADES_MAO_DE_OBRA : UNIDADES;

  const availableCategories = [...new Set([
    ...CATEGORIAS_PADRAO,
    ...categorias,
    ...(initial?.categoria ? [initial.categoria] : []),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      ...form,
      categoria: creatingCategory ? newCategory.trim() : form.categoria,
    };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
    onSave(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2 space-y-2">
          <Label>Nome *</Label>
          <Input required value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Tipo *</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={form.tipo}
            onChange={(e) => {
              const tipo = e.target.value;
              setForm((f) => ({
                ...f,
                tipo,
                unidade: tipo === "mao_de_obra" && !UNIDADES_MAO_DE_OBRA.includes(f.unidade) ? "h" : f.unidade,
                categoria: tipo === "mao_de_obra" && !f.categoria ? "Mão de obra" : f.categoria,
              }));
            }}
          >
            {TIPOS_INSUMO.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>{form.tipo === "mao_de_obra" ? "Forma de cobrança *" : "Unidade *"}</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.unidade} onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))}>
            {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          {form.tipo === "mao_de_obra" && (
            <p className="text-xs text-muted-foreground">Preço pode ser informado por m², hora, dia ou mês.</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Preço unitário (R$)</Label>
          <Input type="number" step="0.0001" value={form.precoUnitario as string} onChange={(e) => setForm((f) => ({ ...f, precoUnitario: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Categoria</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={creatingCategory ? NOVA_CATEGORIA_VALUE : form.categoria}
            onChange={(e) => {
              if (e.target.value === NOVA_CATEGORIA_VALUE) {
                setCreatingCategory(true);
                setNewCategory("");
                return;
              }
              setCreatingCategory(false);
              setNewCategory("");
              setForm((f) => ({ ...f, categoria: e.target.value }));
            }}
          >
            <option value="">Selecione...</option>
            {availableCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value={NOVA_CATEGORIA_VALUE}>+ Cadastrar nova categoria</option>
          </select>
          {creatingCategory && (
            <Input
              autoFocus
              required
              placeholder="Nome da nova categoria"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
          )}
        </div>
        <div className="space-y-2">
          <Label>Código interno</Label>
          <Input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <Label>Descrição</Label>
          <Input value={form.descricao as string} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
      </div>
    </form>
  );
}

function EditDialog({ tenantId, insumo, categorias }: { tenantId: string; insumo: Insumo; categorias: string[] }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { mutateAsync, isPending } = useUpdateInsumo();

  async function handleSave(data: Record<string, unknown>) {
    try {
      await mutateAsync({ tenantId, insumoId: insumo.id, data: data as any });
      await qc.invalidateQueries({ queryKey: getListInsumosQueryKey(tenantId) });
      setOpen(false);
      toast({ title: "Insumo atualizado." });
    } catch (error) {
      toast({
        title: "Não foi possível atualizar o insumo",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Pencil className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar insumo</DialogTitle></DialogHeader>
        <InsumoForm initial={insumo} categorias={categorias} onSave={handleSave} onCancel={() => setOpen(false)} isPending={isPending} />
      </DialogContent>
    </Dialog>
  );
}

export default function Insumos() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [priceTableOpen, setPriceTableOpen] = useState(false);
  const [priceTableFullscreen, setPriceTableFullscreen] = useState(false);
  const [priceSearch, setPriceSearch] = useState("");
  const [priceCategory, setPriceCategory] = useState("all");
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [priceSaving, setPriceSaving] = useState(false);
  const { toast } = useToast();

  const { data: insumos = [], isLoading, isError, error, refetch } = useListInsumos(tenantId, {}, {
    query: { enabled: !!tenantId, queryKey: getListInsumosQueryKey(tenantId) },
  });

  const { mutateAsync: createInsumo, isPending: isCreating } = useCreateInsumo();
  const { mutateAsync: updateInsumo } = useUpdateInsumo();
  const { mutateAsync: deleteInsumo } = useDeleteInsumo();

  async function handleCreate(data: Record<string, unknown>) {
    await createInsumo({ tenantId, data: data as any });
    await qc.invalidateQueries({ queryKey: getListInsumosQueryKey(tenantId) });
    setAddOpen(false);
  }

  async function handleDelete(insumoId: string) {
    await deleteInsumo({ tenantId, insumoId });
    await qc.invalidateQueries({ queryKey: getListInsumosQueryKey(tenantId) });
  }

  async function handleImportFile(file: File | null) {
    setImportFile(file);
    setImportPreview([]);
    if (!file) return;

    try {
      const rows = await readSpreadsheet(file);
      if (!rows.length) {
        throw new Error("Nenhuma linha válida encontrada. Confira as colunas nome e unidade.");
      }
      setImportPreview(rows);
    } catch (error) {
      setImportFile(null);
      toast({
        title: "Não foi possível ler a planilha",
        description: error instanceof Error ? error.message : "Confira o arquivo e tente novamente.",
        variant: "destructive",
      });
    }
  }

  async function handleSpreadsheetImport() {
    if (!importFile || !tenantId || !importPreview.length) return;
    setImporting(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/insumos/importar`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ rows: importPreview }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          result?.message
          ?? (typeof result?.error === "string" ? result.error : null)
          ?? "Não foi possível importar os insumos.",
        );
      }

      await qc.invalidateQueries({ queryKey: getListInsumosQueryKey(tenantId) });
      toast({
        title: `${result.novos ?? 0} novo(s) · ${result.existentesAtualizados ?? 0} existente(s) sincronizado(s)`,
        description: [
          result.precosAtualizados ? `${result.precosAtualizados} preço(s) atualizado(s)` : null,
          result.duplicadasNoArquivo ? `${result.duplicadasNoArquivo} duplicata(s) no arquivo consolidada(s)` : null,
          result.invalidas ? `${result.invalidas} linha(s) inválida(s) ignorada(s)` : null,
        ].filter(Boolean).join(" · ") || "Importação concluída.",
      });
      setImportOpen(false);
      setImportFile(null);
      setImportPreview([]);
    } catch (error) {
      toast({
        title: "Não foi possível importar a planilha",
        description: error instanceof Error ? error.message : "Confira o arquivo e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  }

  function openPriceTable() {
    setPriceDrafts(Object.fromEntries(insumos.map((item) => [item.id, item.precoUnitario ?? ""])));
    setPriceTableOpen(true);
  }

  async function savePriceTable() {
    setPriceSaving(true);
    try {
      let changed = 0;
      let draftsRecalculated = 0;
      let sentWithWarning = 0;

      for (const item of insumos) {
        const nextRaw = priceDrafts[item.id]?.trim() ?? "";
        const current = item.precoUnitario == null ? "" : String(Number(item.precoUnitario));
        const next = nextRaw === "" ? "" : String(Number(nextRaw));
        if (next === current) continue;
        if (next === "" || !Number.isFinite(Number(next)) || Number(next) < 0) continue;

        const result = await updateInsumo({
          tenantId,
          insumoId: item.id,
          data: { precoUnitario: next } as any,
        }) as any;

        changed += 1;
        draftsRecalculated += Number(result?.impactoPreco?.orcamentosRecalculados ?? 0);
        sentWithWarning += Number(result?.impactoPreco?.orcamentosComAviso ?? 0);
      }

      await qc.invalidateQueries({ queryKey: getListInsumosQueryKey(tenantId) });
      toast({
        title: changed ? `${changed} preço(s) atualizado(s)` : "Nenhuma alteração de preço",
        description: changed
          ? `Rascunhos recalculados: ${draftsRecalculated}. Orçamentos enviados sinalizados: ${sentWithWarning}.`
          : "Os valores da tabela mestre já estavam atualizados.",
      });
      setPriceTableOpen(false);
    } catch (error) {
      toast({
        title: "Não foi possível atualizar a tabela de preços",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setPriceSaving(false);
    }
  }

  const filtered = insumos.filter((i) => {
    if (catFilter !== "all" && i.categoria !== catFilter) return false;
    if (typeFilter !== "all" && ((i as any).tipo ?? "material") !== typeFilter) return false;
    if (search) {
      const term = search.toLowerCase();
      if (
        !i.nome.toLowerCase().includes(term)
        && !(i.codigo ?? "").toLowerCase().includes(term)
        && !(i.descricao ?? "").toLowerCase().includes(term)
      ) return false;
    }
    return true;
  });

  const categorias = [...new Set(insumos.map((i) => i.categoria).filter(Boolean))] as string[];
  const priceFiltered = insumos.filter((i) => {
    if (priceCategory !== "all" && i.categoria !== priceCategory) return false;
    if (priceSearch) {
      const term = priceSearch.toLowerCase();
      if (!i.nome.toLowerCase().includes(term) && !(i.codigo ?? "").toLowerCase().includes(term)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-500" />
            Insumos, Materiais e Mão de Obra
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Cadastro central de materiais, serviços, equipamentos e mão de obra para as composições da obra</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-2" onClick={() => { window.location.href = "/composicoes"; }}>
          <Layers className="h-4 w-4" />Composições
        </Button>
        <Button size="sm" variant="outline" className="gap-2" onClick={openPriceTable}>
          <FileSpreadsheet className="h-4 w-4" />Tabela mestre
        </Button>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => exportInsumos(filtered, "csv")} disabled={!filtered.length}>
          <Download className="h-4 w-4" />Exportar CSV
        </Button>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => exportInsumos(filtered, "xlsx")} disabled={!filtered.length}>
          <FileSpreadsheet className="h-4 w-4" />Exportar Excel
        </Button>
        <Dialog open={priceTableOpen} onOpenChange={(open) => {
          setPriceTableOpen(open);
          if (!open) setPriceTableFullscreen(false);
        }}>
          <DialogContent
            className={priceTableFullscreen
              ? "!w-screen !h-screen !max-w-none !max-h-none rounded-none overflow-hidden flex flex-col"
              : "!w-[96vw] !max-w-[1500px] h-[88vh] max-h-[92vh] overflow-hidden flex flex-col"}
          >
            <DialogHeader className="pr-10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <DialogTitle>Tabela Mestre de Preços</DialogTitle>
                  <p className="mt-1 text-xs text-muted-foreground">{priceFiltered.length} de {insumos.length} itens de custo</p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={() => setPriceTableFullscreen((value) => !value)}>
                  {priceTableFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  {priceTableFullscreen ? "Restaurar" : "Tela cheia"}
                </Button>
              </div>
            </DialogHeader>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Alterar um preço atualiza o custo do insumo, recalcula composições dependentes e orçamentos em rascunho.
              Orçamentos enviados recebem aviso de preço desatualizado; aprovados permanecem congelados.
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(260px,1fr)_240px_auto_auto_auto]">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou código..."
                  className="pl-8"
                  value={priceSearch}
                  onChange={(e) => setPriceSearch(e.target.value)}
                />
              </div>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={priceCategory}
                onChange={(e) => setPriceCategory(e.target.value)}
              >
                <option value="all">Todas as categorias</option>
                {categorias.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
              </select>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => exportInsumos(priceFiltered, "csv")} disabled={!priceFiltered.length}>
                <Download className="h-4 w-4" />CSV
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => exportInsumos(priceFiltered, "xlsx")} disabled={!priceFiltered.length}>
                <FileSpreadsheet className="h-4 w-4" />Excel
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                setPriceTableOpen(false);
                setImportOpen(true);
              }}>
                <Upload className="h-4 w-4" />Importar
              </Button>
            </div>
            <div className="overflow-auto border rounded-lg flex-1 min-h-0">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="sticky top-0 z-10 bg-background border-b shadow-sm">
                  <tr>
                    <th className="text-left px-4 py-3 w-32">Código</th>
                    <th className="text-left px-4 py-3 min-w-72">Insumo</th>
                    <th className="text-left px-4 py-3 w-32">Tipo</th>
                    <th className="text-left px-4 py-3 w-24">Un.</th>
                    <th className="text-left px-4 py-3 min-w-52">Categoria</th>
                    <th className="text-left px-4 py-3 w-40">Atualizado</th>
                    <th className="text-right px-4 py-3 w-56">Preço mestre (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {priceFiltered.map((item) => (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.codigo ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{item.nome}</div>
                        {item.descricao && <div className="max-w-xl truncate text-xs text-muted-foreground">{item.descricao}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{tipoLabel((item as any).tipo)}</td>
                      <td className="px-4 py-3">{item.unidade}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.categoria ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {(item as any).updatedAt ? new Date((item as any).updatedAt).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min="0"
                          step="0.0001"
                          className="h-9 text-right font-mono"
                          value={priceDrafts[item.id] ?? ""}
                          onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="0,00"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-xs text-muted-foreground">Alterações só são aplicadas ao clicar em “Salvar e recalcular”.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPriceTableOpen(false)} disabled={priceSaving}>Cancelar</Button>
                <Button onClick={savePriceTable} disabled={priceSaving}>
                  {priceSaving ? "Atualizando preços..." : "Salvar e recalcular"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={importOpen} onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) {
            setImportFile(null);
            setImportPreview([]);
          }
        }}>
          <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-2"><Upload className="h-4 w-4" />Importar planilha</Button></DialogTrigger>
          <DialogContent className="!w-[92vw] !max-w-5xl max-h-[88vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Importar insumos e preços</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Aceita CSV, XLSX e XLS. O código é a chave principal: código existente atualiza o insumo; código novo cria um novo cadastro.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => downloadCsvTemplate("modelo-insumos.csv", "codigo;nome;descricao;unidade;tipo;preco_unitario;categoria\nMAT-001;Cimento CP II;Saco 50 kg;sc;material;39,90;Concreto\nMO-0003;Pedreiro;Mão de obra por hora;h;mao_de_obra;31,17;Mão de obra\n")}>
                  <Download className="h-4 w-4" />Baixar modelo CSV
                </Button>
                <span className="text-xs text-muted-foreground">Campos: código, nome, descrição, unidade, tipo, preço unitário e categoria.</span>
              </div>
              <Input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={(e) => void handleImportFile(e.target.files?.[0] ?? null)}
              />
              {importFile && (
                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                  <span className="font-medium">{importFile.name}</span>
                  <span className="ml-2 text-muted-foreground">• {importPreview.length} linha(s) válida(s)</span>
                </div>
              )}
            </div>
            {importPreview.length > 0 && (
              <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-lg border">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="px-3 py-2 text-left">Código</th>
                      <th className="px-3 py-2 text-left">Nome</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-left">Un.</th>
                      <th className="px-3 py-2 text-left">Categoria</th>
                      <th className="px-3 py-2 text-right">Preço</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 50).map((row, index) => (
                      <tr key={`${row.codigo ?? row.nome}-${index}`} className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-muted-foreground">{row.codigo ?? "—"}</td>
                        <td className="px-3 py-2 font-medium">{row.nome}</td>
                        <td className="px-3 py-2">{tipoLabel(row.tipo)}</td>
                        <td className="px-3 py-2">{row.unidade}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.categoria ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono">{row.precoUnitario ? `R$ ${Number(row.precoUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importPreview.length > 50 && (
                  <div className="border-t bg-muted/20 px-3 py-2 text-center text-xs text-muted-foreground">
                    Prévia das primeiras 50 linhas. Serão processadas {importPreview.length} linhas.
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>Cancelar</Button>
              <Button onClick={handleSpreadsheetImport} disabled={!importFile || !importPreview.length || importing}>
                {importing ? "Importando..." : `Importar ${importPreview.length || ""} linha(s)`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Novo insumo</Button>
          </DialogTrigger>
          <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo insumo</DialogTitle></DialogHeader>
            <InsumoForm categorias={categorias} onSave={handleCreate} onCancel={() => setAddOpen(false)} isPending={isCreating} />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(280px,1fr)_200px_240px_auto] md:items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, código ou descrição..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">Todos os tipos</option>
          {TIPOS_INSUMO.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
        >
          <option value="all">Todas as categorias</option>
          {categorias.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
        </select>
        <div className="text-sm text-muted-foreground md:text-right">{filtered.length} de {insumos.length}</div>
      </div>

      {/* Table / Cards */}
      {isLoading ? (
        <div className="h-40 rounded-xl bg-muted animate-pulse" />
      ) : isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive/70" />
          <p className="font-semibold">Não foi possível carregar os insumos</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "A API recusou ou não concluiu a consulta dos insumos."}
          </p>
          <Button className="mt-4" variant="outline" size="sm" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nenhum insumo encontrado</p>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {/* Mobile cards */}
            <div className="md:hidden divide-y">
              {filtered.map((insumo) => (
                <div key={insumo.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{insumo.nome}</p>
                      {insumo.descricao && <p className="text-xs text-muted-foreground mt-0.5">{insumo.descricao}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <EditDialog tenantId={tenantId} insumo={insumo} categorias={categorias} />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir insumo?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(insumo.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span><span className="font-medium text-foreground">Tipo:</span> {tipoLabel((insumo as any).tipo)}</span>
                    {insumo.categoria && (
                      <span><span className="font-medium text-foreground">Categoria:</span> {insumo.categoria}</span>
                    )}
                    <span>
                      <span className="font-medium text-foreground">Unidade:</span>{" "}
                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{insumo.unidade}</span>
                    </span>
                    {insumo.precoUnitario && (
                      <span>
                        <span className="font-medium text-foreground">Preço:</span>{" "}
                        <span className="font-mono">R$ {Number(insumo.precoUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      </span>
                    )}
                    {insumo.codigo && (
                      <span><span className="font-medium text-foreground">Código:</span> <span className="font-mono">#{insumo.codigo}</span></span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block max-h-[calc(100vh-315px)] min-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b bg-muted/30 shadow-sm">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Categoria</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Unidade</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Preço unitário</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Código</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((insumo) => (
                    <tr key={insumo.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{insumo.nome}</div>
                        {insumo.descricao && <div className="text-xs text-muted-foreground">{insumo.descricao}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{tipoLabel((insumo as any).tipo)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{insumo.categoria ?? "—"}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{insumo.unidade}</span></td>
                      <td className="px-4 py-3 text-right font-mono">
                        {insumo.precoUnitario ? `R$ ${Number(insumo.precoUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{insumo.codigo ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <EditDialog tenantId={tenantId} insumo={insumo} categorias={categorias} />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir insumo?</AlertDialogTitle>
                                <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(insumo.id)}>Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
