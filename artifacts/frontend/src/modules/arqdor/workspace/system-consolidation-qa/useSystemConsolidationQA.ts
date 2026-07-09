import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSystemConsolidation, runEndpointHealthCheck, saveReleaseGateStatus } from "./consolidationApi";
import type {
  ArqdorModule,
  EndpointHealth,
  MockDebtItem,
  NavigationFlowStep,
  ReleaseGate,
  ReleaseGateStatus,
  TenantSecurityCheck,
} from "./consolidationTypes";
import { endpointCompletion, moduleCompletion } from "./consolidationUtils";

export function useSystemConsolidationQA() {
  const [modules, setModules] = useState<ArqdorModule[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointHealth[]>([]);
  const [mockDebts, setMockDebts] = useState<MockDebtItem[]>([]);
  const [releaseGates, setReleaseGates] = useState<ReleaseGate[]>([]);
  const [flow, setFlow] = useState<NavigationFlowStep[]>([]);
  const [securityChecks, setSecurityChecks] = useState<TenantSecurityCheck[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [savingGate, setSavingGate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const moduleStats = moduleCompletion(modules);
    const endpointStats = endpointCompletion(endpoints);
    const gatesPassed = releaseGates.filter((gate) => gate.status === "passed" || gate.status === "waived").length;
    const criticalMockDebt = mockDebts.filter((item) => item.status !== "resolved" && item.severity === "critical").length;
    const securityFailed = securityChecks.filter((item) => item.status === "failed").length;
    const rcReady =
      moduleStats.percent >= 90 &&
      endpointStats.percent >= 80 &&
      gatesPassed === releaseGates.length &&
      criticalMockDebt === 0 &&
      securityFailed === 0;

    return {
      moduleStats,
      endpointStats,
      gatesPassed,
      gatesTotal: releaseGates.length,
      criticalMockDebt,
      securityFailed,
      rcReady,
    };
  }, [endpoints, mockDebts, modules, releaseGates, securityChecks]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await fetchSystemConsolidation();

    if (result.error) {
      setError(result.error);
    }

    if (result.data) {
      setModules(result.data.modules || []);
      setEndpoints(result.data.endpoints || []);
      setMockDebts(result.data.mockDebts || []);
      setReleaseGates(result.data.releaseGates || []);
      setFlow(result.data.flow || []);
      setSecurityChecks(result.data.securityChecks || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checkEndpoints = useCallback(async () => {
    setChecking(true);
    setError(null);

    const result = await runEndpointHealthCheck();

    if (result.error) {
      setError(result.error);
    }

    if (result.data) {
      setModules(result.data.modules || []);
      setEndpoints(result.data.endpoints || []);
      setMockDebts(result.data.mockDebts || []);
      setReleaseGates(result.data.releaseGates || []);
      setFlow(result.data.flow || []);
      setSecurityChecks(result.data.securityChecks || []);
    }

    setChecking(false);
  }, []);

  const setGateStatus = useCallback(
    async (gateId: string, status: ReleaseGateStatus, evidence?: string) => {
      setSavingGate(true);
      setError(null);

      const result = await saveReleaseGateStatus({ gateId, status, evidence });

      if (result.error) {
        setError(result.error);
      }

      setReleaseGates((current) =>
        current.map((gate) => (gate.id === gateId ? { ...gate, status, evidence: evidence || gate.evidence } : gate)),
      );

      setSavingGate(false);
      return result.data || null;
    },
    [],
  );

  return {
    modules,
    endpoints,
    mockDebts,
    releaseGates,
    flow,
    securityChecks,
    stats,
    loading,
    checking,
    savingGate,
    error,
    reload: load,
    checkEndpoints,
    setGateStatus,
  };
}
