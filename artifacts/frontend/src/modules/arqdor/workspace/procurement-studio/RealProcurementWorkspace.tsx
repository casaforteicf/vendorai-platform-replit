import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceProject } from "../WorkspaceContext";

type View = "requests" | "quotes" | "orders" | "receiving" | "finance";

type PurchaseRequest = {
  id: string;
  code: string;
  item: string;
  stageId?: string | null;
  environment?: string | null;
  discipline?: string | null;
  category?: string | null;
  quantity: number;
  unit: string;
  estimatedValue: number;
  priority: string;
  status: string;
  needDate?: string | null;
  supplier?: string | null;
  selectedQuoteId?: string | null;
  supplierOrderId?: string | null;
  financeId?: string | null;
  notes?: string | null;
  inputId?: string | null;
  documents?: Array<Record<string, any>>;
};

type Quote = {
  id: string;
  requestId: string;
  supplier: string;
  value: number;
  freight: number;
  discount: number;
  taxes: number;
  paymentTerms?: string | null;
  validUntil?: string | null;
  leadTimeDays?: number | null;
  expectedDelivery?: string | null;
  quoteNumber?: string | null;
  status: string;
  documents?: Array<Record<string, any>>;
};

type Receipt = {
  id: string;
  requestId: string;
  supplierOrderId: string;
  receivedAt: string;
  received: number;
  approved: number;
  rejected: number;
  status: string;
  notes?: string | null;
};

type Stage = { id: string; name: string };
type FinanceLaunch = { id: string; supplier?: string | null; value: number; dueDate?: string | null; status: string; description?: string | null };

type Bundle = {
  obra: { id: string; nome: string };
  requests: PurchaseRequest[];
  quotes: Quote[];
  receipts: Receipt[];
  stages: Stage[];
  finance: FinanceLaunch[];
};

type Props = { arqState?: any; onNavigate?: (module: string) => void; obraId?: string; compact?: boolean };

function token() {
  return localStorage.getItem("vendorai_token") ?? "";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any)?.error ?? `Erro ${response.status}`);
  return data as T;
}

function projectMeta(arqState: any, projectCtx: any) {
  const project = arqState?.currentProject ?? arqState?.selectedProject ?? arqState?.project ?? {};
  return {
    id: String(projectCtx?.id || arqState?.projectId || project?.id || ""),
    name: String(projectCtx?.name || project?.titulo || project?.title || project?.name || "Projeto ARQDOR"),
    clientName: project?.clienteNome || project?.clientName || null,
    budget: project?.orcamentoTotal || null,
    status: project?.status || null,
  };
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizeRequest(raw: any): PurchaseRequest {
  return {
    id: String(raw?.id ?? ""),
    code: String(raw?.codigo ?? raw?.id ?? ""),
    item: String(raw?.descricao ?? "Item"),
    stageId: raw?.etapa_id ?? null,
    environment: raw?.ambiente ?? null,
    discipline: raw?.disciplina ?? null,
    category: raw?.categoria ?? null,
    quantity: n(raw?.quantidade),
    unit: String(raw?.unidade ?? "un"),
    estimatedValue: n(raw?.valor_total),
    priority: String(raw?.prioridade ?? "media"),
    status: String(raw?.status ?? "pendente"),
    needDate: raw?.data_necessidade ?? raw?.data_prevista ?? null,
    supplier: raw?.fornecedor ?? null,
    selectedQuoteId: raw?.cotacao_selecionada_id ?? null,
    supplierOrderId: raw?.pedido_fornecedor_id ?? null,
    financeId: raw?.lancamento_financeiro_id ?? null,
    notes: raw?.observacoes ?? null,
    inputId: raw?.insumo_id ?? null,
    documents: Array.isArray(raw?.documentos) ? raw.documentos : [],
  };
}

function normalizeQuote(raw: any): Quote {
  return {
    id: String(raw?.id ?? ""),
    requestId: String(raw?.compra_id ?? ""),
    supplier: String(raw?.supplier_name ?? "Fornecedor"),
    value: n(raw?.confirmed_value || raw?.estimated_value),
    freight: n(raw?.freight_value),
    discount: n(raw?.discount_value),
    taxes: n(raw?.tax_value),
    paymentTerms: raw?.payment_terms ?? null,
    validUntil: raw?.quote_valid_until ?? null,
    leadTimeDays: raw?.lead_time_days == null ? null : n(raw.lead_time_days),
    expectedDelivery: raw?.expected_delivery ?? null,
    quoteNumber: raw?.quote_number ?? null,
    status: String(raw?.status ?? "quoted"),
    documents: Array.isArray(raw?.documents) ? raw.documents : [],
  };
}

function normalizeReceipt(raw: any): Receipt {
  return {
    id: String(raw?.id ?? ""),
    requestId: String(raw?.compra_id ?? ""),
    supplierOrderId: String(raw?.supplier_order_id ?? ""),
    receivedAt: String(raw?.data_recebimento ?? ""),
    received: n(raw?.quantidade_recebida),
    approved: n(raw?.quantidade_aprovada),
    rejected: n(raw?.quantidade_rejeitada),
    status: String(raw?.status ?? "inspecao"),
    notes: raw?.observacoes ?? null,
  };
}

function quoteTotal(quote: Quote) {
  return Math.max(0, quote.value + quote.freight + quote.taxes - quote.discount);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pendente: "Solicitação",
    rascunho: "Rascunho",
    cotacao: "Em cotação",
    aprovado: "Cotação aprovada",
    pedido_emitido: "Pedido emitido",
    parcial: "Recebido parcial",
    recebido: "Recebido",
    cancelado: "Cancelado",
    quoted: "Cotado",
    approved: "Aprovado",
    rejected: "Não selecionado",
    ordered: "Pedido emitido",
    partial: "Entrega parcial",
    delivered: "Entregue",
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (["recebido", "delivered"].includes(status)) return "bg-emerald-100 text-emerald-800";
  if (["aprovado", "approved"].includes(status)) return "bg-emerald-50 text-emerald-700";
  if (["pedido_emitido", "ordered", "partial", "parcial"].includes(status)) return "bg-violet-50 text-violet-700";
  if (["cotacao", "quoted"].includes(status)) return "bg-blue-50 text-blue-700";
  if (["cancelado", "rejected"].includes(status)) return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-[26px] border border-slate-100 bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>;
}

export default function RealProcurementWorkspace({ arqState = {}, onNavigate, obraId: directObraId = "", compact = false }: Props) {
  const { projectCtx, setProjectCtx } = useWorkspaceProject();
  const meta = useMemo(() => projectMeta(arqState, projectCtx), [arqState, projectCtx]);
  const [view, setView] = useState<View>("requests");
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestDraft, setRequestDraft] = useState({ item: "", quantity: "1", unit: "un", value: "0", priority: "media", stageId: "", environment: "", discipline: "", needDate: "", notes: "" });
  const [quoteDraft, setQuoteDraft] = useState({ supplier: "", value: "0", freight: "0", discount: "0", taxes: "0", leadTime: "", expectedDelivery: "", paymentTerms: "", quoteNumber: "" });
  const [receiptDraft, setReceiptDraft] = useState({ received: "", approved: "", rejected: "0", notes: "" });
  const [financeDueDate, setFinanceDueDate] = useState("");

  const load = useCallback(async () => {
    if (!directObraId && !meta.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      let obraId = directObraId;
      if (!obraId) {
        const ensured = await api<{ obra: any }>("/api/arch/construction/ensure", { method: "POST", body: JSON.stringify({ projectId: meta.id, name: meta.name, clientName: meta.clientName, budget: meta.budget, status: meta.status }) });
        obraId = String(ensured.obra?.id ?? "");
        if (!obraId) throw new Error("Não foi possível vincular o projeto à obra.");
        if ((projectCtx as any)?.obraId !== obraId) setProjectCtx({ ...(projectCtx as any), id: meta.id, name: meta.name, obraId } as any);
      }
      const raw = await api<any>(`/api/arch/procurement/${obraId}`);
      const requests = (raw.requests ?? []).map(normalizeRequest);
      const normalized: Bundle = {
        obra: { id: obraId, nome: String(raw.obra?.nome ?? meta.name) },
        requests,
        quotes: (raw.quotes ?? []).map(normalizeQuote),
        receipts: (raw.receipts ?? []).map(normalizeReceipt),
        stages: (raw.stages ?? []).map((stage: any) => ({ id: String(stage.id), name: String(stage.nome ?? "Etapa") })),
        finance: (raw.finance ?? []).map((item: any) => ({ id: String(item.id), supplier: item.fornecedor ?? null, value: n(item.valor), dueDate: item.data_vencimento ?? null, status: String(item.status ?? "pendente"), description: item.descricao ?? null })),
      };
      setBundle(normalized);
      setSelectedId((current) => current && requests.some((item: PurchaseRequest) => item.id === current) ? current : requests[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar Compras.");
    } finally {
      setLoading(false);
    }
  }, [directObraId, meta.budget, meta.clientName, meta.id, meta.name, meta.status, projectCtx, setProjectCtx]);

  useEffect(() => { void load(); }, [load]);

  const selected = bundle?.requests.find((request) => request.id === selectedId) ?? null;
  const selectedQuotes = useMemo(() => (bundle?.quotes ?? []).filter((quote) => quote.requestId === selectedId).sort((a, b) => quoteTotal(a) - quoteTotal(b)), [bundle, selectedId]);
  const selectedReceipts = useMemo(() => (bundle?.receipts ?? []).filter((receipt) => receipt.requestId === selectedId), [bundle, selectedId]);
  const orderedRequests = (bundle?.requests ?? []).filter((request) => Boolean(request.supplierOrderId));

  const metrics = useMemo(() => {
    const requests = bundle?.requests ?? [];
    const quotes = bundle?.quotes ?? [];
    const ordered = requests.filter((item) => item.supplierOrderId).length;
    const received = requests.filter((item) => item.status === "recebido").length;
    const committed = requests.filter((item) => item.selectedQuoteId).reduce((sum, item) => sum + item.estimatedValue, 0);
    return { requests: requests.length, quotes: quotes.length, ordered, received, committed };
  }, [bundle]);

  async function createRequest() {
    if (!bundle || !requestDraft.item.trim()) return;
    setBusy("new-request"); setError(null);
    try {
      await api(`/api/arch/procurement/${bundle.obra.id}/requests`, { method: "POST", body: JSON.stringify({ descricao: requestDraft.item.trim(), quantidade: n(requestDraft.quantity), unidade: requestDraft.unit || "un", valorTotal: n(requestDraft.value), prioridade: requestDraft.priority, etapaId: requestDraft.stageId || null, ambiente: requestDraft.environment || null, disciplina: requestDraft.discipline || null, dataNecessidade: requestDraft.needDate || null, observacoes: requestDraft.notes || null }) });
      setRequestDraft({ item: "", quantity: "1", unit: "un", value: "0", priority: "media", stageId: "", environment: "", discipline: "", needDate: "", notes: "" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao criar solicitação."); }
    finally { setBusy(null); }
  }

  async function deleteRequest(request: PurchaseRequest) {
    if (!bundle || !window.confirm(`Excluir ${request.code}?`)) return;
    setBusy(request.id);
    try { await api(`/api/arch/procurement/${bundle.obra.id}/requests/${request.id}`, { method: "DELETE" }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível excluir."); }
    finally { setBusy(null); }
  }

  async function createQuote() {
    if (!bundle || !selected || !quoteDraft.supplier.trim()) return;
    setBusy("new-quote"); setError(null);
    try {
      await api(`/api/arch/procurement/${bundle.obra.id}/requests/${selected.id}/quotes`, { method: "POST", body: JSON.stringify({ projectId: meta.id, supplierName: quoteDraft.supplier.trim(), confirmedValue: n(quoteDraft.value), freightValue: n(quoteDraft.freight), discountValue: n(quoteDraft.discount), taxValue: n(quoteDraft.taxes), leadTimeDays: quoteDraft.leadTime === "" ? null : n(quoteDraft.leadTime), expectedDelivery: quoteDraft.expectedDelivery || null, paymentTerms: quoteDraft.paymentTerms || null, quoteNumber: quoteDraft.quoteNumber || null }) });
      setQuoteDraft({ supplier: "", value: "0", freight: "0", discount: "0", taxes: "0", leadTime: "", expectedDelivery: "", paymentTerms: "", quoteNumber: "" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao registrar cotação."); }
    finally { setBusy(null); }
  }

  async function approveQuote(quote: Quote) {
    if (!bundle || !selected) return;
    setBusy(quote.id); setError(null);
    try { await api(`/api/arch/procurement/${bundle.obra.id}/requests/${selected.id}/quotes/${quote.id}/approve`, { method: "POST", body: "{}" }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao aprovar cotação."); }
    finally { setBusy(null); }
  }

  async function issueOrder(request: PurchaseRequest) {
    if (!bundle || !request.selectedQuoteId) return;
    setBusy(`order-${request.id}`); setError(null);
    try { await api(`/api/arch/procurement/${bundle.obra.id}/requests/${request.id}/quotes/${request.selectedQuoteId}/order`, { method: "POST", body: JSON.stringify({ expectedDelivery: bundle.quotes.find((quote) => quote.id === request.selectedQuoteId)?.expectedDelivery ?? null }) }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao emitir pedido."); }
    finally { setBusy(null); }
  }

  async function sendFinance(request: PurchaseRequest) {
    if (!bundle) return;
    setBusy(`finance-${request.id}`); setError(null);
    try { await api(`/api/arch/procurement/${bundle.obra.id}/requests/${request.id}/finance`, { method: "POST", body: JSON.stringify({ dueDate: financeDueDate || null }) }); setFinanceDueDate(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao enviar ao financeiro."); }
    finally { setBusy(null); }
  }

  async function receive(request: PurchaseRequest) {
    if (!bundle || !receiptDraft.received) return;
    setBusy(`receive-${request.id}`); setError(null);
    try {
      await api(`/api/arch/procurement/${bundle.obra.id}/requests/${request.id}/receipts`, { method: "POST", body: JSON.stringify({ quantidadeRecebida: n(receiptDraft.received), quantidadeAprovada: receiptDraft.approved === "" ? n(receiptDraft.received) : n(receiptDraft.approved), quantidadeRejeitada: n(receiptDraft.rejected), observacoes: receiptDraft.notes || null }) });
      setReceiptDraft({ received: "", approved: "", rejected: "0", notes: "" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao registrar recebimento."); }
    finally { setBusy(null); }
  }

  if (!directObraId && !meta.id) return <div className="rounded-3xl border border-dashed p-8 text-center text-sm text-slate-500">Selecione um projeto ou obra para abrir Compras.</div>;
  if (loading) return <div className="p-8 text-sm text-slate-500">Carregando Compras da obra…</div>;
  if (!bundle) return <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">{error || "Não foi possível carregar Compras."}</div>;

  return (
    <div className={compact ? "text-slate-950" : "min-h-screen bg-[#f7f7f8] text-slate-950"}>
      <div className={compact ? "flex w-full flex-col gap-5" : "mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6"}>
        <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Compras da Obra</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{bundle.obra.nome}</h1><p className="mt-1 text-sm text-slate-500">Solicitação → Cotação → Aprovação → Pedido → Recebimento → Financeiro</p></div>
            <div className="flex flex-wrap gap-2">
              {([['requests','Solicitações'],['quotes','Cotações'],['orders','Pedidos'],['receiving','Recebimento'],['finance','Financeiro']] as Array<[View,string]>).map(([id,label]) => <button key={id} type="button" onClick={() => setView(id)} className={`rounded-2xl px-4 py-2 text-sm font-semibold ${view === id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700"}`}>{label}</button>)}
              <button type="button" onClick={() => onNavigate?.("real-budget")} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold">Orçamento</button>
            </div>
          </div>
        </header>

        {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Solicitações" value={String(metrics.requests)} hint="itens da obra" />
          <Metric label="Cotações" value={String(metrics.quotes)} hint="propostas recebidas" />
          <Metric label="Pedidos" value={String(metrics.ordered)} hint="pedidos emitidos" />
          <Metric label="Recebidos" value={String(metrics.received)} hint="concluídos" />
          <Metric label="Comprometido" value={money(metrics.committed)} hint="cotações selecionadas" />
        </section>

        {view === "requests" ? <div className="grid gap-5 2xl:grid-cols-[430px_1fr]">
          <section className="self-start rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Nova solicitação</h2><p className="mt-1 text-xs text-slate-500">Cadastre o que a obra precisa comprar antes de pedir preços.</p>
            <div className="mt-4 space-y-3"><input value={requestDraft.item} onChange={(e) => setRequestDraft((v) => ({ ...v, item: e.target.value }))} placeholder="Item ou serviço" className="w-full rounded-xl border px-3 py-2 text-sm" /><div className="grid grid-cols-3 gap-2"><input type="number" min="0" value={requestDraft.quantity} onChange={(e) => setRequestDraft((v) => ({ ...v, quantity: e.target.value }))} placeholder="Qtd." className="rounded-xl border px-3 py-2 text-sm" /><input value={requestDraft.unit} onChange={(e) => setRequestDraft((v) => ({ ...v, unit: e.target.value }))} placeholder="un/m²" className="rounded-xl border px-3 py-2 text-sm" /><input type="number" min="0" value={requestDraft.value} onChange={(e) => setRequestDraft((v) => ({ ...v, value: e.target.value }))} placeholder="Estimativa" className="rounded-xl border px-3 py-2 text-sm" /></div><div className="grid grid-cols-2 gap-2"><select value={requestDraft.stageId} onChange={(e) => setRequestDraft((v) => ({ ...v, stageId: e.target.value }))} className="rounded-xl border px-3 py-2 text-sm"><option value="">Etapa da obra</option>{bundle.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select><select value={requestDraft.priority} onChange={(e) => setRequestDraft((v) => ({ ...v, priority: e.target.value }))} className="rounded-xl border px-3 py-2 text-sm"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></div><div className="grid grid-cols-2 gap-2"><input value={requestDraft.environment} onChange={(e) => setRequestDraft((v) => ({ ...v, environment: e.target.value }))} placeholder="Ambiente/local" className="rounded-xl border px-3 py-2 text-sm" /><input value={requestDraft.discipline} onChange={(e) => setRequestDraft((v) => ({ ...v, discipline: e.target.value }))} placeholder="Disciplina" className="rounded-xl border px-3 py-2 text-sm" /></div><label className="block text-[11px] text-slate-500">Necessário até<input type="date" value={requestDraft.needDate} onChange={(e) => setRequestDraft((v) => ({ ...v, needDate: e.target.value }))} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" /></label><textarea rows={2} value={requestDraft.notes} onChange={(e) => setRequestDraft((v) => ({ ...v, notes: e.target.value }))} placeholder="Observações" className="w-full rounded-xl border px-3 py-2 text-sm" /><button disabled={!requestDraft.item.trim() || busy === "new-request"} onClick={() => void createRequest()} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy === "new-request" ? "Salvando…" : "Criar solicitação"}</button></div>
          </section>
          <section className="space-y-3">{bundle.requests.length ? bundle.requests.map((request) => <article key={request.id} onClick={() => setSelectedId(request.id)} className={`cursor-pointer rounded-[28px] border bg-white p-5 shadow-sm ${selectedId === request.id ? "border-violet-300 ring-2 ring-violet-100" : "border-slate-100"}`}><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-mono text-slate-400">{request.code}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass(request.status)}`}>{statusLabel(request.status)}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">{request.priority}</span></div><h3 className="mt-2 text-lg font-semibold">{request.item}</h3><p className="mt-1 text-xs text-slate-500">{request.quantity} {request.unit}{request.environment ? ` · ${request.environment}` : ""}{request.discipline ? ` · ${request.discipline}` : ""}</p></div><div className="text-right"><p className="font-semibold">{money(request.estimatedValue)}</p><p className="text-xs text-slate-400">{bundle.quotes.filter((quote) => quote.requestId === request.id).length} cotação(ões)</p></div></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={(e) => { e.stopPropagation(); setSelectedId(request.id); setView("quotes"); }} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">Abrir cotações</button>{!request.supplierOrderId && !request.financeId ? <button type="button" onClick={(e) => { e.stopPropagation(); void deleteRequest(request); }} disabled={busy === request.id} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-semibold text-rose-600">Excluir</button> : null}</div></article>) : <div className="rounded-3xl border border-dashed p-10 text-center text-sm text-slate-500">Nenhuma solicitação cadastrada.</div>}</section>
        </div> : null}

        {view === "quotes" ? <div className="grid gap-5 2xl:grid-cols-[430px_1fr]">
          <section className="self-start rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Registrar cotação</h2><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="mt-3 w-full rounded-xl border px-3 py-2 text-sm"><option value="">Selecione a solicitação</option>{bundle.requests.map((request) => <option key={request.id} value={request.id}>{request.code} · {request.item}</option>)}</select>{selected ? <div className="mt-4 space-y-3"><input value={quoteDraft.supplier} onChange={(e) => setQuoteDraft((v) => ({ ...v, supplier: e.target.value }))} placeholder="Fornecedor" className="w-full rounded-xl border px-3 py-2 text-sm" /><div className="grid grid-cols-2 gap-2"><input type="number" min="0" value={quoteDraft.value} onChange={(e) => setQuoteDraft((v) => ({ ...v, value: e.target.value }))} placeholder="Valor" className="rounded-xl border px-3 py-2 text-sm" /><input type="number" min="0" value={quoteDraft.freight} onChange={(e) => setQuoteDraft((v) => ({ ...v, freight: e.target.value }))} placeholder="Frete" className="rounded-xl border px-3 py-2 text-sm" /></div><div className="grid grid-cols-2 gap-2"><input type="number" min="0" value={quoteDraft.discount} onChange={(e) => setQuoteDraft((v) => ({ ...v, discount: e.target.value }))} placeholder="Desconto" className="rounded-xl border px-3 py-2 text-sm" /><input type="number" min="0" value={quoteDraft.taxes} onChange={(e) => setQuoteDraft((v) => ({ ...v, taxes: e.target.value }))} placeholder="Taxas" className="rounded-xl border px-3 py-2 text-sm" /></div><div className="grid grid-cols-2 gap-2"><input type="number" min="0" value={quoteDraft.leadTime} onChange={(e) => setQuoteDraft((v) => ({ ...v, leadTime: e.target.value }))} placeholder="Prazo em dias" className="rounded-xl border px-3 py-2 text-sm" /><input type="date" value={quoteDraft.expectedDelivery} onChange={(e) => setQuoteDraft((v) => ({ ...v, expectedDelivery: e.target.value }))} className="rounded-xl border px-3 py-2 text-sm" /></div><input value={quoteDraft.paymentTerms} onChange={(e) => setQuoteDraft((v) => ({ ...v, paymentTerms: e.target.value }))} placeholder="Condição de pagamento" className="w-full rounded-xl border px-3 py-2 text-sm" /><input value={quoteDraft.quoteNumber} onChange={(e) => setQuoteDraft((v) => ({ ...v, quoteNumber: e.target.value }))} placeholder="Número da proposta" className="w-full rounded-xl border px-3 py-2 text-sm" /><button disabled={!quoteDraft.supplier.trim() || busy === "new-quote"} onClick={() => void createQuote()} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Adicionar cotação</button></div> : <p className="mt-4 text-sm text-slate-500">Selecione uma solicitação.</p>}</section>
          <section className="space-y-3">{selected ? <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-violet-600">{selected.code}</p><h2 className="mt-1 text-xl font-semibold">{selected.item}</h2><p className="mt-1 text-sm text-slate-500">Compare preço final, prazo e condições. A decisão de aprovação permanece humana.</p></div> : null}{selectedQuotes.length ? selectedQuotes.map((quote, index) => <article key={quote.id} className={`rounded-[28px] border bg-white p-5 shadow-sm ${selected?.selectedQuoteId === quote.id ? "border-emerald-300" : "border-slate-100"}`}><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{quote.supplier}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass(quote.status)}`}>{statusLabel(quote.status)}</span>{index === 0 ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase text-blue-700">Menor valor atual</span> : null}</div><p className="mt-1 text-xs text-slate-500">{quote.leadTimeDays != null ? `${quote.leadTimeDays} dias` : "Prazo não informado"}{quote.expectedDelivery ? ` · entrega ${new Date(`${quote.expectedDelivery}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}{quote.paymentTerms ? ` · ${quote.paymentTerms}` : ""}</p></div><div className="text-right"><p className="text-xl font-semibold">{money(quoteTotal(quote))}</p><p className="text-[11px] text-slate-400">base {money(quote.value)} · frete {money(quote.freight)}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{quote.status === "quoted" ? <button disabled={busy === quote.id} onClick={() => void approveQuote(quote)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Aprovar cotação</button> : null}{quote.status === "approved" && selected?.selectedQuoteId === quote.id ? <button disabled={busy === `order-${selected.id}`} onClick={() => void issueOrder(selected)} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white">Emitir pedido</button> : null}</div></article>) : <div className="rounded-3xl border border-dashed p-10 text-center text-sm text-slate-500">Nenhuma cotação para a solicitação selecionada.</div>}</section>
        </div> : null}

        {view === "orders" ? <section className="space-y-3">{orderedRequests.length ? orderedRequests.map((request) => { const order = bundle.quotes.find((quote) => quote.id === request.supplierOrderId); return <article key={request.id} className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex gap-2"><span className="font-mono text-xs text-slate-400">{request.code}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass(request.status)}`}>{statusLabel(request.status)}</span></div><h3 className="mt-2 text-lg font-semibold">{request.item}</h3><p className="text-sm text-slate-500">{order?.supplier || request.supplier}{order?.expectedDelivery ? ` · entrega ${new Date(`${order.expectedDelivery}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</p></div><div className="flex flex-wrap items-center gap-2"><p className="mr-2 text-lg font-semibold">{money(order ? quoteTotal(order) : request.estimatedValue)}</p>{request.financeId ? <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Financeiro vinculado</span> : <button onClick={() => { setSelectedId(request.id); setView("finance"); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">Enviar ao financeiro</button>}<button onClick={() => { setSelectedId(request.id); setReceiptDraft((v) => ({ ...v, received: String(Math.max(0, request.quantity - selectedReceipts.reduce((sum, r) => sum + r.approved, 0))) })); setView("receiving"); }} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white">Registrar recebimento</button></div></div></article>; }) : <div className="rounded-3xl border border-dashed p-10 text-center text-sm text-slate-500">Nenhum pedido emitido ainda.</div>}</section> : null}

        {view === "receiving" ? <div className="grid gap-5 2xl:grid-cols-[430px_1fr]">
          <section className="self-start rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Registrar recebimento</h2><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="mt-3 w-full rounded-xl border px-3 py-2 text-sm"><option value="">Selecione um pedido</option>{orderedRequests.map((request) => <option key={request.id} value={request.id}>{request.code} · {request.item}</option>)}</select>{selected?.supplierOrderId ? <div className="mt-4 space-y-3"><div className="grid grid-cols-3 gap-2"><input type="number" min="0" value={receiptDraft.received} onChange={(e) => setReceiptDraft((v) => ({ ...v, received: e.target.value }))} placeholder="Recebido" className="rounded-xl border px-3 py-2 text-sm" /><input type="number" min="0" value={receiptDraft.approved} onChange={(e) => setReceiptDraft((v) => ({ ...v, approved: e.target.value }))} placeholder="Aprovado" className="rounded-xl border px-3 py-2 text-sm" /><input type="number" min="0" value={receiptDraft.rejected} onChange={(e) => setReceiptDraft((v) => ({ ...v, rejected: e.target.value }))} placeholder="Rejeitado" className="rounded-xl border px-3 py-2 text-sm" /></div><textarea rows={3} value={receiptDraft.notes} onChange={(e) => setReceiptDraft((v) => ({ ...v, notes: e.target.value }))} placeholder="Observações da conferência" className="w-full rounded-xl border px-3 py-2 text-sm" /><button disabled={!receiptDraft.received || busy === `receive-${selected.id}`} onClick={() => void receive(selected)} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Confirmar recebimento</button></div> : <p className="mt-4 text-sm text-slate-500">Selecione um pedido emitido.</p>}</section>
          <section className="space-y-3">{selected ? <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold">{selected.item}</h2><p className="mt-1 text-sm text-slate-500">Pedido: {selected.quantity} {selected.unit} · já aprovado: {selectedReceipts.reduce((sum, item) => sum + item.approved, 0)} {selected.unit}</p></div> : null}{selectedReceipts.length ? selectedReceipts.map((receipt) => <article key={receipt.id} className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm"><div className="flex justify-between gap-3"><div><p className="font-semibold">Recebimento {new Date(receipt.receivedAt).toLocaleString("pt-BR")}</p><p className="mt-1 text-xs text-slate-500">Recebido {receipt.received} · aprovado {receipt.approved} · rejeitado {receipt.rejected}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">{receipt.status}</span></div>{receipt.notes ? <p className="mt-3 text-sm text-slate-600">{receipt.notes}</p> : null}</article>) : <div className="rounded-3xl border border-dashed p-10 text-center text-sm text-slate-500">Nenhum recebimento registrado para este pedido.</div>}</section>
        </div> : null}

        {view === "finance" ? <div className="grid gap-5 2xl:grid-cols-[430px_1fr]">
          <section className="self-start rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Enviar conta a pagar</h2><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="mt-3 w-full rounded-xl border px-3 py-2 text-sm"><option value="">Selecione um pedido</option>{orderedRequests.map((request) => <option key={request.id} value={request.id}>{request.code} · {request.item}</option>)}</select>{selected?.supplierOrderId ? <div className="mt-4 space-y-3"><label className="block text-xs text-slate-500">Vencimento<input type="date" value={financeDueDate} onChange={(e) => setFinanceDueDate(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" /></label>{selected.financeId ? <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">Este pedido já está vinculado ao financeiro.</div> : <button disabled={busy === `finance-${selected.id}`} onClick={() => void sendFinance(selected)} className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Enviar ao Financeiro da Obra</button>}</div> : <p className="mt-4 text-sm text-slate-500">Selecione um pedido emitido.</p>}</section>
          <section className="space-y-3">{bundle.finance.length ? bundle.finance.map((item) => <article key={item.id} className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">{item.supplier || "Fornecedor"}</h3><p className="mt-1 text-xs text-slate-500">{item.description || "Compra da obra"}{item.dueDate ? ` · vence ${new Date(`${item.dueDate}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}</p></div><div className="text-right"><p className="text-lg font-semibold">{money(item.value)}</p><span className="text-xs text-slate-500">{item.status}</span></div></div></article>) : <div className="rounded-3xl border border-dashed p-10 text-center text-sm text-slate-500">Nenhuma conta de compra vinculada ainda.</div>}</section>
        </div> : null}
      </div>
    </div>
  );
}
