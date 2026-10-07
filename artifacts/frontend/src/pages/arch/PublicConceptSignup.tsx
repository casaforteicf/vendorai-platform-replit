import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { useRoute } from "wouter";

// Link público do pré-projeto: /projeto/:slug
// O cliente final se cadastra, vira lead no CRM do profissional e abre o editor só com o
// próprio pré-projeto (token com escopo "preprojeto").

const ConceptPlanner = lazy(() => import("./ConceptPlanner"));

type Session = { token: string; conceptId: string; tenantName: string };
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

function GuestEditor({ session }: { session: Session }) {
  const [ready, setReady] = useState(false);
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
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-slate-500">Abrindo seu projeto…</div>}>
      <ConceptPlanner guestMode guestBrand={session.tenantName} />
    </Suspense>
  );
}

const emptyAddress: Address = { cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" };

export default function PublicConceptSignup() {
  const [, params] = useRoute("/projeto/:slug");
  const slug = params?.slug ?? "";
  const [brand, setBrand] = useState<string | null>(null);
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
        body: JSON.stringify({ ...form, endereco: address, aceite }),
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

  if (session) return <GuestEditor session={session} />;

  const input = "mt-1 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-emerald-500";
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

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <form onSubmit={submit} className="mx-auto max-w-lg rounded-3xl bg-white p-6 shadow-xl">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-600">{brand}</div>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Transforme sua ideia em projeto</h1>
        <p className="mt-1 text-sm text-slate-600">
          Crie seu pré-projeto, visualize possibilidades e conecte a ideia ao profissional responsável. Leva poucos minutos.
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
            <div className="mt-1 flex h-12 items-center rounded-xl border border-slate-300 bg-white px-3 focus-within:border-emerald-500">
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
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-emerald-600" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            <span>Autorizo {brand ?? "o profissional"} a usar meus dados para contato sobre este projeto, conforme a LGPD.</span>
          </label>
        </div>

        {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

        <button type="submit" disabled={submitting} className="mt-5 h-12 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white disabled:opacity-60">
          {submitting ? "Criando seu acesso…" : "Começar meu projeto"}
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">Já se cadastrou? Use o mesmo e-mail e WhatsApp para continuar de onde parou.</p>
      </form>
    </div>
  );
}
