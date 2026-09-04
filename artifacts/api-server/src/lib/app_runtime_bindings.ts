type JsonObject = Record<string, unknown>;

export type AppRuntimeBindingContext = {
  "viewer.name": string;
  "viewer.email": string;
  "viewer.phone": string;
  "viewer.locale": string;
  "viewer.role": string;
  "app.name": string;
};

const BINDABLE_KEYS = new Set([
  "title",
  "subtitle",
  "body",
  "label",
  "value",
  "detail",
  "badge",
  "eyebrow",
]);

const TOKEN_PATTERN = /\{\{\s*(viewer\.name|viewer\.email|viewer\.phone|viewer\.locale|viewer\.role|app\.name)\s*\}\}/g;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

export function bindRuntimeText(value: string, bindings: AppRuntimeBindingContext): string {
  return value.replace(TOKEN_PATTERN, (_match, token: keyof AppRuntimeBindingContext) => bindings[token] ?? "");
}

export function applyRuntimeBindings(value: unknown, bindings: AppRuntimeBindingContext, key?: string): unknown {
  if (typeof value === "string") {
    return key && BINDABLE_KEYS.has(key) ? bindRuntimeText(value, bindings) : value;
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
