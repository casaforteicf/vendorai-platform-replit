import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createOrdersFromApproval,
  createSupplierOrder,
  createWorkOrder,
  fetchProductionBundle,
  updateSupplierOrder,
  updateWorkOrder,
} from "./productionApi";
import type {
  ExecutionEvent,
  InstallationTask,
  QualityCheck,
  SupplierOrder,
  SupplierOrderPayload,
  WorkOrder,
  WorkOrderPayload,
} from "./productionTypes";

export function useProductionExecution(projectId: string, proposalId?: string) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [supplierOrders, setSupplierOrders] = useState<SupplierOrder[]>([]);
  const [installationTasks, setInstallationTasks] = useState<InstallationTask[]>([]);
  const [qualityChecks, setQualityChecks] = useState<QualityCheck[]>([]);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    return {
      total: workOrders.length,
      completed: workOrders.filter((item) => item.status === "completed" || item.status === "installed").length,
      blocked: workOrders.filter((item) => item.status === "blocked").length,
      supplierPending: supplierOrders.filter((item) => ["not-requested", "quote-requested", "delayed"].includes(item.status)).length,
      estimatedCost: workOrders.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0),
      actualCost: workOrders.reduce((sum, item) => sum + Number(item.actualCost || 0), 0),
    };
  }, [supplierOrders, workOrders]);

  const load = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    const result = await fetchProductionBundle(projectId);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setWorkOrders(result.data?.workOrders || []);
    setSupplierOrders(result.data?.supplierOrders || []);
    setInstallationTasks(result.data?.installationTasks || []);
    setQualityChecks(result.data?.qualityChecks || []);
    setEvents(result.data?.events || []);
    setSelectedOrder((current) => {
      const list = result.data?.workOrders || [];
      if (current && list.some((item) => item.id === current.id)) return current;
      return list[0] || null;
    });

    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const generateFromApproval = useCallback(async () => {
    if (!projectId || !proposalId) {
      setError("proposalId é obrigatório para gerar produção a partir da aprovação.");
      return null;
    }

    setGenerating(true);
    setError(null);

    const result = await createOrdersFromApproval({
      projectId,
      proposalId,
      onlyApprovedItems: true,
    });

    if (result.error) {
      setError(result.error);
      setGenerating(false);
      return null;
    }

    setWorkOrders(result.data?.workOrders || []);
    setSupplierOrders(result.data?.supplierOrders || []);
    setInstallationTasks(result.data?.installationTasks || []);
    setQualityChecks(result.data?.qualityChecks || []);
    setEvents(result.data?.events || []);
    setSelectedOrder(result.data?.workOrders?.[0] || null);
    setGenerating(false);
    await load();
    return result.data || null;
  }, [load, projectId, proposalId]);

  const addOrder = useCallback(
    async (payload: WorkOrderPayload) => {
      setSaving(true);
      setError(null);

      const result = await createWorkOrder(payload);

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      if (result.data) {
        setWorkOrders((list) => [result.data as WorkOrder, ...list]);
        setSelectedOrder(result.data);
      }

      setSaving(false);
      await load();
      return result.data || null;
    },
    [load],
  );

  const saveOrder = useCallback(
    async (id: string, payload: Partial<WorkOrderPayload>) => {
      setSaving(true);
      setError(null);

      const result = await updateWorkOrder(id, payload);

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      if (result.data) {
        setWorkOrders((list) => list.map((item) => (item.id === id ? result.data as WorkOrder : item)));
        setSelectedOrder(result.data);
      }

      setSaving(false);
      await load();
      return result.data || null;
    },
    [load],
  );

  const addSupplierOrder = useCallback(
    async (payload: SupplierOrderPayload) => {
      setSupplierSaving(true);
      setError(null);

      const result = await createSupplierOrder(payload);

      if (result.error) {
        setError(result.error);
        setSupplierSaving(false);
        return null;
      }

      if (result.data) {
        setSupplierOrders((list) => [result.data as SupplierOrder, ...list]);
      }

      setSupplierSaving(false);
      await load();
      return result.data || null;
    },
    [load],
  );

  const saveSupplierOrder = useCallback(
    async (id: string, payload: Partial<SupplierOrderPayload>) => {
      setSupplierSaving(true);
      setError(null);

      const result = await updateSupplierOrder(id, payload);

      if (result.error) {
        setError(result.error);
        setSupplierSaving(false);
        return null;
      }

      if (result.data) {
        setSupplierOrders((list) => list.map((item) => (item.id === id ? result.data as SupplierOrder : item)));
      }

      setSupplierSaving(false);
      await load();
      return result.data || null;
    },
    [load],
  );

  return {
    workOrders,
    supplierOrders,
    installationTasks,
    qualityChecks,
    events,
    selectedOrder,
    setSelectedOrder,
    stats,
    loading,
    generating,
    saving,
    supplierSaving,
    error,
    reload: load,
    generateFromApproval,
    addOrder,
    saveOrder,
    addSupplierOrder,
    saveSupplierOrder,
  };
}
