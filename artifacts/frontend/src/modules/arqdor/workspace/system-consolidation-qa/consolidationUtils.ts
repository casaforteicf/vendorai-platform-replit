import type { ArqdorModule, EndpointHealth, ModuleHealth, ReleaseGateStatus } from "./consolidationTypes";

export function getAuthHeaders(): HeadersInit {
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("vendorai_token") ||
    "";

  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function healthClass(health: ModuleHealth) {
  const classes: Record<ModuleHealth, string> = {
    green: "bg-emerald-50 text-emerald-700",
    yellow: "bg-amber-50 text-amber-700",
    red: "bg-rose-50 text-rose-700",
    unknown: "bg-slate-100 text-slate-600",
  };
  return classes[health];
}

export function gateClass(status: ReleaseGateStatus) {
  const classes: Record<ReleaseGateStatus, string> = {
    pending: "bg-slate-100 text-slate-600",
    passed: "bg-emerald-50 text-emerald-700",
    failed: "bg-rose-50 text-rose-700",
    waived: "bg-amber-50 text-amber-700",
  };
  return classes[status];
}

export function severityClass(severity: "low" | "medium" | "high" | "critical") {
  const classes = {
    low: "bg-slate-100 text-slate-600",
    medium: "bg-blue-50 text-blue-700",
    high: "bg-amber-50 text-amber-700",
    critical: "bg-rose-50 text-rose-700",
  };
  return classes[severity];
}

export function endpointLabel(endpoint: EndpointHealth) {
  return `${endpoint.method} ${endpoint.path}`;
}

export function moduleCompletion(modules: ArqdorModule[]) {
  const required = modules.filter((module) => module.required);
  const validated = required.filter((module) => module.status === "validated" || module.status === "typecheck-ok").length;
  return {
    required: required.length,
    validated,
    percent: required.length ? Math.round((validated / required.length) * 100) : 0,
  };
}

export function endpointCompletion(endpoints: EndpointHealth[]) {
  const required = endpoints.filter((endpoint) => endpoint.required);
  const green = required.filter((endpoint) => endpoint.health === "green").length;
  return {
    required: required.length,
    green,
    percent: required.length ? Math.round((green / required.length) * 100) : 0,
  };
}
