const RUNTIME_KEYS: Record<string, string> = {
  sdr: "sdr", closer: "closer", followup: "sdr", reactivation: "sdr",
  scheduler: "agendamento", service: "suporte", onboarding: "suporte",
  relacionamento: "pos_venda", financeiro: "financeiro", cobranca: "cobranca",
  reception: "recepcao", pharmacy: "farmacia",
};
const PRIMARY_RUNTIME: Record<string, string> = {
  sdr: "sdr", closer: "closer", financeiro: "financeiro", cobranca: "cobranca",
  suporte: "service", agendamento: "scheduler", pos_venda: "relacionamento",
  recepcao: "reception", farmacia: "pharmacy",
};
export function agentKeyForRuntime(name: string): string {
  return RUNTIME_KEYS[name] ?? name;
}
export function primaryRuntimeForKey(key: string): string {
  return PRIMARY_RUNTIME[key] ?? key;
}
/** Absence preserves legacy tenants; explicit false must never fall through. */
export function resolveActivation(modern: boolean | undefined, legacy: boolean | undefined): boolean {
  return modern ?? legacy ?? false;
}
