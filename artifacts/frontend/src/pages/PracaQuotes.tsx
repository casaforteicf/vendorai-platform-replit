import * as React from "react";
import { ArrowUpRight, Clock3, MapPin, Package, RefreshCw, Send, Truck } from "lucide-react";

type QuoteItem = { id: string; quantity: number; unit: string; description: string; brand?: string | null };
type QuoteOffer = { id: string; subtotal: number; freight: number; deliveryDays: number; terms?: string | null };
type Opportunity = {
  id: string; protocol: string; category: string; title: string; description?: string | null;
  location: string; neededAt?: string | null; createdAt: string; items: QuoteItem[]; myOffer: QuoteOffer | null;
};

export default function PracaQuotes() {
  const [items, setItems] = React.useState<Opportunity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [drafts, setDrafts] = React.useState<Record<string, { prices: Record<string, string>; freight: string; deliveryDays: string; terms: string }>>({});

  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/praca-cotacoes/opportunities", { credentials: "include", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar as cotações.");
      setItems(body);
      setDrafts((current) => {
        const next = { ...current };
        for (const quote of body as Opportunity[]) {
          if (!next[quote.id]) next[quote.id] = {
            prices: Object.fromEntries(quote.items.map((item) => [item.id, ""])),
            freight: "0", deliveryDays: "0", terms: "",
          };
        }
        return next;
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar cotações."); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const updateDraft = (id: string, change: Partial<{ prices: Record<string, string>; freight: string; deliveryDays: string; terms: string }>) => {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? { prices: {}, freight: "0", deliveryDays: "0", terms: "" }), ...change } }));
  };
  const parse = (value: string) => Number(value.replace(",", "."));
  const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  const submit = async (quote: Opportunity) => {
    const draft = drafts[quote.id];
    if (!draft) return;
    const offers = quote.items.map((item) => ({ itemId: item.id, unitPrice: parse(draft.prices[item.id] ?? "") }));
    const freight = parse(draft.freight || "0"), deliveryDays = Number(draft.deliveryDays);
    if (offers.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice <= 0) ||
        !Number.isFinite(freight) || freight < 0 || !Number.isInteger(deliveryDays) || deliveryDays < 0) {
      setError("Informe o preço de todos os itens, o frete e o prazo de entrega.");
      return;
    }
    setBusy(quote.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/praca-cotacoes/opportunities/" + encodeURIComponent(quote.id) + "/offers", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: offers, freight, deliveryDays, terms: draft.terms }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível enviar a proposta.");
      setNotice("Proposta enviada. A demanda também está registrada como lead anônimo nas Conversas.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao enviar proposta."); }
    finally { setBusy(null); }
  };

  return <main className="min-h-full bg-[#F7F9FC] px-4 py-6 pb-10 text-[#0B2240] md:px-8 md:py-10">
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#008878]">AppVendor.ai · Praça.ai</p>
          <h1 className="mt-2 font-[Manrope] text-3xl font-extrabold sm:text-4xl">Cotações diretas</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748B]">Responda às solicitações enviadas para sua loja com preço por item, frete e prazo. O comprador compara as propostas e escolhe uma.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[#DCE4EC] bg-white px-4 py-3 text-sm font-bold"><RefreshCw className="h-4 w-4"/>Atualizar</button>
      </div>
      <div className="mb-5 rounded-xl border border-[#B9EDE4] bg-[#F0FCFA] p-4 text-sm leading-6 text-[#175C57]"><strong>Privacidade:</strong> você recebe um lead anônimo no CRM. Nome, telefone e e-mail do comprador só são liberados depois que o pagamento é confirmado. Não inclua contatos nas observações.</div>
      {notice && <div role="status" className="mb-4 rounded-xl border border-[#A9E9DE] bg-[#F0FCFA] p-3 text-sm font-semibold">{notice}</div>}
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {loading ? <div className="rounded-2xl border bg-white p-8 text-sm text-[#64748B]">Carregando cotações…</div>
      : items.length === 0 ? <div className="rounded-2xl border bg-white p-10 text-center"><Package className="mx-auto h-8 w-8 text-[#008878]"/><h2 className="mt-3 font-bold">Nenhuma cotação aberta</h2><p className="mt-1 text-sm text-[#64748B]">Solicitações compatíveis com sua loja aparecerão aqui.</p></div>
      : <div className="grid gap-4 lg:grid-cols-2">{items.map((quote) => {
        const draft = drafts[quote.id] ?? { prices: {}, freight: "0", deliveryDays: "0", terms: "" };
        const subtotal = quote.items.reduce((sum, item) => sum + item.quantity * (parse(draft.prices[item.id] ?? "") || 0), 0);
        const total = subtotal + (parse(draft.freight || "0") || 0);
        return <article key={quote.id} className="rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><span className="text-xs font-extrabold uppercase tracking-wide text-[#008878]">{quote.category} · {quote.protocol}</span><h2 className="mt-2 text-xl font-extrabold">{quote.title}</h2></div><span className="rounded-full bg-[#E8F2FF] px-3 py-1 text-xs font-bold text-[#126CC5]">Aberta</span></div>
          {quote.description && <p className="mt-2 text-sm text-[#64748B]">{quote.description}</p>}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#475569]"><span><MapPin className="mr-1 inline h-4 w-4"/>{quote.location}</span>{quote.neededAt && <span><Truck className="mr-1 inline h-4 w-4"/>Precisa até {new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(quote.neededAt))}</span>}<span><Clock3 className="mr-1 inline h-4 w-4"/>Recebida {date(quote.createdAt)}</span></div>
          <div className="mt-4 space-y-2">{quote.items.map((item) => <div key={item.id} className="grid grid-cols-[1fr_115px] items-center gap-3 rounded-xl bg-[#F7F9FC] p-3"><div><p className="text-sm font-bold">{item.description}</p><p className="text-xs text-[#64748B]">{item.quantity.toLocaleString("pt-BR")} {item.unit}{item.brand ? " · " + item.brand : ""}</p></div><label className="text-[11px] font-bold text-[#64748B]">Preço unitário<input aria-label={`Preço unitário de ${item.description}`} inputMode="decimal" value={draft.prices[item.id] ?? ""} onChange={(event) => updateDraft(quote.id, { prices: { ...draft.prices, [item.id]: event.target.value } })} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-2 py-2 text-sm text-[#0B2240]" placeholder="R$ 0,00"/></label></div>)}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Frete total<input inputMode="decimal" value={draft.freight} onChange={(event)=>updateDraft(quote.id,{freight:event.target.value})} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" placeholder="R$ 0,00"/></label><label className="text-xs font-bold">Prazo de entrega (dias)<input inputMode="numeric" value={draft.deliveryDays} onChange={(event)=>updateDraft(quote.id,{deliveryDays:event.target.value})} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" placeholder="0"/></label></div>
          <label className="mt-3 block text-xs font-bold">Condições (opcional)<textarea value={draft.terms} onChange={(event)=>updateDraft(quote.id,{terms:event.target.value})} className="mt-1 min-h-16 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" placeholder="Validade e condições comerciais. Não informe seus contatos."/></label>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="text-xs text-[#64748B]">{quote.myOffer ? <>Proposta atual: <strong>{money(quote.myOffer.subtotal + quote.myOffer.freight)}</strong></> : "Novo lead anônimo no CRM"}<p className="mt-1 font-bold text-[#0B2240]">Total desta proposta: {money(total)}</p></div><button onClick={()=>void submit(quote)} disabled={busy===quote.id} className="inline-flex items-center gap-2 rounded-xl bg-[#10D3B8] px-4 py-2.5 text-sm font-extrabold text-[#0B2240] disabled:opacity-50">{busy===quote.id?"Enviando…":<><Send className="h-4 w-4"/>Enviar proposta</>}</button></div>
          <p className="mt-3 border-t pt-3 text-xs text-[#64748B]">A identificação do comprador só é liberada depois que o pagamento é confirmado. <ArrowUpRight className="ml-1 inline h-3 w-3"/></p>
        </article>;
      })}</div>}
    </div>
  </main>;
}
