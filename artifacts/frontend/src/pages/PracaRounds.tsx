import * as React from "react";
import { ArrowDown, Clock3, MapPin, Package, RefreshCw, Truck } from "lucide-react";

type Offer = { unitPrice: number; freight: number };
type Opportunity = {
  id: string; code: string; category: string; itemName: string; specification?: string | null;
  unit: string; city: string; state: string; neededAt: string; closesAt: string; totalQuantity: number;
  myOffer: Offer | null; bestOffer: Offer | null;
};

export default function PracaRounds() {
  const [items, setItems] = React.useState<Opportunity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [drafts, setDrafts] = React.useState<Record<string, { unitPrice: string; freight: string; deliveryDays: string }>>({});

  const load = React.useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/praca-rodadas/opportunities", { credentials: "include", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar as rodadas.");
      setItems(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar oportunidades.");
    } finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const value = (s: string) => Number(s.replace(",", "."));
  const dateTime = (s: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(s));
  const effective = (offer: Offer, quantity: number) => offer.unitPrice + (quantity > 0 ? offer.freight / quantity : 0);

  const submit = async (item: Opportunity) => {
    const draft = drafts[item.id];
    if (!draft) return;
    const unitPrice = value(draft.unitPrice), freight = value(draft.freight || "0"), deliveryDays = Number(draft.deliveryDays);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(freight) || freight < 0 || !Number.isInteger(deliveryDays) || deliveryDays < 0) {
      setError("Confira o preço por unidade, o frete e o prazo de entrega.");
      return;
    }
    setBusy(item.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/praca-rodadas/opportunities/" + encodeURIComponent(item.id) + "/bids", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitPrice, freight, deliveryDays }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Não foi possível enviar o lance.");
      setNotice(body.crmStatus === "notified"
        ? "Lance registrado. A oportunidade também entrou nas Conversas como lead anônimo."
        : "Lance registrado. A atualização do lead ficará disponível quando a integração CRM responder.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao enviar lance.");
    } finally { setBusy(null); }
  };

  return <main className="min-h-full bg-[#F7F9FC] px-4 py-6 pb-10 text-[#0B2240] md:px-8 md:py-10">
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#008878]">AppVendor.ai · Praça.ai</p>
          <h1 className="mt-2 font-[Manrope] text-3xl font-extrabold sm:text-4xl">Rodadas de negócios</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748B]">Veja a demanda total do lote e envie sua oferta. Durante a rodada, você não verá o nome nem o contato dos compradores ou das outras lojas. Um novo lance precisa reduzir o custo efetivo da sua oferta anterior.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[#DCE4EC] bg-white px-4 py-3 text-sm font-bold"><RefreshCw className="h-4 w-4"/>Atualizar</button>
      </div>
      {notice && <div role="status" className="mb-4 rounded-xl border border-[#A9E9DE] bg-[#F0FCFA] p-3 text-sm font-semibold">{notice}</div>}
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {loading ? <div className="rounded-2xl border bg-white p-8 text-sm text-[#64748B]">Carregando oportunidades…</div>
      : items.length === 0 ? <div className="rounded-2xl border bg-white p-10 text-center"><Package className="mx-auto h-8 w-8 text-[#008878]"/><h2 className="mt-3 font-bold">Nenhuma rodada aberta para sua loja</h2><p className="mt-1 text-sm text-[#64748B]">Novas oportunidades compatíveis aparecerão aqui.</p></div>
      : <div className="grid gap-4 lg:grid-cols-2">{items.map(item => {
        const draft = drafts[item.id] ?? { unitPrice: "", freight: "0", deliveryDays: "0" };
        const best = item.bestOffer ? effective(item.bestOffer, item.totalQuantity) : null;
        const mine = item.myOffer ? effective(item.myOffer, item.totalQuantity) : null;
        return <article key={item.id} className="rounded-2xl border border-[#E5EAF0] bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><span className="text-xs font-extrabold uppercase tracking-wide text-[#008878]">{item.category} · {item.code}</span><h2 className="mt-2 text-xl font-extrabold">{item.itemName}</h2>{item.specification && <p className="mt-1 text-sm text-[#64748B]">{item.specification}</p>}</div><span className="rounded-full bg-[#E8F2FF] px-3 py-1 text-xs font-bold text-[#126CC5]">Aberta</span></div>
          <div className="mt-4 grid gap-2 rounded-xl bg-[#F7F9FC] p-3 text-sm sm:grid-cols-2">
            <p><Package className="mr-1 inline h-4 w-4"/>Demanda agregada: <strong>{item.totalQuantity.toLocaleString("pt-BR")} {item.unit}</strong></p>
            <p><MapPin className="mr-1 inline h-4 w-4"/>{item.city}, {item.state}</p>
            <p><Clock3 className="mr-1 inline h-4 w-4"/>Encerra: <strong>{dateTime(item.closesAt)}</strong></p>
            <p><Truck className="mr-1 inline h-4 w-4"/>Entrega prevista: <strong>{new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(item.neededAt))}</strong></p>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#64748B]">
            {best !== null && <p>Melhor custo efetivo por unidade: <strong className="text-[#0B2240]">R$ {best.toLocaleString("pt-BR",{minimumFractionDigits:2})}</strong></p>}
            {mine !== null && <p>Sua oferta atual por unidade: <strong className="text-[#0B2240]">R$ {mine.toLocaleString("pt-BR",{minimumFractionDigits:2})}</strong></p>}
            <p>Identidades permanecem ocultas até o comprador aceitar a proposta selecionada.</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-bold">Preço por {item.unit} (R$)<input inputMode="decimal" value={draft.unitPrice} onChange={e=>setDrafts(v=>({...v,[item.id]:{...draft,unitPrice:e.target.value}}))} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" placeholder="0,00"/></label>
            <label className="text-xs font-bold">Frete total (R$)<input inputMode="decimal" value={draft.freight} onChange={e=>setDrafts(v=>({...v,[item.id]:{...draft,freight:e.target.value}}))} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" placeholder="0,00"/></label>
            <label className="text-xs font-bold">Prazo de entrega (dias)<input inputMode="numeric" value={draft.deliveryDays} onChange={e=>setDrafts(v=>({...v,[item.id]:{...draft,deliveryDays:e.target.value}}))} className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-sm" placeholder="0"/></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[#64748B]">{mine !== null ? "Se enviar outra oferta, ela precisa reduzir seu custo efetivo atual." : "Sua primeira oferta será registrada de forma sigilosa."}</span>
            <button onClick={()=>void submit(item)} disabled={busy===item.id} className="inline-flex items-center gap-2 rounded-xl bg-[#10D3B8] px-4 py-2.5 text-sm font-extrabold text-[#0B2240] disabled:opacity-50">{busy===item.id?"Enviando…":<><ArrowDown className="h-4 w-4"/>Enviar lance</>}</button>
          </div>
        </article>
      })}</div>}
      <p className="mt-5 text-xs leading-5 text-[#64748B]">O comprador receberá uma oferta individual após o encerramento e só verá os dados da loja depois de aceitar. Um aceite gera o lead identificado no seu CRM para você formalizar entrega e pagamento.</p>
    </div>
  </main>;
}
