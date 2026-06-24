import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useGetMe, getGetMeQueryKey, User } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User, options?: { isDemo?: boolean }) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "vendorai_token";
const DEMO_SESSION_KEY = "vendorai_demo_session";
const DEMO_EXPIRES_KEY = "vendorai_demo_expires_at";
const DEMO_EMAIL = "demo@demo.com";

// Reads the email claim from a JWT without verifying it (the server still
// validates the token on every request — this is only used to decide UI flow).
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

// Demo logins are "try-it" sessions: they should not survive reopening the app.
// We keep the token in localStorage (so existing API calls keep working) and
// drop a per-tab marker in sessionStorage. On a fresh open the marker is gone,
// so a demo token (identified from its JWT email) is cleared and the user lands
// back on the login page. Real logins persist as before. Detecting demo from
// the token itself also clears legacy sticky demo sessions from before this fix.
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readInitialToken);
  const [user, setUser] = useState<User | null>(null);
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
      setUser(meData);
      if (meData.forcePasswordReset) {
        setLocation("/trocar-senha");
      }
    }
  }, [meData]);

  useEffect(() => {
    if (isError) {
      logout();
    }
  }, [isError]);

  const login = (newToken: string, newUser: User, options?: { isDemo?: boolean }) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    if (options?.isDemo) {
      sessionStorage.setItem(DEMO_SESSION_KEY, "active");
    } else {
      sessionStorage.removeItem(DEMO_SESSION_KEY);
    }
    setToken(newToken);
    setUser(newUser);
    if (newUser.forcePasswordReset) {
      setLocation("/trocar-senha");
    } else {
      setLocation(newUser.platformRole === "partner" ? "/partner" : "/");
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEMO_EXPIRES_KEY);
    sessionStorage.removeItem(DEMO_SESSION_KEY);
    setToken(null);
    setUser(null);
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading: isLoading && !!token }}>
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
