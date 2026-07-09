import type { ArqdorThemePreference } from "./arqdorThemeTypes";
import { DEFAULT_ARQDOR_THEME } from "./arqdorThemeTokens";

function getAuthHeaders(): HeadersInit {
  const token =
    localStorage.getItem("vendorai_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("access_token") ||
    "";

  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

export async function fetchThemePreference(): Promise<ArqdorThemePreference> {
  try {
    const response = await fetch("/api/arch/theme-preference", {
      method: "GET",
      headers: getAuthHeaders(),
    });

    if (!response.ok) return DEFAULT_ARQDOR_THEME;

    const payload = await parseJson<any>(response);

    return {
      ...DEFAULT_ARQDOR_THEME,
      ...(payload?.preference || payload?.data || payload || {}),
    };
  } catch {
    return DEFAULT_ARQDOR_THEME;
  }
}

export async function saveThemePreference(preference: ArqdorThemePreference): Promise<ArqdorThemePreference> {
  try {
    const response = await fetch("/api/arch/theme-preference", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(preference),
    });

    if (!response.ok) return preference;

    const payload = await parseJson<any>(response);

    return {
      ...preference,
      ...(payload?.preference || payload?.data || payload || {}),
    };
  } catch {
    return preference;
  }
}
