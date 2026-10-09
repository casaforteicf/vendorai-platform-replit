import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2,
  Trash2, Pencil, TrendingDown, TrendingUp, DollarSign,
  BarChart3, X, ChevronDown, ChevronUp, FileSpreadsheet, ShoppingCart,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ObraEtapa } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lancamento {
  id: string;
  tipo: string;
  fornecedor?: string | null;
  numero?: string | null;
  valor: string;
  dataEmissao?: string | null;
  dataVencimento?: string | null;
  descricao?: string | null;
  status: string;
  etapaId?: string | null;
  observacoes?: string | null;
  createdAt: string;
}

interface DreData {
  orcamentoTotal: number;
  custoOrcado: number;
  totalGasto: number;
  totalGastoFinanceiro?: number;
  maoObraApontada?: number;
  totalPago: number;
  totalPendente: number;
  saldo: number;
  desvioCusto: number;
  percentualCustoRealizado: number;
  margemOrcada: number;
  margemOrcadaPct: number;
  orcamentoFonte: "orcamento_obra" | "obra_manual";
  orcamentoVinculado?: {
    id: string;
    versao: number;
    titulo?: string | null;
    status: string;
  } | null;
  porTipo: Array<{ tipo: string; total: number }>;
  etapas: Array<{ id: string; nome: string; custoOrcado: number; totalGasto: number; desvio: number | null }>;
  orcamentoEtapas: Array<{ id: string; nome: string; custoOrcado: number; valorVenda: number }>;
  semEtapa: number;
}

interface ExtractedDoc {
  tipo: string;
  fornecedor?: string;
  numero?: string;
  valor?: number;
  dataEmissao?: string;
  dataVencimento?: string;
  descricao?: string;
  observacoes?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPOS = [
  { value: "nota_fiscal",  label: "Nota Fiscal" },
  { value: "boleto",       label: "Boleto" },
  { value: "recibo",       label: "Recibo" },
  { value: "outros",       label: "Outros" },
];

const STATUS_OPTIONS = [
  { value: "pendente",   label: "Pendente" },
  { value: "pago",       label: "Pago" },
  { value: "cancelado",  label: "Cancelado" },
];

const STATUS_STYLE: Record<string, string> = {
  pendente:  "bg-amber-100 text-amber-800",
  pago:      "bg-emerald-100 text-emerald-800",
  cancelado: "bg-red-100 text-red-700 line-through",
};

const TIPO_LABEL: Record<string, string> = {
  nota_fiscal: "NF",
  boleto:      "Boleto",
  recibo:      "Recibo",
  outros:      "Outros",
  mao_de_obra_apontada: "Mão de obra apontada",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBRL(v: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y!, m! - 1, day!, 12).toLocaleDateString("pt-BR");
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Upload dropzone ──────────────────────────────────────────────────────────

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
        dragOver ? "border-blue-400 bg-blue-50" : "border-border hover:border-blue-300 hover:bg-muted/40"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.xml"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { onFile(f); e.target.value = ""; } }}
      />
      <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
      <p className="font-medium text-sm">Arraste ou clique para enviar documento</p>
      <p className="text-xs text-muted-foreground mt-1">PDF ou XML — NF-e, boleto, recibo (máx. 10 MB)</p>
    </div>
  );
}

// ─── Formulário de revisão / edição ──────────────────────────────────────────

type FormInitial = {
  tipo?: string | null;
  fornecedor?: string | null;
  numero?: string | null;
  valor?: string | number | null;
  dataEmissao?: string | null;
  dataVencimento?: string | null;
  descricao?: string | null;
  status?: string | null;
  etapaId?: string | null;
  observacoes?: string | null;
};

interface LancamentoFormProps {
  initial: FormInitial;
  etapas: ObraEtapa[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  title: string;
}

function LancamentoForm({ initial, etapas, onSave, onCancel, saving, title }: LancamentoFormProps) {
  const [form, setForm] = useState({
    tipo:            initial.tipo ?? "outros",
    fornecedor:      initial.fornecedor ?? "",
    numero:          initial.numero ?? "",
    valor:           initial.valor != null ? String(Number(initial.valor)) : String(initial.valor ?? ""),
    dataEmissao:     initial.dataEmissao ?? "",
    dataVencimento:  initial.dataVencimento ?? "",
    descricao:       initial.descricao ?? "",
    status:          initial.status ?? "pendente",
    etapaId:         initial.etapaId ?? "",
    observacoes:     initial.observacoes ?? "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    if (!payload.etapaId) delete payload.etapaId;
    Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
    await onSave(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tipo *</Label>
          <Select value={form.tipo} onValueChange={(v) => set("tipo", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Fornecedor</Label>
        <Input value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} placeholder="Nome do fornecedor / emitente" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Número do documento</Label>
          <Input value={form.numero} onChange={(e) => set("numero", e.target.value)} placeholder="Nº NF, boleto..." />
        </div>
        <div className="space-y-1.5">
          <Label>Valor (R$) *</Label>
          <Input type="number" step="0.01" min="0" required value={form.valor} onChange={(e) => set("valor", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Data de emissão</Label>
          <Input type="date" value={form.dataEmissao} onChange={(e) => set("dataEmissao", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Data de vencimento</Label>
          <Input type="date" value={form.dataVencimento} onChange={(e) => set("dataVencimento", e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Etapa da obra</Label>
        <Select value={form.etapaId || "__none__"} onValueChange={(v) => set("etapaId", v === "__none__" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Sem etapa" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Sem etapa</SelectItem>
            {etapas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Descrição dos itens</Label>
        <Textarea rows={2} value={form.descricao} onChange={(e) => set("descricao", e.target.value)} placeholder="Produtos ou serviços do documento..." />
      </div>

      <div className="space-y-1.5">
        <Label>Observações</Label>
        <Textarea rows={2} value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="ghost" className="flex-1" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" className="flex-1 gap-2" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {title}
        </Button>
      </div>
    </form>
  );
}

// ─── DRE Card ─────────────────────────────────────────────────────────────────

function DrePanel({
  dre,
  onOpenOrcamento,
}: {
  dre: DreData;
  onOpenOrcamento?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.max(0, dre.percentualCustoRealizado ?? 0);
  const over = dre.desvioCusto < 0;
  const hasStructuredBudget = dre.orcamentoFonte === "orcamento_obra" && !!dre.orcamentoVinculado;
  const structuredBudgetEmpty =
    hasStructuredBudget &&
    (dre.orcamentoEtapas.length === 0 || dre.custoOrcado <= 0 || dre.orcamentoTotal <= 0);
  const noStructuredBudget = !hasStructuredBudget;
  const budgetNeedsAction = structuredBudgetEmpty || noStructuredBudget;

  const budgetStatusLabel = hasStructuredBudget
    ? `Vinculado ao orçamento V${dre.orcamentoVinculado!.versao}${dre.orcamentoVinculado!.titulo ? ` — ${dre.orcamentoVinculado!.titulo}` : ""} • ${dre.orcamentoVinculado!.status}`
    : "Sem orçamento estruturado vinculado — referência pelo valor global da obra";

  return (
    <div className="border rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            Custos x Orçamento
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground truncate">
            {budgetStatusLabel}
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>

      {budgetNeedsAction && (
        <div className="border-t border-amber-200 bg-amber-50/80 px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" />
              <div>
                <p className="text-sm font-semibold text-amber-950">
                  {structuredBudgetEmpty
                    ? "Orçamento vinculado, porém sem etapas/itens"
                    : "Nenhum orçamento estruturado vinculado"}
                </p>
                <p className="text-xs text-amber-900/80 mt-0.5">
                  {structuredBudgetEmpty
                    ? "Preencha etapas, composições e itens do orçamento para liberar a comparação automática entre custo previsto e realizado."
                    : "Crie o orçamento da obra para que cada lançamento seja comparado automaticamente com o custo previsto."}
                </p>
              </div>
            </div>
            {onOpenOrcamento && (
              <Button
                type="button"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenOrcamento();
                }}
              >
                <FileSpreadsheet className="h-4 w-4" />
                {structuredBudgetEmpty ? "Preencher orçamento" : "Criar orçamento"}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 text-center px-0">
        {[
          {
            label: "Custo orçado",
            value: structuredBudgetEmpty ? "—" : fmtBRL(dre.custoOrcado),
            color: "text-blue-700",
          },
          { label: "Custo realizado", value: fmtBRL(dre.totalGasto), color: "text-orange-600" },
          {
            label: over ? "Estouro de custo" : "Saldo de custo",
            value: structuredBudgetEmpty ? "—" : fmtBRL(Math.abs(dre.desvioCusto)),
            color: over ? "text-red-600" : "text-emerald-700",
          },
          {
            label: "Orçamento / contrato",
            value: structuredBudgetEmpty ? "—" : fmtBRL(dre.orcamentoTotal),
            color: "text-slate-700",
          },
        ].map((item) => (
          <div key={item.label} className="py-3 px-2">
            <p className={`text-sm font-semibold ${item.color}`}>{item.value}</p>
            <p className="text-[10px] text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="px-4 pb-3 pt-3 border-t">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-blue-500"}`}
            style={{ width: `${structuredBudgetEmpty ? 0 : Math.min(100, pct)}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 mt-1">
          <p className="text-xs text-muted-foreground">
            {structuredBudgetEmpty
              ? "Aguardando itens do orçamento para calcular o consumo."
              : `${pct.toFixed(1)}% do custo orçado consumido`}
          </p>
          {!structuredBudgetEmpty && over && <p className="text-xs font-medium text-red-600">Acima do previsto</p>}
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 py-4 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="rounded-lg border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pago</p>
              <p className="text-sm font-semibold text-emerald-700 mt-1">{fmtBRL(dre.totalPago)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">A pagar</p>
              <p className="text-sm font-semibold text-amber-700 mt-1">{fmtBRL(dre.totalPendente)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">M.O. apontada</p>
              <p className="text-sm font-semibold text-orange-700 mt-1">{fmtBRL(dre.maoObraApontada ?? 0)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">BDI / margem orçada</p>
              <p className="text-sm font-semibold mt-1">{structuredBudgetEmpty ? "—" : fmtBRL(dre.margemOrcada)}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Margem orçada</p>
              <p className="text-sm font-semibold mt-1">{structuredBudgetEmpty ? "—" : `${dre.margemOrcadaPct.toFixed(1)}%`}</p>
            </div>
          </div>

          {dre.etapas.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Compatibilização por etapa</p>
                <div className="hidden md:flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span>Orçado</span><span>Realizado</span><span>Desvio</span>
                </div>
              </div>
              <div className="space-y-2">
                {dre.etapas.map((e) => {
                  const etapaOver = e.desvio != null && e.desvio < 0;
                  return (
                    <div key={e.id} className="rounded-lg border px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium truncate">{e.nome}</span>
                        <span className={`text-xs font-semibold ${etapaOver ? "text-red-600" : "text-emerald-700"}`}>
                          {e.desvio == null ? "Sem referência" : etapaOver ? `+${fmtBRL(Math.abs(e.desvio))}` : fmtBRL(e.desvio)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-1 text-xs text-muted-foreground">
                        <span>Orçado: {e.custoOrcado > 0 ? fmtBRL(e.custoOrcado) : "—"}</span>
                        <span className="text-right">Realizado: {fmtBRL(e.totalGasto)}</span>
                      </div>
                    </div>
                  );
                })}
                {dre.semEtapa > 0 && (
                  <div className="flex items-center justify-between rounded-lg border border-dashed px-3 py-2 text-sm">
                    <span className="text-muted-foreground italic">Lançamentos sem etapa</span>
                    <span className="font-medium">{fmtBRL(dre.semEtapa)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {dre.porTipo.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Custos por origem</p>
              <div className="space-y-1.5">
                {dre.porTipo.map((t) => (
                  <div key={t.tipo} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{TIPO_LABEL[t.tipo] ?? t.tipo}</span>
                    <span className="font-medium">{fmtBRL(t.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function FinanceiroV19Panel({ tenantId, obraId }: { tenantId: string; obraId: string }) {
  const [fluxo, setFluxo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [tipo, setTipo] = useState<"pagar" | "receber">("pagar");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [contraparte, setContraparte] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/financeiro/fluxo-caixa`, { headers: authHeaders() });
      if (res.ok) setFluxo(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [tenantId, obraId]);

  async function syncCompras() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/financeiro/sincronizar-compras`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Erro ao sincronizar compras.");
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function criarTitulo() {
    if (!descricao.trim() || Number(valor) <= 0) return;
    const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/financeiro/titulos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        tipo,
        origem: "manual",
        descricao: descricao.trim(),
        contraparte: contraparte || undefined,
        dataVencimento: vencimento || undefined,
        valorOriginal: valor,
        status: "aberto",
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return alert(body?.error ?? "Erro ao criar título.");
    setDescricao(""); setValor(""); setVencimento(""); setContraparte("");
    await load();
  }

  async function liquidar(titulo: any) {
    const valorMov = prompt(`Valor para ${titulo.tipo === "pagar" ? "pagar" : "receber"} (aberto: ${fmtBRL(titulo.valorAberto)}):`, String(titulo.valorAberto ?? ""));
    if (!valorMov || Number(valorMov) <= 0) return;
    const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/financeiro/titulos/${titulo.id}/movimentos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        tipo: titulo.tipo === "pagar" ? "pagamento" : "recebimento",
        dataMovimento: new Date().toISOString().slice(0,10),
        valor: valorMov,
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return alert(body?.error ?? "Erro ao registrar movimento.");
    await load();
  }

  const t = fluxo?.totais ?? {};
  const titulos = fluxo?.titulos ?? [];

  return (
    <div className="border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm">Fluxo de caixa da obra</h3>
          <p className="text-xs text-muted-foreground">Contas a pagar/receber, compras, pagamentos, recebimentos e custo realizado.</p>
        </div>
        <Button size="sm" variant="outline" onClick={syncCompras} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-1" />}
          Sincronizar compras
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded border p-3"><div className="text-xs text-muted-foreground">A pagar</div><div className="font-bold">{fmtBRL(t.pagarAberto)}</div></div>
        <div className="rounded border p-3"><div className="text-xs text-muted-foreground">A receber</div><div className="font-bold">{fmtBRL(t.receberAberto)}</div></div>
        <div className="rounded border p-3"><div className="text-xs text-muted-foreground">Saldo caixa</div><div className="font-bold">{fmtBRL(t.saldoCaixa)}</div></div>
        <div className="rounded border p-3"><div className="text-xs text-muted-foreground">Custo realizado</div><div className="font-bold">{fmtBRL(t.custoRealizado)}</div></div>
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        <Select value={tipo} onValueChange={(v) => setTipo(v as "pagar" | "receber")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="pagar">Conta a pagar</SelectItem><SelectItem value="receber">Conta a receber</SelectItem></SelectContent>
        </Select>
        <Input placeholder="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        <Input placeholder="Contraparte" value={contraparte} onChange={(e) => setContraparte(e.target.value)} />
        <Input type="number" step="0.01" placeholder="Valor" value={valor} onChange={(e) => setValor(e.target.value)} />
        <div className="flex gap-2"><Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /><Button onClick={criarTitulo}>Adicionar</Button></div>
      </div>

      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <div className="space-y-1.5">
          {titulos.slice(0, 30).map((x: any) => (
            <div key={x.id} className="rounded border px-3 py-2 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="font-medium truncate">{x.descricao}</div>
                <div className="text-muted-foreground">
                  {x.tipo === "pagar" ? "Pagar" : "Receber"} · {x.contraparte || "sem contraparte"}{x.dataVencimento ? ` · venc. ${fmtDate(x.dataVencimento)}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right"><div className="font-semibold">{fmtBRL(x.valorAberto)}</div><div className="text-muted-foreground">{x.status}</div></div>
                {!["pago","recebido","cancelado"].includes(x.status) && <Button size="sm" variant="outline" onClick={() => liquidar(x)}>Liquidar</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TabFinanceiro({
  tenantId,
  obraId,
  etapas,
  onOpenOrcamento,
}: {
  tenantId: string;
  obraId: string;
  etapas: ObraEtapa[];
  onOpenOrcamento?: () => void;
}) {
  // ── State ──
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [dre, setDre] = useState<DreData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Upload / analysis
  const [analyzing, setAnalyzing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedDoc | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Review dialog
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit dialog
  const [editItem, setEditItem] = useState<Lancamento | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // ── Data loading ──
  async function loadData() {
    setLoadingData(true);
    try {
      const [lRes, dRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/obras/${obraId}/lancamentos`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/obras/${obraId}/financeiro/dre`, { headers: authHeaders() }),
      ]);
      if (lRes.ok) setLancamentos(await lRes.json() as Lancamento[]);
      if (dRes.ok) setDre(await dRes.json() as DreData);
    } finally {
      setLoadingData(false);
      setLoaded(true);
    }
  }

  // Load on first render
  if (!loaded && !loadingData) loadData();

  // ── File upload → AI analysis ──
  async function handleFile(file: File) {
    setAnalyzeError(null);
    setExtracted(null);
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("documento", file);
      const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/lancamentos/analisar`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });
      const json = await res.json() as any;
      if (!res.ok) throw new Error(json.error ?? "Falha na análise.");
      setExtracted(json.extracted as ExtractedDoc);
      setReviewOpen(true);
    } catch (err: any) {
      setAnalyzeError(err.message ?? "Erro ao analisar documento.");
    } finally {
      setAnalyzing(false);
    }
  }

  // ── Save new lancamento ──
  async function handleSaveLancamento(data: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/lancamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err.error ?? "Erro ao salvar.");
      }
      const row = await res.json() as Lancamento;
      setLancamentos((prev) => [row, ...prev]);
      setReviewOpen(false);
      setExtracted(null);
      await loadData(); // refresh DRE
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Update lancamento ──
  async function handleUpdate(data: Record<string, unknown>) {
    if (!editItem) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/lancamentos/${editItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erro ao atualizar.");
      setEditItem(null);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  // ── Delete lancamento ──
  async function handleDelete(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    await fetch(`/api/tenants/${tenantId}/obras/${obraId}/lancamentos/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    setLancamentos((prev) => prev.filter((l) => l.id !== id));
    await loadData();
  }

  // ── Manual add ──
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);

  async function handleManualSave(data: Record<string, unknown>) {
    setManualSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/obras/${obraId}/lancamentos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err.error ?? "Erro ao salvar.");
      }
      const row = await res.json() as Lancamento;
      setLancamentos((prev) => [row, ...prev]);
      setManualOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setManualSaving(false);
    }
  }

  // ── Render ──
  return (
    <div className="space-y-6">

      {/* ── DRE ── */}
      {dre && <DrePanel dre={dre} onOpenOrcamento={onOpenOrcamento} />}

      <FinanceiroV19Panel tenantId={tenantId} obraId={obraId} />

      {/* ── Upload + actions ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Upload de documento</h3>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => setManualOpen(true)}
          >
            + Lançamento manual
          </Button>
        </div>

        {analyzing ? (
          <div className="border-2 border-dashed rounded-xl p-8 text-center">
            <Loader2 className="h-8 w-8 mx-auto mb-3 text-blue-500 animate-spin" />
            <p className="text-sm font-medium">Analisando documento com IA...</p>
            <p className="text-xs text-muted-foreground mt-1">Claude Sonnet está extraindo os dados</p>
          </div>
        ) : (
          <UploadZone onFile={handleFile} />
        )}

        {analyzeError && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {analyzeError}
          </div>
        )}
      </div>

      {/* ── Lançamentos list ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Lançamentos</h3>
          {loadingData && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        {lancamentos.length === 0 && !loadingData ? (
          <p className="text-sm text-center text-muted-foreground py-8">
            Nenhum lançamento registrado. Faça upload de um documento ou adicione manualmente.
          </p>
        ) : (
          <div className="border rounded-xl overflow-hidden divide-y">
            {lancamentos.map((l) => (
              <div key={l.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="mt-0.5 shrink-0">
                  <FileText className="h-4 w-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted font-medium">{TIPO_LABEL[l.tipo] ?? l.tipo}</span>
                    {l.fornecedor && <span className="text-sm font-medium truncate">{l.fornecedor}</span>}
                    {l.numero && <span className="text-xs text-muted-foreground">#{l.numero}</span>}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[l.status] ?? "bg-muted"}`}>
                      {STATUS_OPTIONS.find((s) => s.value === l.status)?.label ?? l.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    {l.descricao && <span className="truncate max-w-[280px]">{l.descricao}</span>}
                    {l.dataVencimento && <span>Venc: {fmtDate(l.dataVencimento)}</span>}
                    {l.etapaId && etapas.find((e) => e.id === l.etapaId) && (
                      <span>Etapa: {etapas.find((e) => e.id === l.etapaId)?.nome}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{fmtBRL(l.valor)}</p>
                  <div className="flex items-center gap-1 mt-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditItem(l)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-700" onClick={() => handleDelete(l.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Review Dialog (post-AI analysis) ── */}
      <Dialog open={reviewOpen} onOpenChange={(o) => { if (!o) { setReviewOpen(false); setExtracted(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Revisão do documento extraído
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">Confira os dados extraídos pela IA antes de confirmar.</p>
          {extracted && (
            <LancamentoForm
              initial={extracted}
              etapas={etapas}
              onSave={handleSaveLancamento}
              onCancel={() => { setReviewOpen(false); setExtracted(null); }}
              saving={saving}
              title="Confirmar lançamento"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-blue-600" />
              Editar lançamento
            </DialogTitle>
          </DialogHeader>
          {editItem && (
            <LancamentoForm
              initial={editItem}
              etapas={etapas}
              onSave={handleUpdate}
              onCancel={() => setEditItem(null)}
              saving={editSaving}
              title="Salvar alterações"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Manual add Dialog ── */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              Novo lançamento manual
            </DialogTitle>
          </DialogHeader>
          <LancamentoForm
            initial={{ tipo: "outros", status: "pendente" }}
            etapas={etapas}
            onSave={handleManualSave}
            onCancel={() => setManualOpen(false)}
            saving={manualSaving}
            title="Salvar lançamento"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
