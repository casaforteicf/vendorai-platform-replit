import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const TOKEN_KEY = "vendorai_token";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  isActive: boolean;
}

interface AuthContextValue {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  saveToken: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const tokenRef = { current: null as string | null };

setAuthTokenGetter(() => tokenRef.current);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(TOKEN_KEY);
        const storedUser = await AsyncStorage.getItem("vendorai_user");
        if (stored) {
          tokenRef.current = stored;
          setToken(stored);
        }
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const saveToken = useCallback(async (t: string, u: User) => {
    tokenRef.current = t;
    setToken(t);
    setUser(u);
    await AsyncStorage.setItem(TOKEN_KEY, t);
    await AsyncStorage.setItem("vendorai_user", JSON.stringify(u));
  }, []);

  const logout = useCallback(async () => {
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem("vendorai_user");
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, isLoading, saveToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
