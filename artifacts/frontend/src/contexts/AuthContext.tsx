import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import {
  useGetMe,
  getGetMeQueryKey,
  useGetTenant,
  getGetTenantQueryKey,
  User,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { getStoredLocalePreference, resolveLocale, useI18n } from "@/i18n";

const OVERRIDE_KEY = "vendorai_sa_tenant_override";

export interface TenantOverride {
  id: string;
  name: string;
  vertical: string;
  /** Super Admin layout preview without a persisted tenant. */
  preview?: boolean;
  /** Marca do programa (ex: Arqdor) aplicada só durante o preview — não
   * existe tenant real por trás pra buscar isso via API. */
  corPrimaria?: string | null;
  logoUrl?: string | null;
}

interface AuthContextType {
  user: User | null;
  rawUser: User | null;
  token: string | null;
  login: (token: string, user: User, options?: { isDemo?: boolean }) => void;
  logout: () => void;
  isLoading: boolean;
  tenantOverride: TenantOverride | null;
  setTenantOverride: (t: TenantOverride) => void;
  clearTenantOverride: () => void;
  /** true for super_admin, tenant_admin, or userFunction === "administrador" */
  isEffectiveAdmin: boolean;
}

export const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "vendorai_token";
const USER_CACHE_KEY = "vendorai_user_cache";
const DEMO_SESSION_KEY = "vendorai_demo_session";
const DEMO_EXPIRES_KEY = "vendorai_demo_expires_at";
const DEMO_EMAIL = "demo@demo.com";
const TRANSIENT_SESSION_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function decodeTokenEmail(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded));
    return typeof payload?.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

function decodeTokenClaims(token: string): { sub: string; tenantId: string; platformRole: string; role?: string; userFunction?: string } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const claims = JSON.parse(atob(padded));
    if (typeof claims.sub !== "string" || typeof claims.tenantId !== "string" || typeof claims.platformRole !== "string") return null;
    return claims;
  } catch {
    return null;
  }
}

function isDemoToken(token: string): boolean {
  return decodeTokenEmail(token) === DEMO_EMAIL;
}

function readInitialToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const sameSession = sessionStorage.getItem(DEMO_SESSION_KEY) === "active";
  if (isDemoToken(token) && !sameSession) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_CACHE_KEY);
    localStorage.removeItem(DEMO_EXPIRES_KEY);
    return null;
  }
  return token;
}

function readCachedUser(token: string | null): User | null {
  if (!token) return null;

  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw) as User;
    const tokenEmail = decodeTokenEmail(token);
    const claims = decodeTokenClaims(token);
    // A previous session can belong to another tenant even if the email matches.
    // Never mount tenant-scoped screens using an identity from a different JWT.
    if (!claims || cached?.id !== claims.sub || cached?.tenantId !== claims.tenantId ||
        cached?.platformRole !== claims.platformRole || cached?.email !== tokenEmail) {
      localStorage.removeItem(USER_CACHE_KEY);
      return null;
    }

    return cached;
  } catch {
    localStorage.removeItem(USER_CACHE_KEY);
    return null;
  }
}

function persistCachedUser(user: User | null) {
  if (user) {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_CACHE_KEY);
  }
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function readInitialOverride(): TenantOverride | null {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    return raw ? (JSON.parse(raw) as TenantOverride) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readInitialToken);
  const [rawUser, setRawUser] = useState<User | null>(() => readCachedUser(readInitialToken()));
  const [tenantOverride, setTenantOverrideState] = useState<TenantOverride | null>(readInitialOverride);
  const [sessionRecoveryError, setSessionRecoveryError] = useState<string | null>(null);
  const [location, setLocation] = useLocation();
  const passwordRedirectedUserRef = useRef<string | null>(null);
  const { locale, syncLocale } = useI18n();

  // Some feature screens still use native fetch() instead of the generated API
  // client. Ensure all same-origin /api requests inherit the current session token
  // unless the caller already provided an Authorization header. Signed/external
  // upload URLs are intentionally left untouched.
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const authenticatedFetch: typeof window.fetch = async (input, init = {}) => {
      try {
        const requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const url = new URL(requestUrl, window.location.origin);

        if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
          const headers = new Headers(input instanceof Request ? input.headers : undefined);
          new Headers(init.headers).forEach((value, key) => headers.set(key, value));

          if (!headers.has("Authorization")) {
            const currentToken = localStorage.getItem(TOKEN_KEY);
            if (currentToken) {
              headers.set("Authorization", `Bearer ${currentToken}`);
            }
          }

          return originalFetch(input, { ...init, headers });
        }
      } catch {
        // Preserve the original request behavior if URL/header normalization fails.
      }

      return originalFetch(input, init);
    };

    window.fetch = authenticatedFetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const {
    data: meData,
    isLoading,
    isError,
    error: meError,
  } = useGetMe({
    query: {
      enabled: !!token,
      // Isolate /auth/me data for each JWT; a previous account must never
       // overwrite the user who just logged in.
       queryKey: [...getGetMeQueryKey(), token?.split(".")[2] ?? "anonymous"],
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = getErrorStatus(error);
        return failureCount < 2 && status !== null && TRANSIENT_SESSION_STATUSES.has(status);
      },
      retryDelay: (attemptIndex) => Math.min(750 * 2 ** attemptIndex, 3_000),
    }
  });

  useEffect(() => {
    if (!token || !meData) return;

    const claims = decodeTokenClaims(token);
    if (!claims) return;

    const tokenIsStale =
      claims.sub !== meData.id ||
      claims.tenantId !== meData.tenantId ||
      claims.platformRole !== meData.platformRole ||
      (claims.role ?? null) !== (meData.role ?? null) ||
      (claims.userFunction ?? null) !== (meData.userFunction ?? null);

    if (!tokenIsStale) return;

    let cancelled = false;

    setSessionRecoveryError(null);
    void fetch("/api/auth/refresh", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Session refresh failed: ${response.status}`);
        return response.json() as Promise<{ token?: string; user?: User }>;
      })
      .then((refreshed) => {
        if (cancelled || !refreshed.token) return;
        localStorage.setItem(TOKEN_KEY, refreshed.token);
        setToken(refreshed.token);
        const nextUser = refreshed.user ?? meData;
        setRawUser(nextUser);
        persistCachedUser(nextUser);
      })
      .catch(() => {
        // /auth/me já provou que a sessão atual é válida. Se a renovação
        // transitória falhar, preservamos a sessão e tentamos novamente
        // no próximo carregamento em vez de derrubar o usuário.
      });

    return () => {
      cancelled = true;
    };
  }, [token, meData?.id, meData?.tenantId, meData?.platformRole, meData?.role, meData?.userFunction]);

  useEffect(() => {
    if (meData) {
      setRawUser(meData);
      persistCachedUser(meData);
      const isPasswordRoute = location === "/trocar-senha" || location.endsWith("/trocar-senha");
      if (meData.forcePasswordReset && !isPasswordRoute) {
        passwordRedirectedUserRef.current = meData.id;
        setLocation("/trocar-senha", { replace: true });
      } else if (!meData.forcePasswordReset) {
        passwordRedirectedUserRef.current = null;
      }
      if (meData.platformRole !== "super_admin") {
        setTenantOverrideState(null);
        localStorage.removeItem(OVERRIDE_KEY);
      }
    }
  }, [meData, location, setLocation]);

  useEffect(() => {
    if (!isError || !token) return;

    // Um único 401 no bootstrap de /auth/me não é prova suficiente para apagar
    // a sessão. Em produção o primeiro request pode atravessar uma troca de
    // bundle/proxy antes de todos os interceptors estarem estabilizados. Como o
    // cache local já contém uma identidade assinada pelo JWT, fazemos uma
    // confirmação explícita no backend e só encerramos a sessão se o próprio
    // /auth/refresh também confirmar 401.
    if (getErrorStatus(meError) !== 401) return;

    let cancelled = false;

    void fetch("/api/auth/refresh", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    })
      .then(async (response) => {
        if (cancelled) return;

        if (response.ok) {
          const refreshed = await response.json() as { token?: string; user?: User };
          if (cancelled) return;
          if (refreshed.token) {
            localStorage.setItem(TOKEN_KEY, refreshed.token);
            setToken(refreshed.token);
          }
          if (refreshed.user) {
            setRawUser(refreshed.user);
            persistCachedUser(refreshed.user);
          }
          return;
        }

        // Só uma confirmação independente de token inválido encerra a sessão.
        if (response.status === 401) {
          logout();
        }
      })
      .catch(() => {
        // Preserva a sessão local, mas informa o usuário que a confirmação
        // automática falhou em vez de esconder o erro de recuperação.
        setSessionRecoveryError("Não foi possível confirmar sua sessão agora. Você pode continuar usando o sistema; tentaremos novamente automaticamente.");
      });

    return () => {
      cancelled = true;
    };
  }, [isError, meError, token]);

  const effectiveUser: User | null = rawUser
    ? rawUser.platformRole === "super_admin" && tenantOverride
      ? { ...rawUser, tenantId: tenantOverride.id, tenantVertical: tenantOverride.vertical }
      : rawUser
    : null;

  // Pessoas & Vozes gera o QR a partir da URL atual. Manter o tenant efetivo
  // explicitamente na URL faz o celular carregar a empresa que iniciou a
  // captura, em vez de depender da conta que por acaso esteja aberta nele.
  // O reload acontece apenas quando o tenant muda ou quando a URL antiga ainda
  // não possuía esse contexto, garantindo que o useMemo do QR nasça correto.
  useEffect(() => {
    if (!effectiveUser?.tenantId) return;
    const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
    if (normalizedPath !== "/content-studio/video/avatar") return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("tenant") === effectiveUser.tenantId) return;
    url.searchParams.set("tenant", effectiveUser.tenantId);
    window.location.replace(`${url.pathname}${url.search}${url.hash}`);
  }, [location, effectiveUser?.tenantId]);

  const shouldLoadLocaleTenant =
    !!token &&
    !!effectiveUser?.tenantId &&
    !(rawUser?.platformRole === "super_admin" && !tenantOverride);

  const { data: localeTenant } = useGetTenant(
    effectiveUser?.tenantId ?? "",
    {
      query: {
        enabled: shouldLoadLocaleTenant,
        queryKey: getGetTenantQueryKey(effectiveUser?.tenantId ?? ""),
        staleTime: 300_000,
        refetchOnWindowFocus: false,
      },
    }
  );

  useEffect(() => {
    if (!token || !effectiveUser) return;

    // Super admin fora do modo de visualização de um tenant mantém a preferência
    // local/navegador. Ao entrar em um tenant, passa a respeitar o perfil daquele tenant.
    if (rawUser?.platformRole === "super_admin" && !tenantOverride) {
      const storedPreference = getStoredLocalePreference();
      if (storedPreference && storedPreference !== locale) {
        syncLocale(storedPreference);
      }
      return;
    }

    if (shouldLoadLocaleTenant && !localeTenant) return;

    const tenantSettings = localeTenant as
      | { defaultLocale?: string | null; countryCode?: string | null }
      | undefined;
    const browserLocales =
      typeof navigator !== "undefined"
        ? navigator.languages?.length
          ? navigator.languages
          : [navigator.language]
        : [];
    const resolvedLocale = resolveLocale({
      userLocale: getStoredLocalePreference(),
      tenantLocale: tenantSettings?.defaultLocale,
      browserLocales,
      countryCode: tenantSettings?.countryCode,
    });

    if (resolvedLocale !== locale) {
      // Locale herdado do tenant não vira preferência manual. Assim, se o país/
      // locale do tenant mudar, o usuário sem override acompanha automaticamente.
      syncLocale(resolvedLocale);
    }
  }, [
    token,
    effectiveUser?.id,
    effectiveUser?.tenantId,
    rawUser?.platformRole,
    tenantOverride,
    localeTenant,
    locale,
    syncLocale,
    shouldLoadLocaleTenant,
  ]);

  const login = (newToken: string, newUser: User, options?: { isDemo?: boolean }) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    persistCachedUser(newUser);
    if (options?.isDemo) {
      sessionStorage.setItem(DEMO_SESSION_KEY, "active");
    } else {
      sessionStorage.removeItem(DEMO_SESSION_KEY);
    }
    setToken(newToken);
    setRawUser(newUser);
    if (newUser.platformRole !== "super_admin") {
      setTenantOverrideState(null);
      localStorage.removeItem(OVERRIDE_KEY);
    }
    if (newUser.forcePasswordReset) {
      passwordRedirectedUserRef.current = newUser.id;
      setLocation("/trocar-senha", { replace: true });
    } else {
      setLocation(newUser.platformRole === "partner" ? "/partner" : "/dashboard");
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_CACHE_KEY);
    localStorage.removeItem(DEMO_EXPIRES_KEY);
    localStorage.removeItem(OVERRIDE_KEY);
    localStorage.removeItem("arqdor_saved_prompt_variations");
    localStorage.removeItem("arqdor_prompt_variations_migrated");
    localStorage.removeItem("arqdor_pending_owner");
    sessionStorage.removeItem(DEMO_SESSION_KEY);
    setToken(null);
    setRawUser(null);
    passwordRedirectedUserRef.current = null;
    setTenantOverrideState(null);
    setLocation("/login");
  };

  const setTenantOverride = (t: TenantOverride) => {
    setTenantOverrideState(t);
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(t));
  };

  const clearTenantOverride = () => {
    setTenantOverrideState(null);
    localStorage.removeItem(OVERRIDE_KEY);
  };

  const isEffectiveAdmin =
    effectiveUser?.platformRole === "super_admin" ||
    effectiveUser?.platformRole === "tenant_admin" ||
    effectiveUser?.userFunction === "administrador";

  return (
    <AuthContext.Provider value={{
      user: effectiveUser,
      rawUser,
      token,
      login,
      logout,
      isLoading: isLoading && !!token && !rawUser,
      tenantOverride,
      setTenantOverride,
      clearTenantOverride,
      isEffectiveAdmin,
    }}>
      {sessionRecoveryError ? (
        <div
          role="status"
          className="fixed left-1/2 top-3 z-[100] w-[min(92vw,720px)] -translate-x-1/2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 shadow"
        >
          {sessionRecoveryError}
        </div>
      ) : null}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
