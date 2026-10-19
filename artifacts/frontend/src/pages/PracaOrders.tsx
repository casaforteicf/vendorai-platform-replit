import NegotiationHistory from "@/components/praca/NegotiationHistory";
import * as React from "react";
import PracaDeliveryProof from "@/components/praca/PracaDeliveryProof";
import { CheckCircle2, Clock3, Package, RefreshCw, Truck } from "lucide-react";

type Fulfillment = {
  status: "preparing" | "ready" | "shipped";
  delivery_mode?: "pickup" | "own_delivery" | "carrier" | null;
  carrier?: string | null;
  tracking_code?: string | null;
  seller_note?: string | null;
  shipped_at?: string | null;
};
type Order = {
  id: string;
  orderType: "quote" | "round";
  code: string;
  payment_status: "paid" | "delivered" | "released";
  delivery_reported_at?: string | null;
  delivery_received_by?: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  category: string;
  title: string;
  description?: string | null;
  location: string;
  needed_at?: string | null;
  buyer_name: string;
  buyer_email?: string | null;
  buyer_phone?: string | null;
  cancellation_status?: "solicitada" | "em_analise" | null;
  cancellation_reason?: string | null;
  cancellation_description?: string | null;
  items: Array<{ description: string; specification?: string | null; quantity: number | string; unit: string; brand?: string | null }>;
  fulfillment?: Fulfillment | null;
};
type Dispute = {
  id: string; order_type: "quote" | "round"; order_id: string; reason_code: string;
  description: string; evidence_url?: string | null; status: string; vendor_response?: string | null;
  resolution_text?: string | null; created_at: string; buyer_name: string; order_code?: string | null; item_title?: string | null;
};
type Draft = { deliveryMode: string; carrier: string; trackingCode: string; sellerNote: string };

const EMPTY_DRAFT: Draft = { deliveryMode: "", carrier: "", trackingCode: "", sellerNote: "" };

export default function PracaOrders() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [disputes, setDisputes] = React.useState<Dispute[]>([]);
  const [disputeDrafts, setDisputeDrafts] = React.useState<Record<string, string>>({});
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [response, disputeResponse] = await Promise.all([
        fetch("/api/praca-pedidos", { credentials: "include", cache: "no-store" }),
        fetch("/api/praca-disputas", { credentials: "include", cache: "no-store" }),
      ]);
      const [body, disputeBody] = await Promise.all([response.json(), disputeResponse.json()]);
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar os pedidos.");
      if (!disputeResponse.ok) throw new Error(disputeBody.error ?? "Não foi possível carregar as disputas.");
      const rows = Array.isArray(body) ? body as Order[] : [];
      setDisputes(Array.isArray(disputeBody) ? disputeBody as Dispute[] : []);
      setOrders(rows);
      setDrafts((current) => {
        const next = { ...current };
        for (const order of rows) {
          if (!next[order.id]) next[order.id] = {
            deliveryMode: order.fulfillment?.delivery_mode ?? "",
            carrier: order.fulfillment?.carrier ?? "",
            trackingCode: order.fulfillment?.tracking_code ?? "",
            sellerNote: order.fulfillment?.seller_note ?? "",
          };
        }
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar pedidos Praça.ai.");
    } finally {
      setLoading(false);
    }
  }, []);

  const respondToDispute = async (dispute: Dispute) => {
    const responseText = (disputeDrafts[dispute.id] ?? "").trim();
    if (responseText.length < 12) { setError("A resposta precisa ter pelo menos 12 caracteres."); return; }
    setBusy(dispute.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/praca-disputas/${encodeURIComponent(dispute.id)}/resposta`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: responseText }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível registrar a resposta.");
      setNotice("Resposta enviada à Praça.ai para análise.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao responder à disputa."); }
    finally { setBusy(null); }
  };

  React.useEffect(() => { void load(); }, [load]);

  const updateDraft = (id: string, key: keyof Draft, value: string) => {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? EMPTY_DRAFT), [key]: value } }));
  };
  const save = async (order: Order, status: Fulfillment["status"]) => {
    const draft = drafts[order.id] ?? EMPTY_DRAFT;
    if ((status === "ready" && !["pickup", "own_delivery"].includes(draft.deliveryMode)) ||
        (status === "shipped" && !["own_delivery", "carrier"].includes(draft.deliveryMode))) {
      setError(status === "ready" ? "Selecione retirada ou entrega própria." : "Para registrar a saída, selecione entrega própria ou transportadora.");
      return;
    }
    if (status === "shipped" && draft.deliveryMode === "carrier" && !draft.carrier.trim()) {
      setError("Informe o nome da transportadora.");
      return;
    }
    setBusy(order.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/praca-pedidos/${order.orderType}/${encodeURIComponent(order.id)}/expedicao`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, deliveryMode: draft.deliveryMode || undefined, carrier: draft.carrier, trackingCode: draft.trackingCode, sellerNote: draft.sellerNote }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível atualizar a expedição.");
      setNotice("Expedição atualizada. O comprador já pode acompanhar o andamento no Praça.ai.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar a expedição.");
    } finally {
      setBusy(null);
    }
  };

  const statusLabel = (order: Order) => {
    if (order.payment_status === "delivered" || order.payment_status === "released") return "Entrega confirmada";
    if (order.delivery_reported_at) return "Entrega informada — aguardando cliente";
    if (order.fulfillment?.status === "shipped") return "Saiu para entrega";
    if (order.fulfillment?.status === "ready") return order.fulfillment.delivery_mode === "pickup" ? "Pronto para retirada" : "Pronto para entrega";
    if (order.fulfillment?.status === "preparing") return "Em preparação";
    return "Aguardando expedição";
  };
  const date = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

  return <main className="min-h-full bg-[#F7F9FC] px-4 py-6 pb-10 text-[#0B2240] md:px-8 md:py-10">
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#008878]">AppVendor.ai · Praça.ai</p><h1 className="mt-2 font-[Manrope] text-3xl font-extrabold sm:text-4xl">Pedidos e expedição</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748B]">Pedidos pagos das suas cotações e rodadas. Informe a separação e a forma de entrega para o comprador acompanhar pelo Praça.ai.</p></div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[#DCE4EC] bg-white px-4 py-3 text-sm font-bold"><RefreshCw className="h-4 w-4"/>Atualizar</button>
      </div>
      <div className="mb-5 rounded-xl border border-[#B9EDE4] bg-[#F0FCFA] p-4 text-sm leading-6 text-[#175C57]"><strong>Dados liberados após o pagamento:</strong> os dados do comprador aparecem somente em pedidos pagos. O repasse continua aguardando a confirmação de entrega pelo comprador no Praça.ai.</div>
      {notice && <div role="status" className="mb-4 rounded-xl border border-[#A9E9DE] bg-[#F0FCFA] p-3 text-sm font-semibold">{notice}</div>}
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <section className="mb-6 rounded-2xl border border-[#F2D28B] bg-[#FFF9E9] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-extrabold">Disputas de pedidos</h2><p className="mt-1 text-sm text-[#64748B]">A Praça.ai recebe sua resposta e conduz a análise. Os dados do comprador só são exibidos após o pagamento.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold">{disputes.filter((d) => !["resolvida", "rejeitada"].includes(d.status)).length} em aberto</span></div>
        {disputes.length === 0 ? <p className="mt-4 rounded-xl bg-white/80 p-4 text-sm text-[#64748B]">Nenhuma disputa vinculada aos seus pedidos.</p> : <div className="mt-4 grid gap-3 lg:grid-cols-2">{disputes.map((dispute) => <article key={dispute.id} className="rounded-xl border border-[#E9DDBE] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><span className="text-xs font-bold uppercase text-[#008878]">{dispute.order_type === "round" ? "Rodada" : "Cotação direta"} · {dispute.order_code ?? "Pedido"}</span><h3 className="mt-1 font-extrabold">{dispute.item_title ?? "Pedido Praça.ai"}</h3></div><span className="rounded-full bg-[#F7F9FC] px-2 py-1 text-xs font-bold">{dispute.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-sm"><strong>Comprador:</strong> {dispute.buyer_name}</p><p className="mt-2 whitespace-pre-wrap text-sm text-[#475569]">{dispute.description}</p>{dispute.evidence_url && <a className="mt-2 inline-block text-sm font-bold text-[#126CC5] underline" href={dispute.evidence_url} target="_blank" rel="noreferrer">Ver evidência</a>}{dispute.vendor_response ? <div className="mt-3 rounded-lg bg-[#F0FCFA] p-3 text-sm"><strong>Sua resposta</strong><p className="mt-1 whitespace-pre-wrap">{dispute.vendor_response}</p></div> : !["resolvida", "rejeitada"].includes(dispute.status) ? <div className="mt-3"><label className="block text-xs font-bold">Resposta para a análise<textarea value={disputeDrafts[dispute.id] ?? ""} onChange={(event) => setDisputeDrafts((current) => ({ ...current, [dispute.id]: event.target.value }))} maxLength={3000} minLength={12} className="mt-1 min-h-24 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" placeholder="Explique os fatos e a solução oferecida"/></label><button disabled={busy === dispute.id || (disputeDrafts[dispute.id] ?? "").trim().length < 12} onClick={() => void respondToDispute(dispute)} className="mt-2 rounded-lg bg-[#0B2240] px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{busy === dispute.id ? "Enviando…" : "Enviar resposta"}</button></div> : null}{dispute.resolution_text && <p className="mt-3 rounded-lg bg-[#F7F9FC] p-3 text-sm"><strong>Atualização da Praça.ai:</strong> {dispute.resolution_text}</p>}</article>)}</div>}
      </section>
      {loading ? <div className="rounded-2xl border bg-white p-8 text-sm text-[#64748B]">Carregando pedidos…</div>
      : orders.length === 0 ? <div className="rounded-2xl border bg-white p-10 text-center"><Package className="mx-auto h-8 w-8 text-[#008878]"/><h2 className="mt-3 font-bold">Nenhum pedido pago</h2><p className="mt-1 text-sm text-[#64748B]">Quando um comprador pagar uma proposta sua, o pedido aparecerá aqui.</p></div>
      : <div className="grid gap-4 lg:grid-cols-2">{orders.map((order) => {
        const draft = drafts[order.id] ?? EMPTY_DRAFT;
        const closed = order.payment_status !== "paid" || Boolean(order.delivery_reported_at);
        return <article key={`${order.orderType}:${order.id}`} className="rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><span className="text-xs font-extrabold uppercase tracking-wide text-[#008878]">{order.orderType === "round" ? "Rodada" : "Cotação direta"} · {order.code}</span><h2 className="mt-2 text-xl font-extrabold">{order.title}</h2>{order.description && <p className="mt-1 text-sm text-[#64748B]">{order.description}</p>}</div><span className="whitespace-nowrap rounded-full bg-[#E8F2FF] px-3 py-1 text-xs font-bold text-[#126CC5]">{statusLabel(order)}</span></div>
          <div className="mt-4 grid gap-2 rounded-xl bg-[#F7F9FC] p-3 text-sm sm:grid-cols-2"><p><Package className="mr-1 inline h-4 w-4"/>{order.category} · {order.location}</p><p><Clock3 className="mr-1 inline h-4 w-4"/>Pago em: <strong>{date(order.paid_at)}</strong></p>{order.needed_at && <p><Truck className="mr-1 inline h-4 w-4"/>Precisa até: <strong>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(order.needed_at))}</strong></p>}</div>
          <div className="mt-4 rounded-xl border border-[#E5EAF0] p-3"><p className="text-xs font-extrabold uppercase tracking-wide text-[#64748B]">Comprador</p><p className="mt-1 font-bold">{order.buyer_name}</p><p className="text-sm text-[#64748B]">{[order.buyer_email, order.buyer_phone].filter(Boolean).join(" · ") || "Contato não informado"}</p></div>
          {order.cancellation_status && <div role="status" className="mt-3 rounded-xl border border-[#F2D28B] bg-[#FFF9E9] p-3 text-sm text-[#6B4B00]"><strong>Pedido de cancelamento em análise pela Praça.ai.</strong><p className="mt-1">Motivo: {order.cancellation_reason?.replaceAll("_", " ")}</p>{order.cancellation_description && <p className="mt-1 whitespace-pre-wrap">{order.cancellation_description}</p>}<p className="mt-2 text-xs">Aguarde a decisão da plataforma antes de registrar a saída para entrega.</p></div>}
          <NegotiationHistory key={"history:"+order.orderType+":"+order.id} url={"/api/praca-pedidos/"+order.orderType+"/"+encodeURIComponent(order.id)+"/historico"}/>
          <div className="mt-3 space-y-2">{order.items.map((item, index) => <div key={`${item.description}-${index}`} className="rounded-xl bg-[#F7F9FC] p-3 text-sm"><strong>{item.description}</strong>{item.specification && <span className="text-[#64748B]"> · {item.specification}</span>}<p className="text-xs text-[#64748B]">{Number(item.quantity).toLocaleString("pt-BR")} {item.unit}{item.brand ? ` · ${item.brand}` : ""}</p></div>)}</div>
          {order.fulfillment && <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#DCE4EC] p-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#008878]"/><div><strong>{statusLabel(order)}</strong>{order.fulfillment.carrier && <p className="text-[#64748B]">{order.fulfillment.carrier}{order.fulfillment.tracking_code ? ` · ${order.fulfillment.tracking_code}` : ""}</p>}{order.fulfillment.seller_note && <p className="text-[#64748B]">{order.fulfillment.seller_note}</p>}</div></div>}
          {order.payment_status === "paid" && <PracaDeliveryProof orderType={order.orderType} orderId={order.id} reportedAt={order.delivery_reported_at} eligible={!order.cancellation_status && (order.fulfillment?.status === "shipped" || (order.fulfillment?.status === "ready" && order.fulfillment.delivery_mode === "pickup"))} onSaved={()=>void load()}/>}
          {!closed && <div className="mt-4 space-y-3 border-t pt-4"><label className="block text-xs font-bold">Forma de entrega<select value={draft.deliveryMode} onChange={(event) => updateDraft(order.id, "deliveryMode", event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm"><option value="">Selecione</option><option value="pickup">Retirada na loja</option><option value="own_delivery">Entrega própria</option><option value="carrier">Transportadora</option></select></label>
            {draft.deliveryMode === "carrier" && <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Transportadora<input value={draft.carrier} onChange={(event) => updateDraft(order.id, "carrier", event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" placeholder="Nome da transportadora"/></label><label className="text-xs font-bold">Código de rastreio<input value={draft.trackingCode} onChange={(event) => updateDraft(order.id, "trackingCode", event.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" placeholder="Opcional"/></label></div>}
            <label className="block text-xs font-bold">Observação para o comprador<textarea value={draft.sellerNote} onChange={(event) => updateDraft(order.id, "sellerNote", event.target.value)} className="mt-1 min-h-16 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" maxLength={1000} placeholder="Previsão, janela de entrega ou instruções de retirada"/></label>
            <div className="flex flex-wrap gap-2"><button onClick={() => void save(order, "preparing")} disabled={busy === order.id || order.fulfillment?.status === "preparing" || Boolean(order.cancellation_status)} className="rounded-xl border border-[#CBD5E1] px-3 py-2 text-sm font-bold disabled:opacity-50">{busy === order.id ? "Salvando…" : "Separar pedido"}</button><button onClick={() => void save(order, "ready")} disabled={busy === order.id || Boolean(order.cancellation_status) || !["pickup", "own_delivery"].includes(draft.deliveryMode) || ["ready", "shipped"].includes(order.fulfillment?.status ?? "")} className="rounded-xl bg-[#10D3B8] px-3 py-2 text-sm font-extrabold text-[#0B2240] disabled:opacity-50">Marcar pronto</button><button onClick={() => void save(order, "shipped")} disabled={busy === order.id || Boolean(order.cancellation_status) || !["own_delivery", "carrier"].includes(draft.deliveryMode)} className="rounded-xl bg-[#0B2240] px-3 py-2 text-sm font-extrabold text-white disabled:opacity-50">Registrar saída</button></div>
          </div>}
          {order.payment_status !== "paid" && <p className="mt-4 border-t pt-3 text-xs font-semibold text-[#64748B]">Entrega confirmada pelo comprador em {date(order.delivered_at)}. O pedido está encerrado para atualização da expedição.</p>}
        </article>;
      })}</div>}
    </div>
  </main>;
}
