import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, PackageCheck, ReceiptText, RefreshCw } from "lucide-react";

type JsonObject = Record<string, unknown>;

type OrderItem = {
  name?: string;
  quantity?: number;
};

type RuntimeOrder = {
  id: string;
  status: string;
  paymentUrl?: string | null;
  billingType?: string;
  products?: OrderItem[];
  totals?: { dueNow?: number };
  paidAt?: string | null;
  createdAt?: string | null;
};

type Props = { appId: string; lang: "pt" | "es" };

const COPY = {
  pt: {
    empty: "Você ainda não possui pedidos neste app.",
    unavailable: "Não foi possível carregar seus pedidos agora.",
    refresh: "Atualizar",
    pay: "Abrir pagamento",
    total: "Total",
    order: "Pedido",
    pending: "Aguardando pagamento",
    paid: "Pago",
    cancelled: "Cancelado",
    overdue: "Vencido",
    failed: "Falhou",
    recurrencePending: "Pagamento recebido · ativando recorrência",
    recurrenceFailed: "Pagamento recebido · recorrência requer atenção",
  },
  es: {
    empty: "Todavía no tienes pedidos en esta app.",
    unavailable: "No fue posible cargar tus pedidos ahora.",
    refresh: "Actualizar",
    pay: "Abrir pago",
    total: "Total",
    order: "Pedido",
    pending: "Esperando pago",
    paid: "Pagado",
    cancelled: "Cancelado",
    overdue: "Vencido",
    failed: "Falló",
    recurrencePending: "Pago recibido · activando recurrencia",
    recurrenceFailed: "Pago recibido · recurrencia requiere atención",
  },
} as const;

function sessionStorageKey(appId: string) {
  return `vendorai:app-user-session:${appId}`;
}

function money(value: unknown, lang: "pt" | "es") {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "es-AR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function dateLabel(value: string | null | undefined, lang: "pt" | "es") {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : "es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: string, copy: typeof COPY.pt) {
  if (status === "paid") return copy.paid;
  if (status === "cancelled") return copy.cancelled;
  if (status === "overdue") return copy.overdue;
  if (status === "failed") return copy.failed;
  if (["recurrence_pending", "recurrence_provisioning"].includes(status)) return copy.recurrencePending;
  if (status === "recurrence_failed") return copy.recurrenceFailed;
  return copy.pending;
}

function statusClass(status: string) {
  if (status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["failed", "cancelled", "overdue", "recurrence_failed"].includes(status)) return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function RuntimeCommerceOrders({ appId, lang }: Props) {
  const copy = COPY[lang];
  const [orders, setOrders] = useState<RuntimeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  async function load() {
    if (appId.startsWith("preview-")) {
      setLoading(false);
      return;
    }
    const token = window.localStorage.getItem(sessionStorageKey(appId));
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/app-runtime/apps/${encodeURIComponent(appId)}/data/commerce.orders`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!response.ok) throw new Error("orders_unavailable");
      const payload = await response.json() as JsonObject;
      const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
        ? payload.data as JsonObject
        : {};
      setOrders(Array.isArray(data.items) ? data.items as RuntimeOrder[] : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [appId]);

  const hasPending = useMemo(
    () => orders.some((order) => ["created", "payment_pending", "recurrence_pending", "recurrence_provisioning"].includes(order.status)),
    [orders],
  );

  useEffect(() => {
    if (!hasPending || appId.startsWith("preview-")) return;
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [appId, hasPending]);

  if (loading && orders.length === 0) {
    return <section className="rounded-2xl border bg-white p-8 text-center shadow-sm"><Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" /></section>;
  }

  if (failed && orders.length === 0) {
    return <section className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500"><ReceiptText className="mx-auto mb-3 h-7 w-7 text-slate-400" /><p>{copy.unavailable}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center rounded-xl border px-3 py-2 text-xs font-semibold"><RefreshCw className="mr-2 h-3.5 w-3.5" />{copy.refresh}</button></section>;
  }

  if (orders.length === 0) {
    return <section className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-500"><PackageCheck className="mx-auto mb-3 h-7 w-7 text-slate-400" />{copy.empty}</section>;
  }

  return (
    <section className="space-y-3">
      <div className="flex justify-end"><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"><RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />{copy.refresh}</button></div>
      {orders.map((order) => {
        const products = Array.isArray(order.products) ? order.products : [];
        const canPay = Boolean(order.paymentUrl) && ["created", "payment_pending"].includes(order.status);
        return (
          <article key={order.id} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{copy.order} #{order.id.slice(0, 8)}</p>
                <p className="mt-1 text-xs text-slate-500">{dateLabel(order.createdAt, lang)}</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(order.status)}`}>{statusLabel(order.status, copy)}</span>
            </div>

            {products.length > 0 && <div className="mt-3 divide-y rounded-xl bg-slate-50 px-3">{products.slice(0, 8).map((product, index) => <div key={`${order.id}-${index}`} className="flex justify-between gap-3 py-2 text-xs"><span className="min-w-0 truncate text-slate-700">{product.name || "Produto"}</span><span className="shrink-0 font-semibold text-slate-500">{Number(product.quantity ?? 1)}x</span></div>)}</div>}

            <div className="mt-4 flex items-center justify-between border-t pt-3"><span className="text-sm text-slate-500">{copy.total}</span><strong className="text-lg text-slate-950">{money(order.totals?.dueNow, lang)}</strong></div>

            {canPay && <button type="button" onClick={() => window.location.assign(order.paymentUrl!)} className="mt-3 flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold text-white" style={{ backgroundColor: "var(--app-runtime-primary, #0f172a)" }}><ExternalLink className="mr-2 h-4 w-4" />{copy.pay}</button>}
          </article>
        );
      })}
    </section>
  );
}
