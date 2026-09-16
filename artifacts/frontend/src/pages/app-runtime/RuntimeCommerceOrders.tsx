import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Fingerprint, Loader2, PackageCheck, ReceiptText, RefreshCw } from "lucide-react";

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
  origin?: string | null;
  sourceKey?: string | null;
  externalOrderId?: string | null;
  storeId?: string | null;
};

type Props = { appId: string; lang: "pt" | "es" };

const COPY = {
  pt: {
    empty: "Você ainda não possui compras vinculadas a esta conta.",
    unavailable: "Não foi possível carregar suas compras agora.",
    refresh: "Atualizar",
    pay: "Abrir pagamento",
    total: "Total",
    order: "Compra",
    pending: "Aguardando pagamento",
    paid: "Pago",
    cancelled: "Cancelado",
    overdue: "Vencido",
    failed: "Falhou",
    refunded: "Estornado",
    partiallyRefunded: "Estorno parcial",
    voided: "Anulado",
    recurrencePending: "Pagamento recebido · ativando recorrência",
    recurrenceFailed: "Pagamento recebido · recorrência requer atenção",
    identityTitle: "Encontrar compras pelo CPF",
    identityBody: "Informe seu CPF para vincular automaticamente compras feitas no caixa, PDV, ERP, e-commerce ou outros canais deste estabelecimento.",
    identityPrivacy: "O CPF é protegido e usado para identificar seu histórico de compras. Ele não é exibido no histórico nem usado como chave técnica do sistema.",
    cpfPlaceholder: "CPF",
    linkCpf: "Vincular CPF",
    linkingCpf: "Vinculando...",
    cpfInvalid: "Informe um CPF válido.",
    cpfUnavailable: "Não foi possível vincular o CPF agora.",
    cpfForbidden: "A identificação por CPF ainda não está habilitada neste app.",
    cpfLinked: "CPF vinculado.",
    purchasesFound: "compra(s) encontrada(s) e vinculada(s).",
    sourceApp: "App",
    sourcePdv: "PDV / Caixa",
    sourceErp: "ERP",
    sourceEcommerce: "E-commerce",
    sourceMarketplace: "Marketplace",
    sourceManual: "Lançamento",
    sourceOther: "Outro canal",
  },
  es: {
    empty: "Todavía no tienes compras vinculadas a esta cuenta.",
    unavailable: "No fue posible cargar tus compras ahora.",
    refresh: "Actualizar",
    pay: "Abrir pago",
    total: "Total",
    order: "Compra",
    pending: "Esperando pago",
    paid: "Pagado",
    cancelled: "Cancelado",
    overdue: "Vencido",
    failed: "Falló",
    refunded: "Reembolsado",
    partiallyRefunded: "Reembolso parcial",
    voided: "Anulado",
    recurrencePending: "Pago recibido · activando recurrencia",
    recurrenceFailed: "Pago recibido · recurrencia requiere atención",
    identityTitle: "Encontrar compras por CPF",
    identityBody: "Ingresa tu CPF para vincular automáticamente compras realizadas en caja, POS, ERP, e-commerce u otros canales del establecimiento.",
    identityPrivacy: "El CPF se protege y se usa para identificar tu historial. No se muestra en el historial ni se usa como clave técnica del sistema.",
    cpfPlaceholder: "CPF",
    linkCpf: "Vincular CPF",
    linkingCpf: "Vinculando...",
    cpfInvalid: "Ingresa un CPF válido.",
    cpfUnavailable: "No fue posible vincular el CPF ahora.",
    cpfForbidden: "La identificación por CPF aún no está habilitada en esta app.",
    cpfLinked: "CPF vinculado.",
    purchasesFound: "compra(s) encontrada(s) y vinculada(s).",
    sourceApp: "App",
    sourcePdv: "POS / Caja",
    sourceErp: "ERP",
    sourceEcommerce: "E-commerce",
    sourceMarketplace: "Marketplace",
    sourceManual: "Registro",
    sourceOther: "Otro canal",
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

function sessionStorageKey(appId: string) {
  return `vendorai:app-user-session:${appId}`;
}

function digits(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function formatCpf(value: string) {
  const cpf = digits(value);
  if (cpf.length <= 3) return cpf;
  if (cpf.length <= 6) return `${cpf.slice(0, 3)}.${cpf.slice(3)}`;
  if (cpf.length <= 9) return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6)}`;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
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

function statusLabel(status: string, copy: Copy) {
  if (status === "paid") return copy.paid;
  if (status === "cancelled") return copy.cancelled;
  if (status === "overdue") return copy.overdue;
  if (status === "failed") return copy.failed;
  if (status === "refunded") return copy.refunded;
  if (status === "partially_refunded") return copy.partiallyRefunded;
  if (status === "voided") return copy.voided;
  if (["recurrence_pending", "recurrence_provisioning"].includes(status)) return copy.recurrencePending;
  if (status === "recurrence_failed") return copy.recurrenceFailed;
  return copy.pending;
}

function statusClass(status: string) {
  if (status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["failed", "cancelled", "overdue", "recurrence_failed", "refunded", "voided"].includes(status)) return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "partially_refunded") return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function originLabel(origin: string | null | undefined, sourceKey: string | null | undefined, copy: Copy) {
  if (origin === "app") return copy.sourceApp;
  if (origin === "pdv") return copy.sourcePdv;
  if (origin === "erp") return copy.sourceErp;
  if (origin === "ecommerce") return copy.sourceEcommerce;
  if (origin === "marketplace") return copy.sourceMarketplace;
  if (origin === "manual") return copy.sourceManual;
  return sourceKey || copy.sourceOther;
}

export default function RuntimeCommerceOrders({ appId, lang }: Props) {
  const copy = COPY[lang];
  const [orders, setOrders] = useState<RuntimeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [cpf, setCpf] = useState("");
  const [linkingCpf, setLinkingCpf] = useState(false);
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  const [identitySuccess, setIdentitySuccess] = useState(false);

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

  async function linkCpf() {
    const normalized = digits(cpf);
    if (normalized.length !== 11) {
      setIdentitySuccess(false);
      setIdentityMessage(copy.cpfInvalid);
      return;
    }
    const token = window.localStorage.getItem(sessionStorageKey(appId));
    if (!token) {
      setIdentitySuccess(false);
      setIdentityMessage(copy.cpfUnavailable);
      return;
    }

    setLinkingCpf(true);
    setIdentityMessage(null);
    try {
      const response = await fetch(`/api/app-runtime/apps/${encodeURIComponent(appId)}/actions/viewer.identity.cpf.link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ input: { cpf: normalized } }),
      });
      const payload = await response.json().catch(() => ({})) as JsonObject;
      if (!response.ok) {
        setIdentitySuccess(false);
        if (response.status === 403) setIdentityMessage(copy.cpfForbidden);
        else if (response.status === 422) setIdentityMessage(copy.cpfInvalid);
        else setIdentityMessage(typeof payload.message === "string" ? payload.message : copy.cpfUnavailable);
        return;
      }
      const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
        ? payload.data as JsonObject
        : {};
      const claimed = Number(data.claimedPurchases ?? 0);
      const masked = typeof data.maskedCpf === "string" ? data.maskedCpf : "";
      setIdentitySuccess(true);
      setIdentityMessage(`${copy.cpfLinked}${masked ? ` ${masked}.` : ""} ${claimed} ${copy.purchasesFound}`);
      setCpf("");
      await load();
    } catch {
      setIdentitySuccess(false);
      setIdentityMessage(copy.cpfUnavailable);
    } finally {
      setLinkingCpf(false);
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

  const identityCard = (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100"><Fingerprint className="h-5 w-5 text-slate-600" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">{copy.identityTitle}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{copy.identityBody}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={formatCpf(cpf)}
              onChange={(event) => setCpf(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder={copy.cpfPlaceholder}
              aria-label={copy.cpfPlaceholder}
              className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500"
            />
            <button type="button" onClick={() => void linkCpf()} disabled={linkingCpf || digits(cpf).length !== 11} className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ backgroundColor: "var(--app-runtime-primary, #0f172a)" }}>
              {linkingCpf && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {linkingCpf ? copy.linkingCpf : copy.linkCpf}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-slate-400">{copy.identityPrivacy}</p>
          {identityMessage && <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${identitySuccess ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{identityMessage}</p>}
        </div>
      </div>
    </section>
  );

  if (loading && orders.length === 0) {
    return <section className="space-y-3">{identityCard}<div className="rounded-2xl border bg-white p-8 text-center shadow-sm"><Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" /></div></section>;
  }

  if (failed && orders.length === 0) {
    return <section className="space-y-3">{identityCard}<div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500"><ReceiptText className="mx-auto mb-3 h-7 w-7 text-slate-400" /><p>{copy.unavailable}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex items-center rounded-xl border px-3 py-2 text-xs font-semibold"><RefreshCw className="mr-2 h-3.5 w-3.5" />{copy.refresh}</button></div></section>;
  }

  if (orders.length === 0) {
    return <section className="space-y-3">{identityCard}<div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-500"><PackageCheck className="mx-auto mb-3 h-7 w-7 text-slate-400" />{copy.empty}</div></section>;
  }

  return (
    <section className="space-y-3">
      {identityCard}
      <div className="flex justify-end"><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"><RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />{copy.refresh}</button></div>
      {orders.map((order) => {
        const products = Array.isArray(order.products) ? order.products : [];
        const canPay = Boolean(order.paymentUrl) && ["created", "payment_pending"].includes(order.status);
        return (
          <article key={`${order.origin ?? "app"}-${order.id}`} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{copy.order} #{(order.externalOrderId || order.id).slice(0, 14)}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{originLabel(order.origin, order.sourceKey, copy)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{dateLabel(order.createdAt, lang)}{order.storeId ? ` · ${order.storeId}` : ""}</p>
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
