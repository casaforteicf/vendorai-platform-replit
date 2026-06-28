import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useGetMe, getGetMeQueryKey, User } from "@workspace/api-client-react";
import { useLocation } from "wouter";

const OVERRIDE_KEY = "vendorai_sa_tenant_override";

export interface TenantOverride {
  id: string;
  name: string;
  vertical: string;
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
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "vendorai_token";
const DEMO_SESSION_KEY = "vendorai_demo_session";
const DEMO_EXPIRES_KEY = "vendorai_demo_expires_at";
const DEMO_EMAIL = "demo@demo.com";

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

function isDemoToken(token: string): boolean {
  return decodeTokenEmail(token) === DEMO_EMAIL;
}

function readInitialToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const sameSession = sessionStorage.getItem(DEMO_SESSION_KEY) === "active";
  if (isDemoToken(token) && !sameSession) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEMO_EXPIRES_KEY);
    return null;
  }
  return token;
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
  const [rawUser, setRawUser] = useState<User | null>(null);
  const [tenantOverride, setTenantOverrideState] = useState<TenantOverride | null>(readInitialOverride);
  const [, setLocation] = useLocation();

  const { data: meData, isLoading, isError } = useGetMe({
    query: {
      enabled: !!token,
      queryKey: getGetMeQueryKey(),
      retry: false,
    }
  });

  useEffect(() => {
    if (meData) {
      setRawUser(meData);
      if (meData.forcePasswordReset) {
        setLocation("/trocar-senha");
      }
      if (meData.platformRole !== "super_admin") {
        setTenantOverrideState(null);
        localStorage.removeItem(OVERRIDE_KEY);
      }
    }
  }, [meData]);

  useEffect(() => {
    if (isError) {
      logout();
    }
  }, [isError]);

  const effectiveUser: User | null = rawUser
    ? rawUser.platformRole === "super_admin" && tenantOverride
      ? { ...rawUser, tenantId: tenantOverride.id, tenantVertical: tenantOverride.vertical }
      : rawUser
    : null;

  const login = (newToken: string, newUser: User, options?: { isDemo?: boolean }) => {
    localStorage.setItem(TOKEN_KEY, newToken);
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
      setLocation("/trocar-senha");
    } else {
      setLocation(newUser.platformRole === "partner" ? "/partner" : "/dashboard");
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEMO_EXPIRES_KEY);
    localStorage.removeItem(OVERRIDE_KEY);
    sessionStorage.removeItem(DEMO_SESSION_KEY);
    setToken(null);
    setRawUser(null);
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

  return (
    <AuthContext.Provider value={{
      user: effectiveUser,
      rawUser,
      token,
      login,
      logout,
      isLoading: isLoading && !!token,
      tenantOverride,
      setTenantOverride,
      clearTenantOverride,
    }}>
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
