import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const TOKEN_KEY = "vendorai_token";
const USER_KEY = "vendorai_user";

async function readToken() {
  try {
    const secureToken = await SecureStore.getItemAsync(TOKEN_KEY);
    if (secureToken) return secureToken;
  } catch {
    // SecureStore is unavailable on some web previews.
  }

  const legacyToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (legacyToken) {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, legacyToken);
      await AsyncStorage.removeItem(TOKEN_KEY);
    } catch {
      // Keep the legacy token for web previews that do not support SecureStore.
    }
  }
  return legacyToken;
}

async function writeToken(token: string) {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  }
}

async function removeToken() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // SecureStore is unavailable on some web previews.
  }
  await AsyncStorage.removeItem(TOKEN_KEY);
}

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
        const stored = await readToken();
        const storedUser = await AsyncStorage.getItem(USER_KEY);
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
    await writeToken(t);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
  }, []);

  const logout = useCallback(async () => {
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    await removeToken();
    await AsyncStorage.removeItem(USER_KEY);
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
