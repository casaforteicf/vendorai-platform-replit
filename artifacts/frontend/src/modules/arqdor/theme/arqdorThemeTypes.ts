export type ArqdorThemeMode = "light" | "dark" | "system";
export type ResolvedArqdorTheme = "light" | "dark";

export type ArqdorAccent =
  | "violet"
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "slate";

export type ArqdorThemePreference = {
  mode: ArqdorThemeMode;
  accent: ArqdorAccent;
  useDarkRenderWorkspace: boolean;
  updatedAt?: string | null;
};

export type ArqdorThemeContextValue = {
  preference: ArqdorThemePreference;
  resolvedTheme: ResolvedArqdorTheme;
  setMode: (mode: ArqdorThemeMode) => void;
  setAccent: (accent: ArqdorAccent) => void;
  toggleTheme: () => void;
  setUseDarkRenderWorkspace: (enabled: boolean) => void;
  savePreference: () => Promise<void>;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

export type ThemeTokenGroup = {
  name: string;
  description: string;
  tokens: Array<{
    token: string;
    light: string;
    dark: string;
    usage: string;
  }>;
};
