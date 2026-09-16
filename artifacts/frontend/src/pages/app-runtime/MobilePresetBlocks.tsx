import { useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  Camera,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Heart,
  HelpCircle,
  Home,
  Info,
  MapPin,
  Menu,
  Package,
  Percent,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Tag,
  Ticket,
  UserRound,
  WalletCards,
} from "lucide-react";

type JsonObject = Record<string, unknown>;

type Props = {
  blockId: string;
  type: string;
  props: JsonObject;
  accent?: string;
  onNavigate?: (pageId: string) => void;
};

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function iconFor(name?: string, className = "h-5 w-5") {
  const key = name?.trim().toLowerCase() ?? "";
  if (["home", "inicio", "início"].includes(key)) return <Home className={className} />;
  if (["cart", "shopping-cart", "compras", "carrinho"].includes(key)) return <ShoppingCart className={className} />;
  if (["tag", "ofertas", "promocoes", "promoções"].includes(key)) return <Tag className={className} />;
  if (["bell", "notificacoes", "notificações"].includes(key)) return <Bell className={className} />;
  if (["user", "perfil", "profile"].includes(key)) return <UserRound className={className} />;
  if (["store", "loja", "lojas"].includes(key)) return <Store className={className} />;
  if (["ticket", "voucher", "vouchers"].includes(key)) return <Ticket className={className} />;
  if (["wallet", "cashback", "carteira"].includes(key)) return <WalletCards className={className} />;
  if (["settings", "configuracoes", "configurações"].includes(key)) return <Settings className={className} />;
  if (["help", "faq", "duvidas", "dúvidas"].includes(key)) return <HelpCircle className={className} />;
  if (["shield", "lgpd", "privacidade"].includes(key)) return <ShieldCheck className={className} />;
  if (["document", "termos", "arquivo"].includes(key)) return <FileText className={className} />;
  if (["package", "produto", "produtos"].includes(key)) return <Package className={className} />;
  if (["percent", "desconto", "economia"].includes(key)) return <Percent className={className} />;
  if (["money", "valor", "preco", "preço"].includes(key)) return <CircleDollarSign className={className} />;
  if (["menu", "mais"].includes(key)) return <Menu className={className} />;
  return <Info className={className} />;
}

function go(item: JsonObject, onNavigate?: (pageId: string) => void) {
  const pageId = text(item.pageId);
  if (pageId && onNavigate) onNavigate(pageId);
}

function PromoBanner({ props, accent, onNavigate }: Pick<Props, "props" | "accent" | "onNavigate">) {
  const imageUrl = text(props.imageUrl);
  const title = text(props.title);
  const body = text(props.body) ?? text(props.subtitle);
  const eyebrow = text(props.eyebrow);
  const ctaLabel = text(props.ctaLabel);
  const pageId = text(props.pageId);
  return (
    <section className="relative min-h-[220px] overflow-hidden rounded-3xl border bg-slate-950 shadow-sm">
      {imageUrl && <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/55 to-transparent" />
      <div className="relative flex min-h-[220px] max-w-[78%] flex-col justify-end p-5 text-white sm:p-7">
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">{eyebrow}</p>}
        {title && <h2 className="mt-1 text-2xl font-bold leading-tight">{title}</h2>}
        {body && <p className="mt-2 text-sm leading-6 text-white/80">{body}</p>}
        {ctaLabel && <button type="button" onClick={() => pageId && onNavigate?.(pageId)} className="mt-4 min-h-11 w-fit rounded-xl px-4 text-sm font-semibold text-white" style={{ backgroundColor: accent ?? "#0f172a" }}>{ctaLabel}</button>}
      </div>
    </section>
  );
}

function QuickActions({ props, accent, onNavigate }: Pick<Props, "props" | "accent" | "onNavigate">) {
  const items = objects(props.items).slice(0, 8);
  return (
    <section>
      {text(props.title) && <h3 className="mb-3 text-sm font-semibold text-slate-950">{text(props.title)}</h3>}
      <div className="grid grid-cols-4 gap-2">
        {items.map((item, index) => (
          <button key={`${text(item.title) ?? "action"}-${index}`} type="button" onClick={() => go(item, onNavigate)} className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border bg-white px-2 py-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50" style={{ color: accent ?? "#0f172a" }}>{iconFor(text(item.icon), "h-5 w-5")}</span>
            <span className="line-clamp-2 text-[11px] font-medium leading-4 text-slate-700">{text(item.title) ?? text(item.label) ?? "Ação"}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProductGrid({ props, accent, onNavigate }: Pick<Props, "props" | "accent" | "onNavigate">) {
  const items = objects(props.items);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const categories = useMemo(() => {
    const explicit = Array.isArray(props.categories) ? props.categories.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
    const inferred = items.map((item) => text(item.category)).filter((item): item is string => Boolean(item));
    return ["Todos", ...Array.from(new Set([...explicit, ...inferred]))];
  }, [items, props.categories]);
  const filtered = items.filter((item) => {
    const title = `${text(item.title) ?? ""} ${text(item.brand) ?? ""}`.toLowerCase();
    const matchesQuery = !query.trim() || title.includes(query.trim().toLowerCase());
    const matchesCategory = category === "Todos" || text(item.category) === category;
    return matchesQuery && matchesCategory;
  });

  return (
    <section className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text(props.searchPlaceholder) ?? "Buscar produto, serviço ou categoria"} className="h-12 w-full rounded-2xl border bg-white pl-12 pr-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400" />
      </div>
      {categories.length > 1 && <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{categories.map((item) => {
        const active = item === category;
        return <button key={item} type="button" onClick={() => setCategory(item)} className={`min-h-11 shrink-0 rounded-full border px-4 text-xs font-semibold transition ${active ? "text-white" : "bg-white text-slate-600"}`} style={active ? { backgroundColor: accent ?? "#0f172a", borderColor: accent ?? "#0f172a" } : undefined}>{item}</button>;
      })}</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {filtered.map((item, index) => <article key={`${text(item.title) ?? "product"}-${index}`} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <button type="button" onClick={() => go(item, onNavigate)} className="block w-full text-left">
            <div className="relative aspect-[1.1/1] bg-slate-50">
              {text(item.imageUrl) ? <img src={text(item.imageUrl)} alt="" className="h-full w-full object-contain p-3" /> : <div className="flex h-full items-center justify-center text-slate-300"><Package className="h-10 w-10" /></div>}
              {text(item.discount) && <span className="absolute bottom-2 left-2 rounded-full px-2 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: accent ?? "#0f172a" }}>{text(item.discount)}</span>}
              <Heart className="absolute right-2 top-2 h-5 w-5 text-slate-400" />
            </div>
            <div className="p-3">
              {text(item.oldPrice) && <p className="text-[11px] text-slate-400 line-through">{text(item.oldPrice)}</p>}
              {text(item.price) && <p className="text-lg font-bold leading-none text-slate-950">{text(item.price)}</p>}
              <h4 className="mt-2 line-clamp-2 min-h-9 text-xs font-semibold leading-[18px] text-slate-800">{text(item.title) ?? "Item"}</h4>
              {text(item.expiry) && <p className="mt-2 text-[10px] text-slate-400">{text(item.expiry)}</p>}
            </div>
          </button>
        </article>)}
      </div>
      {filtered.length === 0 && <div className="rounded-2xl border border-dashed bg-white p-8 text-center"><Search className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">Nenhum resultado encontrado</p><p className="mt-1 text-xs text-slate-400">Tente outro termo ou categoria.</p></div>}
    </section>
  );
}

function ProductDetail({ props, accent }: Pick<Props, "props" | "accent">) {
  return (
    <section className="overflow-hidden rounded-3xl border bg-white shadow-sm">
      <div className="relative aspect-[1.25/1] bg-slate-50">
        {text(props.imageUrl) ? <img src={text(props.imageUrl)} alt="" className="h-full w-full object-contain p-8" /> : <div className="flex h-full items-center justify-center text-slate-300"><Package className="h-14 w-14" /></div>}
        <Heart className="absolute right-4 top-4 h-6 w-6 text-slate-500" />
      </div>
      <div className="p-5 sm:p-6">
        {text(props.brand) && <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{text(props.brand)}</p>}
        <h2 className="mt-1 text-xl font-bold text-slate-950">{text(props.title) ?? "Detalhe"}</h2>
        <div className="mt-4 flex items-end gap-2">
          {text(props.oldPrice) && <span className="text-sm text-slate-400 line-through">{text(props.oldPrice)}</span>}
          {text(props.price) && <span className="text-2xl font-bold" style={{ color: accent ?? "#0f172a" }}>{text(props.price)}</span>}
          {text(props.discount) && <span className="mb-1 rounded-full px-2 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: accent ?? "#0f172a" }}>{text(props.discount)}</span>}
        </div>
        {text(props.expiry) && <p className="mt-2 text-xs text-slate-400">{text(props.expiry)}</p>}
        <div className="mt-5 flex gap-3"><div className="flex min-h-11 items-center rounded-xl border px-3 text-sm"><button type="button" className="px-2">−</button><span className="px-2 font-semibold">1</span><button type="button" className="px-2">+</button></div><button type="button" className="min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold text-white" style={{ backgroundColor: accent ?? "#0f172a" }}><ShoppingCart className="mr-2 inline h-4 w-4" />{text(props.actionLabel) ?? "Adicionar"}</button></div>
        {text(props.body) && <div className="mt-6 border-t pt-5"><p className="text-sm font-semibold text-slate-900">Descrição</p><p className="mt-2 text-sm leading-6 text-slate-500">{text(props.body)}</p></div>}
      </div>
    </section>
  );
}

function HistoryList({ props, accent, onNavigate }: Pick<Props, "props" | "accent" | "onNavigate">) {
  const items = objects(props.items);
  return <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">{items.map((item, index) => <button key={`${text(item.title) ?? "history"}-${index}`} type="button" onClick={() => go(item, onNavigate)} className="flex min-h-[84px] w-full items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50" style={{ color: accent ?? "#0f172a" }}><CalendarDays className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{text(item.title) ?? "Período"}</span>{text(item.body) && <span className="mt-1 block text-xs text-slate-400">{text(item.body)}</span>}</span>{text(item.value) && <span className="text-right text-xs font-medium text-slate-500">{text(item.value)}</span>}<ChevronRight className="h-5 w-5 shrink-0 text-slate-300" /></button>)}</section>;
}

function NotificationsList({ props, accent }: Pick<Props, "props" | "accent">) {
  const items = objects(props.items);
  return <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">{items.map((item, index) => <div key={`${text(item.title) ?? "notification"}-${index}`} className="flex gap-3 border-b px-4 py-4 last:border-b-0"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50" style={{ color: accent ?? "#0f172a" }}>{iconFor(text(item.icon) ?? "bell", "h-5 w-5")}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-slate-900">{text(item.title) ?? "Notificação"}</p>{text(item.time) && <span className="shrink-0 text-[10px] text-slate-400">{text(item.time)}</span>}</div>{text(item.body) && <p className="mt-1 text-xs leading-5 text-slate-500">{text(item.body)}</p>}</div>{bool(item.unread) && <span className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent ?? "#0f172a" }} />}</div>)}</section>;
}

function ProfileFields({ props, accent, onNavigate }: Pick<Props, "props" | "accent" | "onNavigate">) {
  const items = objects(props.items);
  return <section className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="flex flex-col items-center border-b px-5 py-6 text-center">{text(props.avatarUrl) ? <div className="relative"><img src={text(props.avatarUrl)} alt="" className="h-24 w-24 rounded-full object-cover" /><span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-white shadow" style={{ color: accent ?? "#0f172a" }}><Camera className="h-4 w-4" /></span></div> : <span className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-slate-400"><UserRound className="h-8 w-8" /></span>}<h2 className="mt-4 text-xl font-bold text-slate-950">{text(props.title) ?? "Meu perfil"}</h2>{text(props.subtitle) && <p className="mt-1 text-sm text-slate-500">{text(props.subtitle)}</p>}</div>{items.map((item, index) => <button key={`${text(item.label) ?? "field"}-${index}`} type="button" onClick={() => go(item, onNavigate)} className="flex min-h-[72px] w-full items-center gap-3 border-b px-5 py-3 text-left last:border-b-0 hover:bg-slate-50"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800">{text(item.label) ?? "Campo"}</span>{text(item.value) && <span className="mt-1 block truncate text-sm text-slate-400">{text(item.value)}</span>}</span><ChevronRight className="h-5 w-5 shrink-0" style={{ color: accent ?? "#94a3b8" }} /></button>)}</section>;
}

function MenuList({ props, accent, onNavigate }: Pick<Props, "props" | "accent" | "onNavigate">) {
  const items = objects(props.items);
  return <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">{items.map((item, index) => <button key={`${text(item.title) ?? "menu"}-${index}`} type="button" onClick={() => go(item, onNavigate)} className="flex min-h-[58px] w-full items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"><span style={{ color: accent ?? "#0f172a" }}>{iconFor(text(item.icon), "h-5 w-5")}</span><span className="min-w-0 flex-1 text-sm font-medium text-slate-800">{text(item.title) ?? text(item.label) ?? "Item"}</span><ChevronRight className="h-4 w-4 text-slate-300" /></button>)}{text(props.version) && <div className="border-t bg-slate-50 px-4 py-3 text-xs text-slate-400">Versão {text(props.version)}</div>}</section>;
}

function StoresList({ props, accent, onNavigate }: Pick<Props, "props" | "accent" | "onNavigate">) {
  const items = objects(props.items);
  const [query, setQuery] = useState("");
  const filtered = items.filter((item) => `${text(item.title) ?? ""} ${text(item.address) ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="space-y-3"><div className="relative"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text(props.searchPlaceholder) ?? "Buscar cidade, bairro ou unidade"} className="h-12 w-full rounded-2xl border bg-white pl-12 pr-4 text-sm shadow-sm outline-none" /></div>{filtered.map((item, index) => <button key={`${text(item.title) ?? "store"}-${index}`} type="button" onClick={() => go(item, onNavigate)} className="w-full rounded-2xl border bg-white p-4 text-left shadow-sm hover:shadow-md"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50" style={{ color: accent ?? "#0f172a" }}><MapPin className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="text-sm font-bold text-slate-900">{text(item.title) ?? "Unidade"}</p>{bool(item.favorite) && <Star className="h-5 w-5 fill-current" style={{ color: accent ?? "#0f172a" }} />}</div>{text(item.address) && <p className="mt-1 text-xs leading-5 text-slate-500">{text(item.address)}</p>}<div className="mt-3 flex flex-wrap gap-2 text-[11px]"><span className="rounded-full bg-slate-50 px-2 py-1 text-slate-600">{text(item.status) ?? "Status indisponível"}</span>{text(item.distance) && <span className="rounded-full bg-slate-50 px-2 py-1 text-slate-600">{text(item.distance)}</span>}</div></div><ChevronRight className="h-5 w-5 shrink-0 text-slate-300" /></div></button>)}</section>;
}

function EmptyState({ props, accent, onNavigate }: Pick<Props, "props" | "accent" | "onNavigate">) {
  const pageId = text(props.pageId);
  return <section className="rounded-3xl border border-dashed bg-white px-6 py-12 text-center shadow-sm"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50" style={{ color: accent ?? "#0f172a" }}>{iconFor(text(props.icon) ?? "info", "h-8 w-8")}</span><h3 className="mt-5 text-lg font-bold text-slate-900">{text(props.title) ?? "Nada por aqui ainda"}</h3>{text(props.body) && <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">{text(props.body)}</p>}{text(props.actionLabel) && <button type="button" onClick={() => pageId && onNavigate?.(pageId)} className="mt-5 min-h-11 rounded-xl px-5 text-sm font-semibold text-white" style={{ backgroundColor: accent ?? "#0f172a" }}>{text(props.actionLabel)}</button>}</section>;
}

function SavingsMetric({ props, accent }: Pick<Props, "props" | "accent">) {
  return <section className="overflow-hidden rounded-3xl p-5 text-white shadow-sm" style={{ backgroundColor: accent ?? "#0f172a" }}><p className="text-sm text-white/80">{text(props.label) ?? "Você já economizou"}</p><p className="mt-2 text-3xl font-bold">{text(props.value) ?? "R$ 0,00"}</p>{text(props.detail) && <p className="mt-1 text-xs text-white/70">{text(props.detail)}</p>}<div className="mt-5 flex h-9 items-end justify-end gap-1.5 opacity-70">{[18, 28, 22, 36, 44].map((height, index) => <span key={index} className="w-3 rounded-t bg-white" style={{ height }} />)}</div></section>;
}

export default function MobilePresetBlock({ blockId, type, props, accent, onNavigate }: Props) {
  const variant = text(props.variant)?.toLowerCase();
  if (!variant) return null;
  if (type === "hero" && variant === "promo_banner") return <PromoBanner props={props} accent={accent} onNavigate={onNavigate} />;
  if (type === "cards" && variant === "quick_actions") return <QuickActions props={props} accent={accent} onNavigate={onNavigate} />;
  if (type === "cards" && variant === "product_grid") return <ProductGrid props={props} accent={accent} onNavigate={onNavigate} />;
  if (type === "cards" && variant === "product_detail") return <ProductDetail props={props} accent={accent} />;
  if (type === "list" && variant === "history") return <HistoryList props={props} accent={accent} onNavigate={onNavigate} />;
  if (type === "list" && variant === "notifications") return <NotificationsList props={props} accent={accent} />;
  if (type === "list" && variant === "profile_fields") return <ProfileFields props={props} accent={accent} onNavigate={onNavigate} />;
  if (type === "list" && variant === "menu") return <MenuList props={props} accent={accent} onNavigate={onNavigate} />;
  if (type === "list" && variant === "stores") return <StoresList props={props} accent={accent} onNavigate={onNavigate} />;
  if (type === "callout" && variant === "empty_state") return <EmptyState props={props} accent={accent} onNavigate={onNavigate} />;
  if (type === "metrics" && variant === "savings") return <SavingsMetric props={props} accent={accent} />;
  void blockId;
  return null;
}
