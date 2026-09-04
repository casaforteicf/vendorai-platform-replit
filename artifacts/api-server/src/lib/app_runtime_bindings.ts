type JsonObject = Record<string, unknown>;

export type AppRuntimeBindingContext = Record<string, string>;

const BINDABLE_LIMITS: Record<string, number> = {
  title: 180,
  subtitle: 300,
  body: 6000,
  label: 120,
  value: 120,
  detail: 300,
  badge: 80,
  eyebrow: 100,
};

const TOKEN_PATTERN = /\{\{\s*((?:viewer|app|data)\.[A-Za-z0-9_.-]+)\s*\}\}/g;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

export function bindRuntimeText(
  value: string,
  bindings: AppRuntimeBindingContext,
  maxLength = 6000,
): string {
  return value
    .replace(TOKEN_PATTERN, (_match, token: string) => bindings[token] ?? "")
    .slice(0, maxLength);
}

export function applyRuntimeBindings(
  value: unknown,
  bindings: AppRuntimeBindingContext,
  key?: string,
): unknown {
  if (typeof value === "string") {
    const maxLength = key ? BINDABLE_LIMITS[key] : undefined;
    return maxLength ? bindRuntimeText(value, bindings, maxLength) : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => applyRuntimeBindings(item, bindings));
  }
  const object = asObject(value);
  if (!object) return value;
  return Object.fromEntries(
    Object.entries(object).map(([childKey, childValue]) => [
      childKey,
      applyRuntimeBindings(childValue, bindings, childKey),
    ]),
  );
}

export const APP_RUNTIME_BINDING_TOKENS = [
  "{{viewer.name}}",
  "{{viewer.email}}",
  "{{viewer.phone}}",
  "{{viewer.locale}}",
  "{{viewer.role}}",
  "{{app.name}}",
] as const;
