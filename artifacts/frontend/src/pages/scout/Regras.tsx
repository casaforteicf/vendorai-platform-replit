import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, TrendingUp, Zap, Pencil, Trash2, Upload, Download } from "lucide-react";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
function authHeaders() {
  const t = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

const TIPO_OPTS = [
  { value: "recompra",    label: "Recompra" },
  { value: "cross_sell",  label: "Cross-sell" },
  { value: "reativacao",  label: "Reativação" },
  { value: "upgrade",     label: "Upgrade" },
  { value: "aniversario", label: "Aniversário" },
  { value: "sequencia_produto", label: "Sequência de produto" },
  { value: "reativacao_sazonal", label: "Reativação sazonal (por mês)" },
  { value: "orcamento_parado", label: "Orçamento parado" },
  { value: "grade_incompleta", label: "Grade incompleta (tamanho/cor)" },
  { value: "receita_vencendo", label: "Receita médica vencendo" },
  { value: "produto_vencendo", label: "Produto com validade próxima" },
  { value: "limite_credito_disponivel", label: "Limite de crédito disponível" },
  { value: "whitespace_seguro",  label: "Whitespace de seguros (por perfil)" },
  { value: "renovacao_seguro",   label: "Renovação de apólices" },
];
const TIPO_COLORS: Record<string, string> = {
  recompra:    "bg-blue-50 text-blue-700 border-blue-200",
  cross_sell:  "bg-indigo-50 text-indigo-700 border-indigo-200",
  reativacao:  "bg-amber-50 text-amber-700 border-amber-200",
  upgrade:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  aniversario: "bg-pink-50 text-pink-700 border-pink-200",
  sequencia_produto:  "bg-violet-50 text-violet-700 border-violet-200",
  reativacao_sazonal: "bg-teal-50 text-teal-700 border-teal-200",
  orcamento_parado:   "bg-rose-50 text-rose-700 border-rose-200",
  grade_incompleta:   "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  receita_vencendo:   "bg-red-50 text-red-700 border-red-200",
  produto_vencendo:   "bg-orange-50 text-orange-700 border-orange-200",
  limite_credito_disponivel: "bg-lime-50 text-lime-700 border-lime-200",
  whitespace_seguro:  "bg-cyan-50 text-cyan-700 border-cyan-200",
  renovacao_seguro:   "bg-orange-50 text-orange-700 border-orange-200",
};
// Tipos cuja lógica de disparo é 100% controlada pelo motor no backend — o
// tenant só liga/desliga; não recebe mensagem/canal customizado próprio, pois
// o motor já gera a notificação para cada apólice/gap específico.
const ENGINE_MANAGED_TIPOS = new Set(["whitespace_seguro", "renovacao_seguro"]);
const SUPPORTED_TIPOS = new Set(TIPO_OPTS.map((tipo) => tipo.value).concat([
  "follow_up", "renovacao", "manutencao", "risco_nao_renovacao", "sinal_praca_ai",
]));
const CHIPS = ["{{nome}}", "{{servico}}", "{{desconto}}"];

type ImportedRule = Record<string, any>;

function mapImportedTipo(tipoOriginal: string) {
  if (SUPPORTED_TIPOS.has(tipoOriginal)) return tipoOriginal;
  if (tipoOriginal.includes("aniversario")) return "aniversario";
  if (/reativacao|recuperacao_cancelado/.test(tipoOriginal)) return "reativacao";
  if (/baixa_frequencia|falta_recorrencia|assinatura_automatica|reposicao_urgente/.test(tipoOriginal)) return "recompra";
  if (/cross_sell|kit_sazonal|promo_dependente|parceria_clinica|servico_farmaceutico/.test(tipoOriginal)) return "cross_sell";
  if (/upgrade|ticket_baixo|ampliacao_categoria|digitalizacao|omnichannel|ativacao_empresa|migracao_filial/.test(tipoOriginal)) return "upgrade";
  if (/receita/.test(tipoOriginal)) return "receita_vencendo";
  return "follow_up";
}

function normalizeImportedRule(item: ImportedRule) {
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Uma das regras não é um objeto válido.");
  const nome = typeof item.nome === "string" ? item.nome.trim() : "";
  const tipoOriginal = typeof item.tipo === "string" ? item.tipo.trim() : "";
  if (!nome || !tipoOriginal) throw new Error("Cada regra precisa ter nome e tipo.");
  const tipo = mapImportedTipo(tipoOriginal);
  const condicoesOriginais = item.condicoes && typeof item.condicoes === "object" && !Array.isArray(item.condicoes) ? item.condicoes : {};
  const condicoes: Record<string, unknown> = {
    ...condicoesOriginais,
    ...(tipoOriginal !== tipo ? { tipoOriginal } : {}),
    ...(item.segmento ? { segmento: item.segmento } : {}),
    ...(item.metricas ? { metricas: item.metricas } : {}),
  };
  if (tipo === "reativacao" && condicoes.diasSemVisita === undefined) {
    const diasNoTipo = tipoOriginal.match(/(\d+)_?dias/)?.[1];
    condicoes.diasSemVisita = diasNoTipo ? Number(diasNoTipo) : 60;
  }
  if (tipo === "recompra" && condicoes.diasSemCompra === undefined) condicoes.diasSemCompra = 30;
  const acaoOriginal = item.acao && typeof item.acao === "object" && !Array.isArray(item.acao) ? item.acao : {};
  const mensagem = typeof acaoOriginal.mensagem === "string" ? acaoOriginal.mensagem.replace(/\{nome\}/g, "{{nome}}") : "";
  return {
    nome, tipo, condicoes,
    acao: { ...acaoOriginal, mensagem, requiresApproval: acaoOriginal.requiresApproval !== false },
    ativo: item.ativo !== false && item.status !== "inativo",
    mapped: tipoOriginal !== tipo,
  };
}

function extractImportedRules(parsed: unknown): ImportedRule[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const envelope = parsed as Record<string, unknown>;
    if (Array.isArray(envelope.rules)) return envelope.rules as ImportedRule[];
    if (Array.isArray(envelope.regras)) return envelope.regras as ImportedRule[];
  }
  throw new Error("O arquivo precisa conter uma lista de regras ou um objeto com a propriedade 'rules'.");
}

interface FormState {
  nome: string;
  tipo: string;
  canal: string;
  mensagem: string;
  // condições por tipo
  diasSemRetornar: string;
  diasSemVisita: string;
  servicoBase: string;
  servicoSugerido: string;
  servicoAtual: string;
  servicoPremium: string;
  produtoOrigemId: string;
  produtoSugeridoId: string;
  diasApos: string;
  mesGatilho: string;
  diasSemCompraMinimo: string;
  diasParado: string;
  valorMinimo: string;
  diasAntesVencimento: string;
  diasAntesVencimentoProduto: string;
  percentualMaximoUtilizado: string;
  requerAprovacao: boolean;
}
const EMPTY_FORM: FormState = {
  nome: "", tipo: "", canal: "whatsapp", mensagem: "",
  diasSemRetornar: "30", diasSemVisita: "60",
  servicoBase: "", servicoSugerido: "",
  servicoAtual: "", servicoPremium: "",
  produtoOrigemId: "", produtoSugeridoId: "", diasApos: "15",
  mesGatilho: "10", diasSemCompraMinimo: "0",
  diasParado: "7", valorMinimo: "",
  diasAntesVencimento: "5",
  diasAntesVencimentoProduto: "15",
  percentualMaximoUtilizado: "50",
  requerAprovacao: true,
};

export default function Regras() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen]   = useState(false);
  const [form, setForm]   = useState<FormState>({ ...EMPTY_FORM });
  const msgRef            = useRef<HTMLTextAreaElement>(null);

  const QK = ["scout-regras", tenantId];

  const { data: regras = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/scout/regras`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  // Só busca o catálogo quando o form de "Sequência de produto" está aberto
  const { data: produtos = [] } = useQuery<any[]>({
    queryKey: ["produtos-catalogo", tenantId],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : [])),
    enabled: !!tenantId && open && form.tipo === "sequencia_produto",
  });
  const produtosArr = Array.isArray(produtos) ? produtos : [];

  function buildPayload() {
    let condicoes: Record<string, unknown> = {};
    // Nomes abaixo têm que bater exatamente com o que o motor lê em
    // revenueScout.ts — não são só rótulos de exibição.
    if (form.tipo === "recompra")   condicoes = { diasSemCompra: Number(form.diasSemRetornar) };
    if (form.tipo === "reativacao") condicoes = { diasSemVisita: Number(form.diasSemVisita) };
    if (form.tipo === "cross_sell") condicoes = { servicoId: form.servicoBase, servicoSugeridoId: form.servicoSugerido };
    if (form.tipo === "upgrade")    condicoes = { servicoAtualId: form.servicoAtual, servicoPremiumId: form.servicoPremium };
    if (form.tipo === "aniversario") condicoes = {};
    if (form.tipo === "sequencia_produto") {
      condicoes = {
        produtoOrigemId: form.produtoOrigemId,
        produtoSugeridoId: form.produtoSugeridoId,
        diasApos: Number(form.diasApos),
      };
    }
    if (form.tipo === "reativacao_sazonal") {
      condicoes = {
        mesGatilho: Number(form.mesGatilho),
        diasSemCompraMinimo: Number(form.diasSemCompraMinimo || 0),
      };
    }
    if (form.tipo === "orcamento_parado") {
      condicoes = {
        diasParado: Number(form.diasParado || 7),
        ...(form.valorMinimo ? { valorMinimo: Number(form.valorMinimo) } : {}),
      };
    }
    if (form.tipo === "grade_incompleta") {
      condicoes = { diasApos: Number(form.diasApos || 7) };
    }
    if (form.tipo === "receita_vencendo") {
      condicoes = { diasAntesVencimento: Number(form.diasAntesVencimento || 5) };
    }
    if (form.tipo === "produto_vencendo") {
      condicoes = { diasAntesVencimentoProduto: Number(form.diasAntesVencimentoProduto || 15) };
    }
    if (form.tipo === "limite_credito_disponivel") {
      condicoes = { percentualMaximoUtilizado: Number(form.percentualMaximoUtilizado || 50) };
    }
    if (ENGINE_MANAGED_TIPOS.has(form.tipo)) condicoes = {};
    const acao = ENGINE_MANAGED_TIPOS.has(form.tipo)
      ? { requiresApproval: true, autoSend: false }
      : { mensagem: form.mensagem, canal: form.canal, requiresApproval: form.requerAprovacao };
    return {
      nome: form.nome,
      tipo: form.tipo,
      condicoes,
      acao,
    };
  }

  const create = useMutation({
    mutationFn: (payload: any) =>
      fetch(`/api/tenants/${tenantId}/scout/regras`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: "Regra criada!" });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggle = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/tenants/${tenantId}/scout/regras/${id}/toggle`, {
        method: "PATCH", headers: authHeaders(),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError: () => toast({ title: "Erro", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/tenants/${tenantId}/scout/regras/${id}`, {
        method: "DELETE", headers: authHeaders(),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro ao excluir");
        return true;
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK }); toast({ title: "Regra excluída" }); },
    onError: (e: any) => toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" }),
  });

  const editMut = useMutation({
    mutationFn: (payload: { id: string; nome: string; ativo: boolean; condicoes: any; acao: any }) =>
      fetch(`/api/tenants/${tenantId}/scout/regras/${payload.id}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ nome: payload.nome, ativo: payload.ativo, condicoes: payload.condicoes, acao: payload.acao }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro ao salvar");
        return r.json();
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK }); toast({ title: "Regra atualizada!" }); setEditOpen(false); },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editNome, setEditNome] = useState("");
  const [editAtivo, setEditAtivo] = useState(true);
  const [editCondicoesJson, setEditCondicoesJson] = useState("{}");
  const [editMensagem, setEditMensagem] = useState("");
  const [editCanal, setEditCanal] = useState("whatsapp");
  const [editRequerAprovacao, setEditRequerAprovacao] = useState(true);
  const [editJsonError, setEditJsonError] = useState<string | null>(null);

  function openEdit(r: any) {
    setEditTarget(r);
    setEditNome(r.nome ?? "");
    setEditAtivo(r.ativo !== false);
    setEditCondicoesJson(JSON.stringify(r.condicoes ?? {}, null, 2));
    setEditMensagem(r.acao?.mensagem ?? "");
    setEditCanal(r.acao?.canal ?? "whatsapp");
    setEditRequerAprovacao(r.acao?.requiresApproval !== false);
    setEditJsonError(null);
    setEditOpen(true);
  }

  function submitEdit() {
    if (!editTarget) return;
    let condicoes: any;
    try {
      condicoes = JSON.parse(editCondicoesJson);
    } catch {
      setEditJsonError("JSON inválido — confira vírgulas e chaves.");
      return;
    }
    setEditJsonError(null);
    const isEngineManaged = ENGINE_MANAGED_TIPOS.has(editTarget.tipo);
    const acao = isEngineManaged
      ? editTarget.acao ?? { requiresApproval: true, autoSend: false }
      : { mensagem: editMensagem, canal: editCanal, requiresApproval: editRequerAprovacao };
    editMut.mutate({ id: editTarget.id, nome: editNome, ativo: editAtivo, condicoes, acao });
  }

  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  function exportRegras() {
    const blob = new Blob([JSON.stringify(regrasArr.map((r: any) => ({ nome: r.nome, tipo: r.tipo, condicoes: r.condicoes, acao: r.acao })), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "regras_scout.json"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const items = extractImportedRules(JSON.parse(text)).map(normalizeImportedRule);
      let ok = 0; let fail = 0; let mapped = 0; let firstError = "";
      for (const item of items) {
        try {
          const res = await fetch(`/api/tenants/${tenantId}/scout/regras`, {
            method: "POST", headers: authHeaders(),
            body: JSON.stringify({ nome: item.nome, tipo: item.tipo, condicoes: item.condicoes, acao: item.acao, ativo: item.ativo }),
          });
          if (res.ok) { ok++; if (item.mapped) mapped++; }
          else {
            fail++;
            const error = await res.json().catch(() => ({}));
            if (!firstError) firstError = error.error ?? `HTTP ${res.status}`;
          }
        } catch (error: any) {
          fail++;
          if (!firstError) firstError = error?.message ?? "Erro de conexão";
        }
      }
      qc.invalidateQueries({ queryKey: QK });
      toast({
        title: fail ? "Importação concluída com ressalvas" : "Importação concluída",
        description: `${ok} regra(s) importada(s)${mapped ? `; ${mapped} tipo(s) adaptado(s) ao Revenue Scout` : ""}${fail ? `; ${fail} falharam. ${firstError}` : ""}.`,
        variant: ok === 0 ? "destructive" : "default",
      });
    } catch (err: any) {
      toast({ title: "Erro ao importar", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  function insertChip(chip: string) {
    const el = msgRef.current;
    if (!el) { setForm((f) => ({ ...f, mensagem: f.mensagem + chip })); return; }
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    const next  = el.value.slice(0, start) + chip + el.value.slice(end);
    setForm((f) => ({ ...f, mensagem: next }));
    setTimeout(() => { el.focus(); el.setSelectionRange(start + chip.length, start + chip.length); }, 0);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome || !form.tipo) {
      toast({ title: "Nome e tipo são obrigatórios", variant: "destructive" });
      return;
    }
    if (!ENGINE_MANAGED_TIPOS.has(form.tipo) && !form.mensagem) {
      toast({ title: "Mensagem é obrigatória", variant: "destructive" });
      return;
    }
    create.mutate(buildPayload());
  }

  const regrasArr = Array.isArray(regras) ? regras : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-5 w-5" /> Regras do Revenue Scout
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure gatilhos automáticos para identificar oportunidades de receita
          </p>
        </div>
        <div className="flex items-center gap-2">
          {regrasArr.length > 0 && (
            <Button variant="outline" onClick={exportRegras}><Download className="h-4 w-4 mr-2" /> Exportar</Button>
          )}
          <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
          <Button variant="outline" disabled={importing} onClick={() => importInputRef.current?.click()}>
            {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />} Importar
          </Button>
          <Button onClick={() => { setForm({ ...EMPTY_FORM }); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Nova Regra
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : regrasArr.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <Zap className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhuma regra cadastrada.</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Crie regras para o scout identificar oportunidades automaticamente.
          </p>
          <Button variant="outline" onClick={() => { setForm({ ...EMPTY_FORM }); setOpen(true); }}>
            Criar primeira regra
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {regrasArr.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-semibold text-sm">{r.nome}</p>
                      <Badge variant="outline" className={`text-xs ${TIPO_COLORS[r.tipo] ?? ""}`}>
                        {TIPO_OPTS.find((t) => t.value === r.tipo)?.label ?? r.tipo}
                      </Badge>
                      {!r.ativo && (
                        <Badge variant="outline" className="text-xs bg-slate-50 text-slate-500">Inativa</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{r.totalDisparos ?? 0} disparos</span>
                      {r.acao?.canal && (
                        <span className="capitalize">Canal: {r.acao.canal === "whatsapp" ? "WhatsApp" : "E-mail"}</span>
                      )}
                    </div>
                    {r.acao?.mensagem && (
                      <p className="text-xs text-muted-foreground mt-1 truncate max-w-xl italic">
                        "{r.acao.mensagem}"
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={r.ativo !== false}
                    onCheckedChange={() => toggle.mutate(r.id)}
                    disabled={toggle.isPending}
                  />
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={remove.isPending} onClick={() => { if (confirm(`Excluir a regra "${r.nome}"? Isso não pode ser desfeito.`)) remove.mutate(r.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog nova regra */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Regra</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome <span className="text-destructive">*</span></Label>
              <Input placeholder="Ex: Recompra mensal" value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>

            {/* Tipo */}
            <div className="space-y-1.5">
              <Label>Tipo <span className="text-destructive">*</span></Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  {TIPO_OPTS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Condições dinâmicas */}
            {form.tipo === "recompra" && (
              <div className="space-y-1.5 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={365} className="w-24"
                    value={form.diasSemRetornar}
                    onChange={(e) => setForm((f) => ({ ...f, diasSemRetornar: e.target.value }))} />
                  <span className="text-sm text-muted-foreground">dias sem retornar</span>
                </div>
              </div>
            )}
            {form.tipo === "reativacao" && (
              <div className="space-y-1.5 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={365} className="w-24"
                    value={form.diasSemVisita}
                    onChange={(e) => setForm((f) => ({ ...f, diasSemVisita: e.target.value }))} />
                  <span className="text-sm text-muted-foreground">dias sem visita</span>
                </div>
              </div>
            )}
            {form.tipo === "cross_sell" && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <p className="text-xs text-muted-foreground">
                  IDs de serviço (veja em Catálogo → Serviços) — cross-sell só existe hoje pra Beleza/Clínica.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">ID do serviço base</Label>
                  <Input placeholder="ID do serviço já usado pelo cliente" value={form.servicoBase}
                    onChange={(e) => setForm((f) => ({ ...f, servicoBase: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ID do serviço sugerido</Label>
                  <Input placeholder="ID do serviço a oferecer" value={form.servicoSugerido}
                    onChange={(e) => setForm((f) => ({ ...f, servicoSugerido: e.target.value }))} />
                </div>
              </div>
            )}
            {form.tipo === "upgrade" && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <p className="text-xs text-muted-foreground">
                  IDs de serviço (veja em Catálogo → Serviços) — upgrade só existe hoje pra Beleza/Clínica.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">ID do serviço atual</Label>
                  <Input placeholder="ID do serviço/especialidade atual" value={form.servicoAtual}
                    onChange={(e) => setForm((f) => ({ ...f, servicoAtual: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ID do serviço premium</Label>
                  <Input placeholder="ID do serviço/especialidade a oferecer" value={form.servicoPremium}
                    onChange={(e) => setForm((f) => ({ ...f, servicoPremium: e.target.value }))} />
                </div>
              </div>
            )}
            {form.tipo === "aniversario" && (
              <div className="p-3 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                Dispara automaticamente no aniversário do cliente. Nenhuma condição adicional necessária.
              </div>
            )}
            {form.tipo === "sequencia_produto" && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <p className="text-xs text-muted-foreground">
                  Quando o cliente compra o produto de origem, sugere o produto seguinte após X dias.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Produto de origem</Label>
                  <Select value={form.produtoOrigemId} onValueChange={(v) => setForm((f) => ({ ...f, produtoOrigemId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                    <SelectContent>
                      {produtosArr.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Produto sugerido</Label>
                  <Select value={form.produtoSugeridoId} onValueChange={(v) => setForm((f) => ({ ...f, produtoSugeridoId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                    <SelectContent>
                      {produtosArr.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={365} className="w-24"
                    value={form.diasApos}
                    onChange={(e) => setForm((f) => ({ ...f, diasApos: e.target.value }))} />
                  <span className="text-sm text-muted-foreground">dias após a compra</span>
                </div>
              </div>
            )}
            {form.tipo === "reativacao_sazonal" && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <p className="text-xs text-muted-foreground">
                  A partir do mês escolhido, dispara pra clientes que compraram em temporadas passadas mas ainda não compraram nesse ano. Uma oportunidade por cliente por ano.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mês de início da campanha</Label>
                  <Select value={form.mesGatilho} onValueChange={(v) => setForm((f) => ({ ...f, mesGatilho: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Dias mínimos sem comprar (opcional)</Label>
                  <Input type="number" min={0} value={form.diasSemCompraMinimo}
                    onChange={(e) => setForm((f) => ({ ...f, diasSemCompraMinimo: e.target.value }))} />
                </div>
              </div>
            )}
            {form.tipo === "orcamento_parado" && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <p className="text-xs text-muted-foreground">
                  Dispara pra orçamentos enviados/pendentes que não avançaram (não viraram venda nem foram recusados) há X dias.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Dias parado</Label>
                  <Input type="number" min={1} value={form.diasParado}
                    onChange={(e) => setForm((f) => ({ ...f, diasParado: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor mínimo do orçamento (opcional)</Label>
                  <Input type="number" step="0.01" placeholder="R$" value={form.valorMinimo}
                    onChange={(e) => setForm((f) => ({ ...f, valorMinimo: e.target.value }))} />
                </div>
              </div>
            )}
            {form.tipo === "grade_incompleta" && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <p className="text-xs text-muted-foreground">
                  Cliente comprou uma peça que tem outros tamanhos/cores cadastrados (mesmo grupo de variante no catálogo) e ainda não levou nenhuma das outras. Não precisa escolher produto — funciona pra qualquer peça com grade cadastrada.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Dias após a compra</Label>
                  <Input type="number" min={1} value={form.diasApos}
                    onChange={(e) => setForm((f) => ({ ...f, diasApos: e.target.value }))} />
                </div>
              </div>
            )}
            {form.tipo === "receita_vencendo" && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <p className="text-xs text-muted-foreground">
                  Dispara quando a receita médica cadastrada (comum ou controlada) de um cliente está vencendo — cadastre as receitas em Farmácia → Receitas.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Dias antes do vencimento</Label>
                  <Input type="number" min={1} value={form.diasAntesVencimento}
                    onChange={(e) => setForm((f) => ({ ...f, diasAntesVencimento: e.target.value }))} />
                </div>
              </div>
            )}
            {form.tipo === "produto_vencendo" && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <p className="text-xs text-muted-foreground">
                  Dispara pra clientes que já compraram um produto que está com validade de lote vencendo — cadastre a validade no Catálogo. Bom pra sugerir com desconto antes de perder o produto.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Dias antes do vencimento</Label>
                  <Input type="number" min={1} value={form.diasAntesVencimentoProduto}
                    onChange={(e) => setForm((f) => ({ ...f, diasAntesVencimentoProduto: e.target.value }))} />
                </div>
              </div>
            )}
            {form.tipo === "limite_credito_disponivel" && (
              <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição</Label>
                <p className="text-xs text-muted-foreground">
                  Dispara pra clientes B2B que usaram pouco do limite de crédito (folga real) — cadastre limite e crédito utilizado no cadastro do lead. É estímulo de compra maior, não cobrança.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Só considerar se usou até (%) do limite</Label>
                  <Input type="number" min={1} max={100} value={form.percentualMaximoUtilizado}
                    onChange={(e) => setForm((f) => ({ ...f, percentualMaximoUtilizado: e.target.value }))} />
                </div>
              </div>
            )}
            {form.tipo === "whitespace_seguro" && (
              <div className="p-3 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                Compara o perfil de cada conta corporativa (setor, porte, frota, patrimônio) com os produtos
                esperados e sinaliza os que faltam. Roda automaticamente todo dia; aqui você só liga/desliga.
                Sem mensagem própria — cada gap vira uma oportunidade individual pra aprovação manual.
              </div>
            )}
            {form.tipo === "renovacao_seguro" && (
              <div className="p-3 rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                Varre apólices que vencem nos próximos 90 dias (janelas de 90/60/30/10 dias) e considera
                sinistros abertos e risco de não-renovação. Roda automaticamente todo dia; aqui você só
                liga/desliga. Sem mensagem própria — cada apólice vira uma oportunidade pra aprovação manual.
              </div>
            )}

            {!ENGINE_MANAGED_TIPOS.has(form.tipo) && (
              <>
                {/* Mensagem */}
                <div className="space-y-1.5">
                  <Label>Mensagem <span className="text-destructive">*</span></Label>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {CHIPS.map((chip) => (
                      <button key={chip} type="button"
                        onClick={() => insertChip(chip)}
                        className="text-xs px-2 py-0.5 rounded border bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-mono">
                        {chip}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    ref={msgRef}
                    rows={4}
                    placeholder="Olá {{nome}}, temos uma oferta especial para você..."
                    value={form.mensagem}
                    onChange={(e) => setForm((f) => ({ ...f, mensagem: e.target.value }))}
                  />
                </div>

                {/* Canal */}
                <div className="space-y-1.5">
                  <Label>Canal</Label>
                  <Select value={form.canal} onValueChange={(v) => setForm((f) => ({ ...f, canal: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="text-sm">Exigir aprovação antes de enviar</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Fica pendente na tela de Oportunidades até um admin aprovar (com ou sem editar a mensagem). Desligado, envia sozinho.</p>
                  </div>
                  <Switch checked={form.requerAprovacao} onCheckedChange={(v) => setForm((f) => ({ ...f, requerAprovacao: v }))} />
                </div>
              </>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Regra
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar regra</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} />
            </div>

            {editTarget && !ENGINE_MANAGED_TIPOS.has(editTarget.tipo) && (
              <>
                <div className="space-y-1.5">
                  <Label>Mensagem</Label>
                  <Textarea rows={3} value={editMensagem} onChange={(e) => setEditMensagem(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Canal</Label>
                  <select value={editCanal} onChange={(e) => setEditCanal(e.target.value)} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">E-mail</option>
                  </select>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label className="text-sm">Exigir aprovação antes de enviar</Label>
                  <Switch checked={editRequerAprovacao} onCheckedChange={setEditRequerAprovacao} />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Condições (JSON avançado)</Label>
              <p className="text-xs text-muted-foreground">Os campos variam por tipo de regra — edite com cuidado, mantendo a estrutura.</p>
              <Textarea rows={6} className="font-mono text-xs" value={editCondicoesJson} onChange={(e) => setEditCondicoesJson(e.target.value)} />
              {editJsonError && <p className="text-xs text-destructive">{editJsonError}</p>}
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm">Regra ativa</Label>
              <Switch checked={editAtivo} onCheckedChange={setEditAtivo} />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button disabled={editMut.isPending || !editNome.trim()} onClick={submitEdit}>
                {editMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
