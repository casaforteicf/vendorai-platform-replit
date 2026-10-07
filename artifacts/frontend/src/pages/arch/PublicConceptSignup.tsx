import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { useRoute } from "wouter";

// Link público do pré-projeto: /projeto/:slug
// O cliente final se cadastra, vira lead no CRM do profissional e abre o editor só com o
// próprio pré-projeto (token com escopo "preprojeto").

const ConceptPlanner = lazy(() => import("./ConceptPlanner"));

type Session = { token: string; conceptId: string; tenantName: string };
type BrandProfile = {
  tenantName: string;
  slug: string;
  marketEnabled: boolean;
  embedEnabled: boolean;
  headline: string;
  subheadline: string;
  logoUrl: string | null;
  primaryColor: string;
  marketButtonLabel: string;
};
type PublicMarketProduct = {
  id: string;
  fornecedorTenantId: string;
  fornecedorNome: string;
  parceiroOrigem: boolean;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  preco: number | null;
  imagens: string[];
  acaoPrincipal: "comprar" | "cotar";
  protecaoComercial: string;
};
type Address = { cep: string; rua: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string };

const storageKey = (slug: string) => `arqdor_preprojeto:${slug}`;

function readSession(slug: string): Session | null {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    const payload = JSON.parse(atob(session.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload?.exp || payload.exp * 1000 < Date.now() + 60_000) return null;
    return session;
  } catch {
    return null;
  }
}

function PublicMarketPanel({ slug, profile, onClose }: { slug: string; profile: BrandProfile; onClose: () => void }) {
  const [products, setProducts] = useState<PublicMarketProduct[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (query = "") => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("busca", query.trim());
      const response = await fetch(`/api/public/arqdor/${encodeURIComponent(slug)}/market?${params.toString()}`);
      const body = await response.json().catch(() => ({}));
      setProducts(response.ok ? body.produtos ?? [] : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [slug]);

  return (
    <div className="fixed inset-0 z-[5000] bg-slate-950/50 p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: profile.primaryColor }}>{profile.tenantName}</p>
            <h2 className="text-xl font-bold text-slate-950">Produtos e soluções para o seu projeto</h2>
            <p className="text-xs text-slate-500">O Market respeita a atividade comercial do parceiro que trouxe você.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-sm font-semibold text-slate-700">Fechar</button>
        </div>
        <div className="flex gap-2 border-b p-4 sm:px-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void load(search); }}
            placeholder="Buscar cimento, esquadrias, piscina, móveis..."
            className="h-11 flex-1 rounded-xl border border-slate-300 px-3 outline-none focus:border-slate-500"
          />
          <button type="button" onClick={() => void load(search)} className="rounded-xl px-5 text-sm font-semibold text-white" style={{ backgroundColor: profile.primaryColor }}>
            Buscar
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="grid min-h-48 place-items-center text-sm text-slate-500">Buscando soluções…</div>
          ) : products.length === 0 ? (
            <div className="grid min-h-48 place-items-center text-center text-sm text-slate-500">Nenhum produto compatível encontrado nesta busca.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <article key={product.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="aspect-[16/10] bg-slate-100">
                    {product.imagens?.[0] ? <img src={product.imagens[0]} alt={product.nome} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-slate-400">Sem imagem</div>}
                  </div>
                  <div className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {product.parceiroOrigem && <span className="rounded-full px-2 py-1 text-[11px] font-bold text-white" style={{ backgroundColor: profile.primaryColor }}>Parceiro</span>}
                      {product.categoria && <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{product.categoria}</span>}
                    </div>
                    <h3 className="font-bold text-slate-950">{product.nome}</h3>
                    <p className="text-xs text-slate-500">{product.fornecedorNome}</p>
                    {product.descricao && <p className="line-clamp-2 text-sm text-slate-600">{product.descricao}</p>}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <span className="font-bold text-slate-950">{product.preco != null ? product.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Sob consulta"}</span>
                      <span className="text-xs font-semibold" style={{ color: profile.primaryColor }}>{product.acaoPrincipal === "comprar" ? "Disponível" : "Solicitar cotação"}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GuestEditor({ session, slug, profile }: { session: Session; slug: string; profile: BrandProfile }) {
  const [ready, setReady] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  useEffect(() => {
    // Chamadas do editor (/api/arch) vão com o acesso do cliente.
    const previous = window.fetch;
    window.fetch = (input, init = {}) => {
      try {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, window.location.origin);
        // Só as rotas do editor usam o acesso do cliente; sessão do sistema (se houver) fica intacta.
        if (url.origin === window.location.origin && url.pathname.startsWith("/api/arch/")) {
          const headers = new Headers(input instanceof Request ? input.headers : undefined);
          new Headers(init.headers).forEach((value, key) => headers.set(key, value));
          headers.set("Authorization", `Bearer ${session.token}`);
          return previous(input, { ...init, headers });
        }
      } catch {
        // segue com a chamada original
      }
      return previous(input, init);
    };
    const params = new URLSearchParams(window.location.search);
    if (params.get("id") !== session.conceptId) {
      window.history.replaceState(null, "", `${window.location.pathname}?id=${encodeURIComponent(session.conceptId)}`);
    }
    setReady(true);
    return () => { window.fetch = previous; };
  }, [session]);

  if (!ready) return null;
  return (
    <>
      <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-slate-500">Abrindo seu projeto…</div>}>
        <ConceptPlanner guestMode guestBrand={session.tenantName} />
      </Suspense>
      {profile.marketEnabled && (
        <button
          type="button"
          onClick={() => setMarketOpen(true)}
          className="fixed bottom-5 right-5 z-[4500] rounded-full px-5 py-3 text-sm font-bold text-white shadow-xl"
          style={{ backgroundColor: profile.primaryColor }}
        >
          {profile.marketButtonLabel}
        </button>
      )}
      {marketOpen && <PublicMarketPanel slug={slug} profile={profile} onClose={() => setMarketOpen(false)} />}
    </>
  );
}

const emptyAddress: Address = { cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" };

export default function PublicConceptSignup() {
  const [, params] = useRoute("/projeto/:slug");
  const slug = params?.slug ?? "";
  const [brand, setBrand] = useState<string | null>(null);
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [session, setSession] = useState<Session | null>(() => (slug ? readSession(slug) : null));
  const [form, setForm] = useState({ nome: "", telefone: "", email: "", instagram: "", site: "" });
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [aceite, setAceite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetch(`/api/public/arqdor/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) { setStatus("unavailable"); return; }
        const body = await response.json();
        setBrand(body.tenantName ?? null);
        setProfile({
          tenantName: body.tenantName ?? "",
          slug: body.slug ?? slug,
          marketEnabled: Boolean(body.marketEnabled),
          embedEnabled: body.embedEnabled !== false,
          headline: body.headline ?? "Projete a sua casa",
          subheadline: body.subheadline ?? "Crie seu pré-projeto e avance para soluções compatíveis com sua necessidade.",
          logoUrl: body.logoUrl ?? null,
          primaryColor: /^#[0-9a-fA-F]{6}$/.test(body.primaryColor ?? "") ? body.primaryColor : "#f97316",
          marketButtonLabel: body.marketButtonLabel ?? "Ver produtos e soluções",
        });
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) setStatus("unavailable"); });
    return () => { cancelled = true; };
  }, [slug]);

  const lookupCep = async (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (data?.erro) return;
      setAddress((prev) => ({
        ...prev,
        rua: prev.rua || data.logradouro || "",
        bairro: prev.bairro || data.bairro || "",
        cidade: prev.cidade || data.localidade || "",
        uf: prev.uf || data.uf || "",
      }));
    } catch {
      // CEP manual
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!aceite) { setError("Aceite o uso dos dados para continuar."); return; }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/public/arqdor/${encodeURIComponent(slug)}/cadastro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          endereco: address,
          aceite,
          originCampaignId: new URLSearchParams(window.location.search).get("campaign")
            ?? new URLSearchParams(window.location.search).get("utm_campaign")
            ?? null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error ?? "Não foi possível concluir o cadastro."); return; }
      const next: Session = { token: body.token, conceptId: body.conceptId, tenantName: body.tenantName ?? brand ?? "" };
      localStorage.setItem(storageKey(slug), JSON.stringify(next));
      setSession(next);
    } catch {
      setError("Sem conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (session && profile) return <GuestEditor session={session} slug={slug} profile={profile} />;

  const input = "mt-1 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-orange-400";
  const label = "block text-sm font-semibold text-slate-800";

  if (status === "loading") return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Carregando…</div>;
  if (status === "unavailable") {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Link indisponível</h1>
          <p className="mt-2 text-sm text-slate-600">Este link de pré-projeto não está ativo. Fale com o profissional que enviou.</p>
        </div>
      </div>
    );
  }

  const embed = new URLSearchParams(window.location.search).get("embed") === "1";
  const primaryColor = profile?.primaryColor ?? "#f97316";

  return (
    <div className={embed ? "min-h-screen bg-transparent px-1 py-1" : "min-h-screen bg-slate-50 px-4 py-8"}>
      <form onSubmit={submit} className={embed ? "mx-auto max-w-lg rounded-2xl bg-white p-5" : "mx-auto max-w-lg rounded-3xl bg-white p-6 shadow-xl"}>
        {profile?.logoUrl && <img src={profile.logoUrl} alt={brand ?? "Parceiro"} className="mb-4 max-h-14 max-w-[180px] object-contain" />}
        <div className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: primaryColor }}>{brand}</div>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">{profile?.headline ?? "Projete a sua casa"}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {profile?.subheadline ?? "Faça seu cadastro para desenhar a planta, ver a fachada e enviar o pré-projeto ao profissional."}
        </p>

        <div className="mt-5 space-y-3">
          <label className={label}>Nome completo *
            <input className={input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoComplete="name" required />
          </label>
          <label className={label}>WhatsApp (com DDD) *
            <input className={input} type="tel" inputMode="tel" placeholder="(49) 99999-9999" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} autoComplete="tel" required />
          </label>
          <label className={label}>E-mail *
            <input className={input} type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required />
          </label>
          <label className={label}>Instagram *
            <div className="mt-1 flex h-12 items-center rounded-xl border border-slate-300 bg-white px-3 focus-within:border-orange-400">
              <span className="text-base text-slate-400">@</span>
              <input className="h-full w-full bg-transparent pl-0.5 text-base outline-none" autoCapitalize="none" autoCorrect="off" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value.replace(/^@+/, "") })} required />
            </div>
          </label>

          <div className="pt-2 text-sm font-bold text-slate-900">Endereço</div>
          <div className="grid grid-cols-3 gap-3">
            <label className={`${label} col-span-1`}>CEP *
              <input className={input} inputMode="numeric" value={address.cep} onChange={(e) => setAddress({ ...address, cep: e.target.value })} onBlur={(e) => void lookupCep(e.target.value)} autoComplete="postal-code" required />
            </label>
            <label className={`${label} col-span-2`}>Cidade *
              <input className={input} value={address.cidade} onChange={(e) => setAddress({ ...address, cidade: e.target.value })} autoComplete="address-level2" required />
            </label>
          </div>
          <label className={label}>Rua *
            <input className={input} value={address.rua} onChange={(e) => setAddress({ ...address, rua: e.target.value })} autoComplete="address-line1" required />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className={label}>Número *
              <input className={input} value={address.numero} onChange={(e) => setAddress({ ...address, numero: e.target.value })} required />
            </label>
            <label className={`${label} col-span-2`}>Complemento
              <input className={input} value={address.complemento} onChange={(e) => setAddress({ ...address, complemento: e.target.value })} autoComplete="address-line2" />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className={`${label} col-span-2`}>Bairro *
              <input className={input} value={address.bairro} onChange={(e) => setAddress({ ...address, bairro: e.target.value })} required />
            </label>
            <label className={label}>UF *
              <input className={input} maxLength={2} value={address.uf} onChange={(e) => setAddress({ ...address, uf: e.target.value.toUpperCase() })} autoComplete="address-level1" required />
            </label>
          </div>

          {/* armadilha para robôs: invisível para pessoas */}
          <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />

          <label className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-orange-500" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            <span>Autorizo {brand ?? "o profissional"} a usar meus dados para contato sobre este projeto, conforme a LGPD.</span>
          </label>
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

        <button type="submit" disabled={submitting} className="mt-5 h-12 w-full rounded-xl text-base font-semibold text-white disabled:opacity-60" style={{ backgroundColor: primaryColor }}>
          {submitting ? "Criando seu acesso…" : "Começar meu projeto"}
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">Já se cadastrou? Use o mesmo e-mail e WhatsApp para continuar de onde parou.</p>
      </form>
    </div>
  );
}
