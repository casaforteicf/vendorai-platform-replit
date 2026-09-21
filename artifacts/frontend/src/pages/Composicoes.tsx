import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListComposicoes,
  useGetComposicao,
  useCreateComposicao,
  useUpdateComposicao,
  useDeleteComposicao,
  useListInsumos,
  useCreateInsumo,
  useUpdateInsumo,
  getListComposicoesQueryKey,
  getGetComposicaoQueryKey,
  getListInsumosQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Layers, Pencil, Trash2, Search, ChevronDown, ChevronUp, X, Upload, Download, Package } from "lucide-react";
import { csvDecimal, downloadCsvTemplate, parseConstructionCsv } from "@/lib/construction-csv";
import { useToast } from "@/hooks/use-toast";

const UNIDADES = ["un", "m²", "m³", "m", "kg", "t", "l", "cj", "pc", "sc", "cx", "h", "dia", "mês"];
const UNIDADES_MAO_DE_OBRA = ["m²", "h", "dia", "mês"];

const TIPOS_INSUMO = [
  ["material", "Material"],
  ["mao_de_obra", "Mão de obra"],
  ["equipamento", "Equipamento"],
  ["servico", "Serviço"],
] as const;

const ETAPAS_COMPOSICAO = [
  ["projetos_legalizacao", "Projetos e legalização"],
  ["preliminares", "Serviços preliminares"],
  ["terraplenagem", "Terraplenagem"],
  ["fundacoes", "Fundações"],
  ["estrutura", "Estrutura / paredes"],
  ["lajes", "Lajes"],
  ["cobertura", "Cobertura"],
  ["hidraulica", "Instalações hidráulicas"],
  ["eletrica", "Instalações elétricas"],
  ["esquadrias", "Esquadrias"],
  ["revestimentos", "Revestimentos"],
  ["forros_pintura", "Forros e pintura"],
  ["acabamentos", "Acabamentos"],
  ["areas_externas", "Áreas externas"],
  ["solar_automacao", "Energia solar e automação"],
  ["limpeza_entrega", "Limpeza e entrega"],
] as const;

const SISTEMAS_CONSTRUTIVOS = [
  ["icf", "ICF"],
  ["alvenaria", "Alvenaria / tijolo"],
  ["steel_frame", "Steel Frame"],
  ["wood_frame", "Wood Frame"],
  ["madeira", "Madeira"],
  ["concreto", "Concreto armado"],
  ["outro", "Outro"],
] as const;

type EtapaKey = typeof ETAPAS_COMPOSICAO[number][0];
type SistemaConstrutivo = typeof SISTEMAS_CONSTRUTIVOS[number][0];

const etapaLabel = (key?: string | null) =>
  ETAPAS_COMPOSICAO.find(([value]) => value === key)?.[1] ?? "Sem etapa";

const sistemaLabel = (key: string) =>
  SISTEMAS_CONSTRUTIVOS.find(([value]) => value === key)?.[1] ?? key;

function ComposicaoDetail({ tenantId, composicaoId }: { tenantId: string; composicaoId: string }) {
  const { data, isLoading } = useGetComposicao(tenantId, composicaoId, {
    query: { enabled: !!composicaoId, queryKey: getGetComposicaoQueryKey(tenantId, composicaoId) },
  });

  if (isLoading) return <div className="h-20 bg-muted animate-pulse rounded" />;
  if (!data || !(data as any).itens?.length) return <p className="text-xs text-muted-foreground">Nenhum insumo cadastrado</p>;

  const total = (data as any).itens.reduce((sum: number, i: any) => {
    const preco = parseFloat(i.insumo?.precoUnitario ?? "0");
    return sum + preco * parseFloat(i.quantidade ?? "0");
  }, 0);

  return (
    <div className="space-y-2">
      {/* Mobile: labeled rows */}
      <div className="md:hidden space-y-2">
        {(data as any).itens.map((item: any) => {
          const preco = parseFloat(item.insumo?.precoUnitario ?? "0");
          const custo = preco * parseFloat(item.quantidade ?? "0");
          return (
            <div key={item.id} className="flex items-center justify-between gap-2 text-xs border-b pb-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{item.insumo?.nome ?? "—"}</p>
                <p className="text-muted-foreground font-mono">
                  {parseFloat(item.quantidade).toLocaleString("pt-BR")} {item.insumo?.unidade ?? ""}
                </p>
              </div>
              <span className="font-mono shrink-0 text-right">
                {custo > 0 ? `R$ ${custo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
              </span>
            </div>
          );
        })}
        {total > 0 && (
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground">Total estimado</span>
            <span className="font-mono font-semibold">R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>
      {/* Desktop: table */}
      <table className="hidden md:table w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1.5 pr-3">Insumo</th>
            <th className="text-right py-1.5 px-3">Qtd</th>
            <th className="text-left py-1.5 px-3">Un.</th>
            <th className="text-right py-1.5 pl-3">Custo</th>
          </tr>
        </thead>
        <tbody>
          {(data as any).itens.map((item: any) => {
            const preco = parseFloat(item.insumo?.precoUnitario ?? "0");
            const custo = preco * parseFloat(item.quantidade ?? "0");
            return (
              <tr key={item.id} className="border-b">
                <td className="py-1.5 pr-3">{item.insumo?.nome ?? "—"}</td>
                <td className="py-1.5 px-3 text-right font-mono">{parseFloat(item.quantidade).toLocaleString("pt-BR")}</td>
                <td className="py-1.5 px-3 font-mono">{item.insumo?.unidade ?? "—"}</td>
                <td className="py-1.5 pl-3 text-right font-mono">{custo > 0 ? `R$ ${custo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
        {total > 0 && (
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-2 text-muted-foreground">Total estimado</td>
              <td className="pt-2 text-right font-mono font-semibold">R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

type InsumoItem = { insumoId: string; quantidade: string };

function ComposicaoForm({
  tenantId,
  initial,
  initialItems,
  onSave,
  onCancel,
  isPending,
}: {
  tenantId: string;
  initial?: {
    nome?: string;
    descricao?: string;
    unidade?: string;
    codigo?: string;
    etapaKey?: EtapaKey | "";
    sistemasConstrutivos?: string[];
    comumTodosSistemas?: boolean;
    ativo?: boolean;
    produtividadeDia?: string | number | null;
    equipePadrao?: number | null;
    horasDiaPadrao?: string | number | null;
  };
  initialItems?: InsumoItem[];
  onSave: (data: Record<string, unknown>) => void | Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    nome: initial?.nome ?? "",
    descricao: initial?.descricao ?? "",
    unidade: initial?.unidade ?? "m²",
    codigo: initial?.codigo ?? "",
    etapaKey: initial?.etapaKey ?? "",
    sistemasConstrutivos: initial?.sistemasConstrutivos ?? [],
    comumTodosSistemas: initial?.comumTodosSistemas ?? false,
    ativo: initial?.ativo ?? true,
    produtividadeDia: initial?.produtividadeDia == null ? "" : String(initial.produtividadeDia),
    equipePadrao: String(initial?.equipePadrao ?? 1),
    horasDiaPadrao: initial?.horasDiaPadrao == null ? "8" : String(initial.horasDiaPadrao),
  });
  const [itens, setItens] = useState<InsumoItem[]>(initialItems ?? []);
  const [insumoSearch, setInsumoSearch] = useState("");
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [newInsumo, setNewInsumo] = useState({
    nome: "",
    unidade: "un",
    tipo: "material",
    codigo: "",
    categoria: "",
    precoUnitario: "",
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const { mutateAsync: createInsumo, isPending: isCreatingInsumo } = useCreateInsumo();
  const { mutateAsync: updateInsumo } = useUpdateInsumo();

  const { data: allInsumos = [] } = useListInsumos(tenantId, {}, { query: { enabled: !!tenantId, queryKey: getListInsumosQueryKey(tenantId) } });
  const filteredInsumos = allInsumos.filter((i) => i.nome.toLowerCase().includes(insumoSearch.toLowerCase()));

  function addInsumo(insumoId: string) {
    if (itens.find((i) => i.insumoId === insumoId)) return;
    setItens((prev) => [...prev, { insumoId, quantidade: "1" }]);
    setInsumoSearch("");
  }

  function openQuickCreate() {
    setNewInsumo((current) => ({
      ...current,
      nome: insumoSearch.trim() || current.nome,
    }));
    setQuickCreateOpen(true);
  }

  async function handleQuickCreateInsumo() {
    const nome = newInsumo.nome.trim();
    if (!nome) {
      toast({ title: "Informe o nome do insumo", variant: "destructive" });
      return;
    }

    const duplicated = allInsumos.find((item) => {
      const sameCode = newInsumo.codigo.trim()
        && item.codigo?.trim().toLowerCase() === newInsumo.codigo.trim().toLowerCase();
      const sameName = item.nome.trim().toLowerCase() === nome.toLowerCase();
      return sameCode || sameName;
    });

    if (duplicated) {
      addInsumo(duplicated.id);
      setQuickCreateOpen(false);
      setNewInsumo({ nome: "", unidade: "un", tipo: "material", codigo: "", categoria: "", precoUnitario: "" });
      toast({
        title: "Insumo já cadastrado",
        description: `${duplicated.nome} foi adicionado à composição.`,
      });
      return;
    }

    try {
      const created = await createInsumo({
        tenantId,
        data: {
          nome,
          unidade: newInsumo.unidade,
          tipo: newInsumo.tipo,
          ...(newInsumo.codigo.trim() ? { codigo: newInsumo.codigo.trim() } : {}),
          ...(newInsumo.categoria.trim() ? { categoria: newInsumo.categoria.trim() } : {}),
          ...(newInsumo.precoUnitario.trim() ? { precoUnitario: newInsumo.precoUnitario.trim() } : {}),
        } as any,
      });

      qc.setQueryData(getListInsumosQueryKey(tenantId), (current: any) => {
        const rows = Array.isArray(current) ? current : [];
        return rows.some((item: any) => item.id === created.id) ? rows : [...rows, created];
      });
      await qc.invalidateQueries({ queryKey: getListInsumosQueryKey(tenantId) });

      setItens((prev) => prev.some((item) => item.insumoId === created.id)
        ? prev
        : [...prev, { insumoId: created.id, quantidade: "1" }]);
      if (created.precoUnitario != null) {
        setPriceDrafts((prev) => ({ ...prev, [created.id]: String(Number(created.precoUnitario)) }));
      }

      setInsumoSearch("");
      setQuickCreateOpen(false);
      setNewInsumo({ nome: "", unidade: "un", tipo: "material", codigo: "", categoria: "", precoUnitario: "" });
      toast({
        title: "Insumo cadastrado",
        description: `${created.nome} foi salvo na Tabela Mestre e adicionado à composição.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível cadastrar o insumo",
        description: error instanceof Error ? error.message : "Confira os dados e tente novamente.",
        variant: "destructive",
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.etapaKey) {
      toast({ title: "Selecione a etapa da composição", variant: "destructive" });
      return;
    }
    if (!form.comumTodosSistemas && form.sistemasConstrutivos.length === 0) {
      toast({ title: "Selecione ao menos um sistema construtivo", variant: "destructive" });
      return;
    }
    setSavingPrices(true);
    try {
      let priceChanges = 0;

      for (const item of itens) {
        const insumo = allInsumos.find((candidate) => candidate.id === item.insumoId);
        if (!insumo) continue;

        const draft = priceDrafts[item.insumoId];
        if (draft === undefined) continue;

        const nextRaw = draft.trim();
        const current = insumo.precoUnitario == null ? "" : String(Number(insumo.precoUnitario));
        const next = nextRaw === "" ? "" : String(Number(nextRaw));

        if (next === current) continue;
        if (next === "" || !Number.isFinite(Number(next)) || Number(next) < 0) {
          throw new Error(`Informe um preço válido para ${insumo.nome}.`);
        }

        await updateInsumo({
          tenantId,
          insumoId: insumo.id,
          data: { precoUnitario: next } as any,
        });
        priceChanges += 1;
      }

      if (priceChanges > 0) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: getListInsumosQueryKey(tenantId) }),
          qc.invalidateQueries({ queryKey: getListComposicoesQueryKey(tenantId) }),
        ]);
        toast({
          title: `${priceChanges} preço(s) atualizado(s) na Tabela Mestre`,
          description: "Composições dependentes e orçamentos em rascunho foram recalculados.",
        });
      }

      const payload: Record<string, unknown> = {
        ...form,
        produtividadeDia: form.produtividadeDia.trim() ? form.produtividadeDia.trim() : undefined,
        equipePadrao: Math.max(1, Number(form.equipePadrao || 1)),
        horasDiaPadrao: form.horasDiaPadrao.trim() || "8",
        sistemasConstrutivos: form.comumTodosSistemas ? [] : form.sistemasConstrutivos,
      };
      Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
      payload.itens = itens.map((i) => ({
        insumoId: i.insumoId,
        quantidade: i.quantidade,
      }));
      await onSave(payload);
    } catch (error) {
      toast({
        title: "Não foi possível salvar a composição",
        description: error instanceof Error ? error.message : "Confira os valores e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSavingPrices(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2 space-y-2">
          <Label>Nome *</Label>
          <Input required value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Unidade *</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.unidade} onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))}>
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Código interno</Label>
          <Input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <Label>Descrição</Label>
          <Input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
        </div>

        <div className="space-y-2">
          <Label>Etapa da obra *</Label>
          <select
            required
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={form.etapaKey}
            onChange={(e) => setForm((f) => ({ ...f, etapaKey: e.target.value as EtapaKey }))}
          >
            <option value="">Selecione a etapa</option>
            {ETAPAS_COMPOSICAO.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
            <Checkbox
              checked={form.ativo}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, ativo: checked === true }))}
            />
            Ativa e disponível em orçamentos
          </label>
        </div>

        <div className="sm:col-span-2 rounded-lg border bg-muted/20 p-3">
          <div className="mb-3">
            <Label>Produtividade para planejamento automático</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Informe a produção de 1 pessoa por dia para 1 unidade desta composição. O Arqdor usa quantidade ÷ produtividade ÷ equipe para sugerir a duração.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Produtividade/pessoa/dia</Label>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={form.produtividadeDia}
                onChange={(e) => setForm((f) => ({ ...f, produtividadeDia: e.target.value }))}
                placeholder={`Ex.: 12 ${form.unidade}/pessoa/dia`}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Equipe padrão</Label>
              <Input
                type="number"
                min="1"
                max="500"
                step="1"
                value={form.equipePadrao}
                onChange={(e) => setForm((f) => ({ ...f, equipePadrao: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Horas/dia padrão</Label>
              <Input
                type="number"
                min="0.5"
                max="24"
                step="0.5"
                value={form.horasDiaPadrao}
                onChange={(e) => setForm((f) => ({ ...f, horasDiaPadrao: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="sm:col-span-2 rounded-lg border p-3 space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={form.comumTodosSistemas}
              onCheckedChange={(checked) => setForm((f) => ({
                ...f,
                comumTodosSistemas: checked === true,
                sistemasConstrutivos: checked === true ? [] : f.sistemasConstrutivos,
              }))}
            />
            <span>
              <span className="font-medium">Comum a todos os sistemas construtivos</span>
              <span className="block text-xs text-muted-foreground">
                Use para elétrica, hidráulica, pintura, limpeza e outras composições que não dependem do método estrutural.
              </span>
            </span>
          </label>

          {!form.comumTodosSistemas && (
            <div className="space-y-2">
              <Label>Sistemas construtivos *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SISTEMAS_CONSTRUTIVOS.map(([value, label]) => {
                  const checked = form.sistemasConstrutivos.includes(value);
                  return (
                    <label key={value} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => setForm((f) => ({
                          ...f,
                          sistemasConstrutivos: next === true
                            ? [...new Set([...f.sistemasConstrutivos, value])]
                            : f.sistemasConstrutivos.filter((item) => item !== value),
                        }))}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <Label>Insumos da composição</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Quantidade = consumo para 1 {form.unidade} da composição. O preço vem da Tabela Mestre; se você alterar o valor aqui, a Tabela Mestre também será atualizada.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar insumo..."
              className="pl-8"
              value={insumoSearch}
              onChange={(e) => setInsumoSearch(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" className="gap-2 shrink-0" onClick={openQuickCreate}>
            <Plus className="h-4 w-4" />
            Novo insumo
          </Button>
        </div>
        {insumoSearch && (
          <div className="border rounded-md overflow-hidden">
            {filteredInsumos.length > 0 ? (
              <div className="max-h-40 overflow-y-auto">
                {filteredInsumos.slice(0, 8).map((ins) => (
                  <button key={ins.id} type="button" onClick={() => addInsumo(ins.id)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between">
                    <span>
                      {ins.nome}
                      {(ins as any).tipo === "mao_de_obra" && <span className="ml-2 text-[10px] text-primary">Mão de obra</span>}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">{ins.unidade}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Nenhum insumo encontrado com “{insumoSearch}”.
              </div>
            )}
            <button
              type="button"
              onClick={openQuickCreate}
              className="w-full border-t bg-muted/30 px-3 py-2 text-left text-sm font-medium hover:bg-muted flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Cadastrar novo insumo “{insumoSearch.trim()}”
            </button>
          </div>
        )}

        {quickCreateOpen && (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Novo insumo</p>
                <p className="text-xs text-muted-foreground">
                  Será salvo na Tabela Mestre e adicionado automaticamente à composição.
                </p>
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setQuickCreateOpen(false)}
                title="Fechar cadastro"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Nome *</Label>
                <Input
                  autoFocus
                  value={newInsumo.nome}
                  onChange={(e) => setNewInsumo((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex.: Arame recozido"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo *</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={newInsumo.tipo}
                  onChange={(e) => {
                    const tipo = e.target.value;
                    setNewInsumo((prev) => ({
                      ...prev,
                      tipo,
                      unidade: tipo === "mao_de_obra" && !UNIDADES_MAO_DE_OBRA.includes(prev.unidade) ? "h" : prev.unidade,
                      categoria: tipo === "mao_de_obra" && !prev.categoria ? "Mão de obra" : prev.categoria,
                    }));
                  }}
                >
                  {TIPOS_INSUMO.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{newInsumo.tipo === "mao_de_obra" ? "Forma de cobrança *" : "Unidade *"}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={newInsumo.unidade}
                  onChange={(e) => setNewInsumo((prev) => ({ ...prev, unidade: e.target.value }))}
                >
                  {(newInsumo.tipo === "mao_de_obra" ? UNIDADES_MAO_DE_OBRA : UNIDADES).map((unidade) => <option key={unidade} value={unidade}>{unidade}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Preço na Tabela Mestre</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={newInsumo.precoUnitario}
                  onChange={(e) => setNewInsumo((prev) => ({ ...prev, precoUnitario: e.target.value }))}
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Código</Label>
                <Input
                  value={newInsumo.codigo}
                  onChange={(e) => setNewInsumo((prev) => ({ ...prev, codigo: e.target.value }))}
                  placeholder="Ex.: MAT-001"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Categoria</Label>
                <Input
                  value={newInsumo.categoria}
                  onChange={(e) => setNewInsumo((prev) => ({ ...prev, categoria: e.target.value }))}
                  placeholder="Ex.: Estrutura"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setQuickCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={handleQuickCreateInsumo} disabled={isCreatingInsumo}>
                {isCreatingInsumo ? "Cadastrando..." : "Cadastrar e adicionar"}
              </Button>
            </div>
          </div>
        )}

        {itens.length > 0 && (
          <div className="space-y-2 mt-2">
            {itens.map((item, idx) => {
              const ins = allInsumos.find((i) => i.id === item.insumoId);
              return (
                <div key={item.insumoId} className="flex flex-col gap-1.5 rounded-md border p-2 sm:border-0 sm:p-0 sm:flex-row sm:items-center sm:gap-2 text-sm">
                  <div className="flex items-center justify-between gap-2 sm:flex-1 sm:min-w-0">
                    <span className="flex-1 truncate font-medium sm:font-normal">
                      {ins?.nome ?? item.insumoId}
                      {(ins as any)?.tipo === "mao_de_obra" && (
                        <span className="ml-2 text-[10px] rounded bg-primary/10 px-1.5 py-0.5 text-primary">Mão de obra</span>
                      )}
                    </span>
                    <button type="button" className="sm:hidden text-muted-foreground" onClick={() => setItens((prev) => prev.filter((_, j) => j !== idx))}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        value={item.quantidade}
                        onChange={(e) => setItens((prev) => prev.map((i, j) => j === idx ? { ...i, quantidade: e.target.value } : i))}
                        className="w-24 h-8 text-xs"
                        placeholder="Consumo"
                        title={`Consumo de ${ins?.unidade ?? ""} para 1 ${form.unidade}`}
                      />
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {ins?.unidade ?? "un"}/{form.unidade}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">R$</span>
                      <Input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={priceDrafts[item.insumoId] ?? (ins?.precoUnitario != null ? String(Number(ins.precoUnitario)) : "")}
                        onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [item.insumoId]: e.target.value }))}
                        className="w-28 h-8 text-xs"
                        placeholder="Preço tabela"
                        title="Preço unitário da Tabela Mestre"
                      />
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">/{ins?.unidade ?? "un"}</span>
                    </div>
                    <span className="min-w-[92px] text-right text-xs font-mono text-muted-foreground">
                      = R$ {(
                        Number(item.quantidade || 0)
                        * Number(priceDrafts[item.insumoId] ?? ins?.precoUnitario ?? 0)
                      ).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <button type="button" className="hidden sm:block text-muted-foreground" onClick={() => setItens((prev) => prev.filter((_, j) => j !== idx))}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isPending || savingPrices}>{isPending || savingPrices ? "Salvando..." : "Salvar"}</Button>
      </div>
    </form>
  );
}

function ComposicaoEditDialog({
  tenantId,
  composicao,
}: {
  tenantId: string;
  composicao: {
    id: string;
    nome: string;
    descricao?: string | null;
    unidade: string;
    codigo?: string | null;
    etapaKey?: string | null;
    sistemasConstrutivos?: string[] | null;
    comumTodosSistemas?: boolean;
    ativo?: boolean;
    produtividadeDia?: string | number | null;
    equipePadrao?: number | null;
    horasDiaPadrao?: string | number | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading } = useGetComposicao(tenantId, composicao.id, {
    query: {
      enabled: open,
      queryKey: getGetComposicaoQueryKey(tenantId, composicao.id),
    },
  });
  const { mutateAsync: updateComposicao, isPending } = useUpdateComposicao();

  const detail = data as any;
  const initialItems: InsumoItem[] = (detail?.itens ?? []).map((item: any) => ({
    insumoId: item.insumoId,
    quantidade: String(item.quantidade ?? "1"),
  }));

  async function handleUpdate(payload: Record<string, unknown>) {
    await updateComposicao({
      tenantId,
      composicaoId: composicao.id,
      data: payload as any,
    });
    await Promise.all([
      qc.invalidateQueries({ queryKey: getListComposicoesQueryKey(tenantId) }),
      qc.invalidateQueries({ queryKey: getGetComposicaoQueryKey(tenantId, composicao.id) }),
    ]);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Editar composição">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar composição</DialogTitle></DialogHeader>
        {isLoading || !detail ? (
          <div className="space-y-2 py-4">
            <div className="h-10 bg-muted animate-pulse rounded" />
            <div className="h-28 bg-muted animate-pulse rounded" />
          </div>
        ) : (
          <ComposicaoForm
            key={`${composicao.id}-${initialItems.length}`}
            tenantId={tenantId}
            initial={{
              nome: detail.nome,
              descricao: detail.descricao ?? "",
              unidade: detail.unidade,
              codigo: detail.codigo ?? "",
              etapaKey: detail.etapaKey ?? "",
              sistemasConstrutivos: Array.isArray(detail.sistemasConstrutivos) ? detail.sistemasConstrutivos : [],
              comumTodosSistemas: detail.comumTodosSistemas === true,
              ativo: detail.ativo !== false,
              produtividadeDia: detail.produtividadeDia ?? "",
              equipePadrao: detail.equipePadrao ?? 1,
              horasDiaPadrao: detail.horasDiaPadrao ?? 8,
            }}
            initialItems={initialItems}
            onSave={handleUpdate}
            onCancel={() => setOpen(false)}
            isPending={isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Composicoes() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("todos");
  const [systemFilter, setSystemFilter] = useState("todos");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [applyingCatalog, setApplyingCatalog] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: composicoes = [], isLoading } = useListComposicoes(tenantId, {}, {
    query: { enabled: !!tenantId, queryKey: getListComposicoesQueryKey(tenantId) },
  });
  const { data: insumos = [] } = useListInsumos(tenantId, {}, {
    query: { enabled: !!tenantId, queryKey: getListInsumosQueryKey(tenantId) },
  });
  const { mutateAsync: createComposicao, isPending: isCreating } = useCreateComposicao();
  const { mutateAsync: deleteComposicao } = useDeleteComposicao();

  async function handleApplyStandardCatalog() {
    if (!tenantId || applyingCatalog) return;
    setApplyingCatalog(true);
    try {
      const token = localStorage.getItem("vendorai_token");
      const response = await fetch(`/api/tenants/${tenantId}/composicoes/catalogo-padrao/aplicar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível aplicar o catálogo padrão.");
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: getListComposicoesQueryKey(tenantId) }),
        qc.invalidateQueries({ queryKey: getListInsumosQueryKey(tenantId) }),
      ]);

      toast({
        title: "Catálogo padrão atualizado",
        description: `${result.composicoesCriadas ?? 0} composições e ${result.insumosCriados ?? 0} insumos adicionados. Itens existentes foram preservados.`,
      });
    } catch (error) {
      toast({
        title: "Erro ao aplicar catálogo padrão",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setApplyingCatalog(false);
    }
  }

  async function handleCreate(data: Record<string, unknown>) {
    await createComposicao({ tenantId, data: data as any });
    await qc.invalidateQueries({ queryKey: getListComposicoesQueryKey(tenantId) });
    setAddOpen(false);
  }

  async function handleCsvImport() {
    if (!importFile || !tenantId) return;
    setImporting(true);
    try {
      const rows = parseConstructionCsv(await importFile.text());
      if (!rows.length) throw new Error("O CSV está vazio ou não possui cabeçalho.");
      const byInsumoCode = new Map(insumos.filter((i) => i.codigo).map((i) => [i.codigo!.trim().toLowerCase(), i]));
      const byInsumoName = new Map(insumos.map((i) => [i.nome.trim().toLowerCase(), i]));
      const groups = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = (row.composicao_codigo || row.composicao_nome || row.codigo || row.nome || "").trim().toLowerCase();
        if (!key) continue;
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      const existing = new Set(composicoes.flatMap((item) => [item.codigo?.trim().toLowerCase(), item.nome.trim().toLowerCase()].filter(Boolean) as string[]));
      let imported = 0;
      let ignored = rows.length - [...groups.values()].reduce((sum, group) => sum + group.length, 0);
      for (const [key, group] of groups) {
        const first = group[0] as any;
        const nome = (first.composicao_nome || first.nome || "").trim();
        const codigo = (first.composicao_codigo || first.codigo || "").trim();
        const unidade = (first.unidade || "un").trim();
        if (!nome || existing.has(key)) { ignored += group.length; continue; }
        const itens = group.flatMap((row) => {
          const insumo = row.insumo_codigo
            ? byInsumoCode.get(row.insumo_codigo.trim().toLowerCase())
            : byInsumoName.get((row.insumo_nome || "").trim().toLowerCase());
          const quantidade = csvDecimal(row.quantidade);
          if (!insumo || !quantidade) { ignored += 1; return []; }
          return [{ insumoId: insumo.id, quantidade }];
        });
        if (!itens.length && group.some((row) => row.insumo_codigo || row.insumo_nome)) continue;
        const etapaKey = String(first.etapa_key || first.etapa || "").trim() as EtapaKey;
        const sistemasConstrutivos = String(first.sistemas_construtivos || first.sistemas || "")
          .split(/[|,]/)
          .map((item: string) => item.trim())
          .filter((item: string) => SISTEMAS_CONSTRUTIVOS.some(([value]) => value === item)) as SistemaConstrutivo[];
        const comumTodosSistemas = ["1", "true", "sim", "yes"].includes(
          String(first.comum_todos_sistemas || first.comum || "").trim().toLowerCase()
        );
        await createComposicao({ tenantId, data: {
          nome,
          unidade,
          ...(codigo ? { codigo } : {}),
          ...(first.descricao ? { descricao: first.descricao } : {}),
          ...(ETAPAS_COMPOSICAO.some(([value]) => value === etapaKey) ? { etapaKey } : {}),
          comumTodosSistemas: comumTodosSistemas || sistemasConstrutivos.length === 0,
          sistemasConstrutivos: comumTodosSistemas ? [] : sistemasConstrutivos,
          ativo: !["0", "false", "nao", "não"].includes(String(first.ativo || "").trim().toLowerCase()),
          ...(itens.length ? { itens } : {}),
        } as any });
        existing.add(key); existing.add(nome.toLowerCase()); imported += 1;
      }
      await qc.invalidateQueries({ queryKey: getListComposicoesQueryKey(tenantId) });
      toast({ title: `${imported} composição(ões) importada(s)`, description: ignored ? `${ignored} linha(s) foram ignoradas por duplicidade, dados inválidos ou insumo não encontrado.` : undefined });
      setImportOpen(false); setImportFile(null);
    } catch (error) {
      toast({ title: "Não foi possível importar o CSV", description: error instanceof Error ? error.message : "Confira o arquivo e tente novamente.", variant: "destructive" });
    } finally { setImporting(false); }
  }

  const filtered = composicoes.filter((c) => {
    const comp = c as any;
    if (search && !c.nome.toLowerCase().includes(search.toLowerCase())) return false;
    if (stageFilter !== "todos" && comp.etapaKey !== stageFilter) return false;
    if (systemFilter !== "todos") {
      const systems = Array.isArray(comp.sistemasConstrutivos) ? comp.sistemasConstrutivos : [];
      if (!comp.comumTodosSistemas && !systems.includes(systemFilter)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6 text-purple-500" />
            Composições
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Cadastro central de composições para alocação em obras</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-2" onClick={() => { window.location.href = "/insumos"; }}>
          <Package className="h-4 w-4" />Insumos
        </Button>
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-2"><Upload className="h-4 w-4" />Importar CSV</Button></DialogTrigger>
          <DialogContent className="w-full max-w-2xl">
            <DialogHeader><DialogTitle>Importar composições detalhadas</DialogTitle></DialogHeader>
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">Use uma linha para cada insumo. Repita os dados da composição nas linhas seguintes. O insumo deve estar previamente cadastrado e pode ser identificado pelo código ou nome.</p>
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => downloadCsvTemplate("modelo-composicoes.csv", "composicao_codigo;composicao_nome;descricao;unidade;etapa_key;sistemas_construtivos;comum_todos_sistemas;ativo;insumo_codigo;insumo_nome;quantidade\nCOMP-001;Parede de alvenaria;Composição por m²;m²;estrutura;alvenaria;nao;sim;MAT-001;;12,5\nCOMP-001;Parede de alvenaria;Composição por m²;m²;estrutura;alvenaria;nao;sim;MAT-002;;4,0\n")}><Download className="h-4 w-4" />Baixar modelo</Button>
              <Input type="file" accept=".csv,text/csv" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button><Button onClick={handleCsvImport} disabled={!importFile || importing}>{importing ? "Importando..." : "Importar"}</Button></div>
            </div>
          </DialogContent>
        </Dialog>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={handleApplyStandardCatalog}
          disabled={applyingCatalog}
        >
          <Package className="h-4 w-4" />
          {applyingCatalog ? "Aplicando catálogo..." : "Catálogo padrão"}
        </Button>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Nova composição</Button>
          </DialogTrigger>
          <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova composição</DialogTitle></DialogHeader>
            <ComposicaoForm tenantId={tenantId} onSave={handleCreate} onCancel={() => setAddOpen(false)} isPending={isCreating} />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_220px_220px]">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar composição..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
        >
          <option value="todos">Todas as etapas</option>
          {ETAPAS_COMPOSICAO.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          value={systemFilter}
          onChange={(e) => setSystemFilter(e.target.value)}
        >
          <option value="todos">Todos os sistemas</option>
          {SISTEMAS_CONSTRUTIVOS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Layers className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nenhuma composição cadastrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((comp) => {
            const isExpanded = expandedId === comp.id;
            return (
              <Card key={comp.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{comp.nome}</span>
                          <span className="text-xs px-2 py-0.5 bg-muted rounded font-mono">{comp.unidade}</span>
                          {comp.codigo && <span className="text-xs text-muted-foreground font-mono">#{comp.codigo}</span>}
                          {(comp as any).ativo === false && <span className="text-xs rounded bg-zinc-100 px-2 py-0.5 text-zinc-500">Inativa</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="text-[11px] rounded bg-blue-50 px-2 py-0.5 text-blue-700">
                            {etapaLabel((comp as any).etapaKey)}
                          </span>
                          {(comp as any).comumTodosSistemas ? (
                            <span className="text-[11px] rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">Comum a todos</span>
                          ) : (
                            ((comp as any).sistemasConstrutivos ?? []).map((system: string) => (
                              <span key={system} className="text-[11px] rounded bg-purple-50 px-2 py-0.5 text-purple-700">
                                {sistemaLabel(system)}
                              </span>
                            ))
                          )}
                        </div>
                        {comp.descricao && <p className="text-xs text-muted-foreground mt-0.5">{comp.descricao}</p>}
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Custo atual:</span>
                          <span className="font-mono font-semibold">
                            R$ {Number(comp.custoTotal ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/{comp.unidade}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpandedId(isExpanded ? null : comp.id)} title={isExpanded ? "Ocultar insumos" : "Ver insumos"}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <ComposicaoEditDialog tenantId={tenantId} composicao={comp} />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Excluir composição?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={async () => { await deleteComposicao({ tenantId, composicaoId: comp.id }); qc.invalidateQueries({ queryKey: getListComposicoesQueryKey(tenantId) }); }}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t">
                      <ComposicaoDetail tenantId={tenantId} composicaoId={comp.id} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
