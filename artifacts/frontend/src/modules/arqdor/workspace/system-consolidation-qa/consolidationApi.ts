import type { ApiResult, SystemConsolidationBundle } from "./consolidationTypes";
import { getAuthHeaders } from "./consolidationUtils";
import { ARQDOR_FLOW, ARQDOR_MODULES } from "./moduleRegistry";
import { DEFAULT_MOCK_DEBTS, DEFAULT_RELEASE_GATES, DEFAULT_SECURITY_CHECKS } from "./consolidationDefaults";

async function parseResponse<T>(response: Response): Promise<ApiResult<T>> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    return {
      error: payload?.message || payload?.error || `Erro HTTP ${response.status}`,
    };
  }

  return { data: payload as T };
}

export async function fetchSystemConsolidation(): Promise<ApiResult<SystemConsolidationBundle>> {
  const response = await fetch("/api/arch/system/consolidation", {
    method: "GET",
    headers: getAuthHeaders(),
  });

  const result = await parseResponse<SystemConsolidationBundle>(response);

  if (!result.error && result.data) return result;

  return {
    data: {
      modules: ARQDOR_MODULES,
      endpoints: ARQDOR_MODULES.flatMap((module) =>
        module.expectedEndpoints.map((endpoint) => ({
          ...endpoint,
          health: "unknown" as const,
          lastStatus: null,
          lastCheckedAt: null,
          error: "Endpoint health não consultado ainda.",
        })),
      ),
      mockDebts: DEFAULT_MOCK_DEBTS,
      releaseGates: DEFAULT_RELEASE_GATES,
      flow: ARQDOR_FLOW,
      securityChecks: DEFAULT_SECURITY_CHECKS,
    },
    error: result.error,
  };
}

export async function saveReleaseGateStatus(payload: {
  gateId: string;
  status: "pending" | "passed" | "failed" | "waived";
  evidence?: string;
}): Promise<ApiResult<{ ok: boolean }>> {
  const response = await fetch("/api/arch/system/release-gates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<{ ok: boolean }>(response);
}

export async function runEndpointHealthCheck(): Promise<ApiResult<SystemConsolidationBundle>> {
  const response = await fetch("/api/arch/system/health-check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  const result = await parseResponse<SystemConsolidationBundle>(response);
  if (!result.error && result.data) return result;

  return fetchSystemConsolidation();
}
