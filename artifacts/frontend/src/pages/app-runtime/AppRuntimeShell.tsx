import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Loader2, LogOut, Mail, Menu, RefreshCw, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import SchemaRuntimeRenderer, { type RuntimePayload } from "./SchemaRuntimeRenderer";

type JsonObject = Record<string, unknown>;

type RuntimeManifest = {
  manifestVersion: number;
  appInstanceId: string;
  publishedVersionId: string;
  publishedVersion: number;
  publishedAt?: string | null;
  app?: JsonObject;
  template?: { versionId?: string; version?: number; definition?: JsonObject };
  capabilities?: {
    publicContent?: boolean;
    auth?: { enabled?: boolean; methods?: string[] };
  };
};

type RuntimeSession = {
  user: {
    id: string;
    displayName: string;
    email?: string | null;
    phone?: string | null;
    locale?: string | null;
  };
  membership: {
    id: string;
    roleKey: string;
    permissions: string[];
  };
};

type VerifyResponse = RuntimeSession & { token: string };
type Props = { appId: string };
type Stage = "email" | "code";

const COPY = {
  pt: {
    loading: "Carregando aplicativo...",
    unavailable: "Aplicativo indisponível",
    unavailableBody: "Este aplicativo não está publicado ou não permite acesso neste endereço.",
    access: "Acessar aplicativo",
    emailHelp: "Digite seu e-mail para receber um código de acesso.",
    email: "E-mail",
    emailPlaceholder: "voce@empresa.com",
    send: "Enviar código",
    sending: "Enviando...",
    codeTitle: "Digite o código",
    codeHelp: "Enviamos um código de 6 dígitos para",
    code: "Código de acesso",
    verify: "Entrar",
    verifying: "Validando...",
    changeEmail: "Usar outro e-mail",
    genericCode: "Se a conta tiver acesso a este app, o código será enviado.",
    invalid: "Código inválido ou expirado.",
    requestError: "Não foi possível solicitar o código.",
    secure: "Acesso protegido pela identidade do aplicativo.",
    logout: "Sair",
    publicOnlyBody: "Este aplicativo está disponível publicamente e não exige login nesta versão.",
    modules: "Navegação",
    moduleReady: "disponível no aplicativo",
    runtimeError: "Não foi possível carregar o conteúdo deste perfil.",
    retry: "Tentar novamente",
    openProfile: "Abrir perfil",
    openMenu: "Abrir menu",
  },
  es: {
    loading: "Cargando aplicación...",
    unavailable: "Aplicación no disponible",
    unavailableBody: "Esta aplicación no está publicada o no permite acceso en esta dirección.",
    access: "Acceder a la aplicación",
    emailHelp: "Ingresa tu correo para recibir un código de acceso.",
    email: "Correo electrónico",
    emailPlaceholder: "tu@empresa.com",
    send: "Enviar código",
    sending: "Enviando...",
    codeTitle: "Ingresa el código",
    codeHelp: "Enviamos un código de 6 dígitos a",
    code: "Código de acceso",
    verify: "Ingresar",
    verifying: "Validando...",
    changeEmail: "Usar otro correo",
    genericCode: "Si la cuenta tiene acceso a esta app, el código será enviado.",
    invalid: "Código inválido o vencido.",
    requestError: "No fue posible solicitar el código.",
    secure: "Acceso protegido por la identidad de la aplicación.",
    logout: "Salir",
    publicOnlyBody: "Esta aplicación está disponible públicamente y no requiere inicio de sesión en esta versión.",
    modules: "Navegación",
    moduleReady: "disponible en la aplicación",
    runtimeError: "No fue posible cargar el contenido de este perfil.",
    retry: "Intentar nuevamente",
    openProfile: "Abrir perfil",
    openMenu: "Abrir menú",
  },
} as const;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function storageKey(appId: string) {
  return `vendorai:app-user-session:${appId}`;
}

function navigationItems(value: unknown): Array<{ key: string; label: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as JsonObject;
    const label = stringValue(row.label) ?? stringValue(row.title) ?? stringValue(row.name);
    if (!label) return [];
    const key = stringValue(row.key) ?? stringValue(row.id) ?? stringValue(row.route) ?? `item-${index + 1}`;
    return [{ key, label }];
  });
}

function appIdentity(manifest: RuntimeManifest | null) {
  const app = asObject(manifest?.app);
  const whiteLabel = asObject(app.whiteLabel);
  const theme = asObject(app.theme);
  return {
    name: stringValue(app.name) ?? "Aplicativo",
    logoUrl: stringValue(whiteLabel.logoUrl) ?? stringValue(whiteLabel.logo) ?? stringValue(whiteLabel.iconUrl) ?? stringValue(whiteLabel.appIcon) ?? null,
    primary: stringValue(theme.primaryColor) ?? stringValue(theme.primary) ?? stringValue(whiteLabel.primaryColor) ?? null,
    navigation: navigationItems(app.navigation),
  };
}

function RuntimeSkeleton() {
  return <div className="space-y-4" aria-label="Carregando conteúdo">
    <div className="h-40 animate-pulse rounded-3xl bg-slate-200/70" />
    <div className="grid grid-cols-2 gap-3"><div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" /><div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" /></div>
    <div className="grid grid-cols-2 gap-3"><div className="h-52 animate-pulse rounded-2xl bg-slate-200/70" /><div className="h-52 animate-pulse rounded-2xl bg-slate-200/70" /></div>
  </div>;
}

export default function AppRuntimeShell({ appId }: Props) {
  const lang: "pt" | "es" = typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("es") ? "es" : "pt";
  const copy = COPY[lang];
  const [manifest, setManifest] = useState<RuntimeManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [session, setSession] = useState<RuntimeSession | null>(null);
  const [runtimeToken, setRuntimeToken] = useState<string | null>(null);
  const [sessionChecking, setSessionChecking] = useState(false);
  const [runtimePayload, setRuntimePayload] = useState<RuntimePayload | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeError, setRuntimeError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [runtimeReloadKey, setRuntimeReloadKey] = useState(0);

  const identity = useMemo(() => appIdentity(manifest), [manifest]);
  const authEnabled = manifest?.capabilities?.auth?.enabled === true && (manifest.capabilities.auth.methods ?? []).includes("email_code");
  const publicContent = manifest?.capabilities?.publicContent === true;

  const clearSession = useCallback(() => {
    localStorage.removeItem(storageKey(appId));
    setSession(null);
    setRuntimeToken(null);
    setRuntimePayload(null);
    setRuntimeError(false);
  }, [appId]);

  const validateSession = useCallback(async (token: string) => {
    setSessionChecking(true);
    try {
      const response = await fetch(`/api/app-runtime/apps/${encodeURIComponent(appId)}/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("invalid_session");
      const current = await response.json() as RuntimeSession;
      setSession(current);
      setRuntimeToken(token);
      setMessage(null);
    } catch {
      clearSession();
    } finally {
      setSessionChecking(false);
    }
  }, [appId, clearSession]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setManifestLoading(true);
      try {
        const response = await fetch(`/api/app-runtime/apps/${encodeURIComponent(appId)}/manifest`, { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("not_found");
        const payload = await response.json() as RuntimeManifest;
        if (!alive) return;
        setManifest(payload);
        setNotFound(false);
        const saved = localStorage.getItem(storageKey(appId));
        if (saved) void validateSession(saved);
      } catch {
        if (!alive) return;
        setNotFound(true);
        setManifest(null);
      } finally {
        if (alive) setManifestLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [appId, validateSession]);

  useEffect(() => {
    if (!session || !runtimeToken) {
      setRuntimePayload(null);
      return;
    }
    let alive = true;
    async function loadRuntime() {
      setRuntimeLoading(true);
      setRuntimeError(false);
      try {
        const response = await fetch(`/api/app-runtime/apps/${encodeURIComponent(appId)}/runtime`, {
          headers: { Authorization: `Bearer ${runtimeToken}`, Accept: "application/json" },
        });
        if (response.status === 401) {
          clearSession();
          return;
        }
        if (!response.ok) throw new Error("runtime_failed");
        const payload = await response.json() as RuntimePayload;
        if (alive) setRuntimePayload(payload);
      } catch {
        if (alive) setRuntimeError(true);
      } finally {
        if (alive) setRuntimeLoading(false);
      }
    }
    void loadRuntime();
    return () => { alive = false; };
  }, [appId, clearSession, runtimeReloadKey, runtimeToken, session]);

  useEffect(() => {
    if (!identity.primary) return;
    const previous = document.documentElement.style.getPropertyValue("--app-runtime-primary");
    document.documentElement.style.setProperty("--app-runtime-primary", identity.primary);
    return () => {
      if (previous) document.documentElement.style.setProperty("--app-runtime-primary", previous);
      else document.documentElement.style.removeProperty("--app-runtime-primary");
    };
  }, [identity.primary]);

  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/app-runtime/apps/${encodeURIComponent(appId)}/auth/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      if (!response.ok) throw new Error("request_failed");
      setEmail(normalized);
      setStage("code");
      setMessage(copy.genericCode);
    } catch {
      setMessage(copy.requestError);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/app-runtime/apps/${encodeURIComponent(appId)}/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      if (!response.ok) throw new Error("invalid_code");
      const payload = await response.json() as VerifyResponse;
      localStorage.setItem(storageKey(appId), payload.token);
      setSession({ user: payload.user, membership: payload.membership });
      setRuntimeToken(payload.token);
      setCode("");
      setMessage(null);
    } catch {
      setMessage(copy.invalid);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearSession();
    setStage("email");
    setCode("");
    setMessage(null);
  }

  if (manifestLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-slate-500" /><p className="mt-3 text-sm text-slate-500">{copy.loading}</p></div></div>;
  }

  if (notFound || !manifest) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5"><div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm"><Smartphone className="mx-auto h-9 w-9 text-slate-400" /><h1 className="mt-4 text-xl font-semibold text-slate-900">{copy.unavailable}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{copy.unavailableBody}</p></div></div>;
  }

  const accentStyle = identity.primary ? { backgroundColor: identity.primary } : undefined;

  if (sessionChecking) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-7 w-7 animate-spin text-slate-500" /></div>;
  }

  if (authEnabled && !session) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 pb-8 sm:py-14" style={{ paddingTop: "max(2rem, env(safe-area-inset-top))" }}>
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 text-center">
            {identity.logoUrl ? <img src={identity.logoUrl} alt="" className="mx-auto h-14 max-w-[180px] object-contain" /> : <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white"><Smartphone className="h-6 w-6" /></div>}
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-950">{identity.name}</h1>
          </div>
          <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
            {stage === "email" ? (
              <form onSubmit={requestCode} className="space-y-5">
                <div><div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-slate-700" /><h2 className="text-lg font-semibold text-slate-900">{copy.access}</h2></div><p className="mt-2 text-sm leading-6 text-slate-500">{copy.emailHelp}</p></div>
                <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{copy.email}</span><Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={copy.emailPlaceholder} className="h-11" required /></label>
                {message && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{message}</p>}
                <Button type="submit" className="h-11 w-full" style={accentStyle} disabled={busy}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{copy.sending}</> : <><Mail className="mr-2 h-4 w-4" />{copy.send}</>}</Button>
              </form>
            ) : (
              <form onSubmit={verifyCode} className="space-y-5">
                <div><div className="flex items-center gap-2"><Mail className="h-5 w-5 text-slate-700" /><h2 className="text-lg font-semibold text-slate-900">{copy.codeTitle}</h2></div><p className="mt-2 text-sm leading-6 text-slate-500">{copy.codeHelp} <strong className="text-slate-800">{email}</strong>.</p></div>
                <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{copy.code}</span><Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="h-12 text-center font-mono text-xl tracking-[0.35em]" required /></label>
                {message && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{message}</p>}
                <Button type="submit" className="h-11 w-full" style={accentStyle} disabled={busy || code.length !== 6}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{copy.verifying}</> : copy.verify}</Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => { setStage("email"); setCode(""); setMessage(null); }}>{copy.changeEmail}</Button>
              </form>
            )}
          </div>
          <p className="mt-5 text-center text-xs text-slate-400"><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />{copy.secure}</p>
        </div>
      </div>
    );
  }

  if (!authEnabled && !session) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-10" style={{ paddingTop: "max(2rem, env(safe-area-inset-top))" }}>
        <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-6 shadow-sm sm:p-9">
          <div className="flex items-center gap-4">{identity.logoUrl ? <img src={identity.logoUrl} alt="" className="h-12 w-12 rounded-xl object-contain" /> : <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white"><Smartphone className="h-5 w-5" /></div>}<div><h1 className="text-xl font-bold text-slate-950">{identity.name}</h1><p className="mt-1 text-sm text-slate-500">{copy.publicOnlyBody}</p></div></div>
          {publicContent && identity.navigation.length > 0 && <div className="mt-7"><p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{copy.modules}</p><div className="grid gap-3 sm:grid-cols-2">{identity.navigation.map((item) => <div key={item.key} className="rounded-xl border p-4"><p className="text-sm font-semibold text-slate-800">{item.label}</p><p className="mt-1 text-xs text-slate-400">{copy.moduleReady}</p></div>)}</div></div>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto hidden h-16 max-w-6xl items-center gap-3 px-6 sm:flex">
          {identity.logoUrl ? <img src={identity.logoUrl} alt="" className="h-9 max-w-[150px] object-contain" /> : <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white"><Smartphone className="h-4 w-4" /></div>}
          <span className="truncate text-sm font-semibold text-slate-900">{identity.name}</span>
          <div className="ml-auto flex items-center gap-3"><div className="text-right"><p className="max-w-[220px] truncate text-sm font-medium text-slate-700">{session?.user.displayName || identity.name}</p>{session?.user.email && <p className="max-w-[220px] truncate text-[11px] text-slate-400">{session.user.email}</p>}</div><Button size="sm" variant="ghost" onClick={logout}><LogOut className="mr-1.5 h-4 w-4" />{copy.logout}</Button></div>
        </div>
        <div className="grid h-16 grid-cols-[48px_1fr_48px] items-center px-3 sm:hidden">
          <button type="button" onClick={() => setMenuOpen((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100" aria-label={copy.openProfile}><UserRound className="h-6 w-6" /></button>
          <div className="flex min-w-0 items-center justify-center">{identity.logoUrl ? <img src={identity.logoUrl} alt={identity.name} className="h-9 max-w-[150px] object-contain" /> : <span className="truncate text-sm font-bold text-slate-900">{identity.name}</span>}</div>
          <button type="button" onClick={() => setMenuOpen((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100" aria-label={copy.openMenu}><Menu className="h-5 w-5" /></button>
        </div>
        {menuOpen && <div className="border-t bg-white px-4 py-4 shadow-sm sm:hidden"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100"><UserRound className="h-5 w-5 text-slate-500" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{session?.user.displayName || identity.name}</p>{session?.user.email && <p className="truncate text-xs text-slate-400">{session.user.email}</p>}</div></div><Button size="sm" variant="ghost" className="mt-3 w-full justify-start" onClick={logout}><LogOut className="mr-2 h-4 w-4" />{copy.logout}</Button></div>}
      </header>
      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
        <section className="min-w-0">
          {runtimeLoading && <RuntimeSkeleton />}
          {!runtimeLoading && runtimeError && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900"><p>{copy.runtimeError}</p><Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setRuntimeReloadKey((value) => value + 1)}><RefreshCw className="mr-2 h-4 w-4" />{copy.retry}</Button></div>}
          {!runtimeLoading && !runtimeError && runtimePayload && <SchemaRuntimeRenderer payload={runtimePayload} lang={lang} />}
        </section>
      </main>
    </div>
  );
}
