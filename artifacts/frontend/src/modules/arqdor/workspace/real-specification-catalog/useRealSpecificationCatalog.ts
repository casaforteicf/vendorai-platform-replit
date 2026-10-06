import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyCatalogItemToSpecObject,
  createSpecObject,
  createSpecObjectsFromRender,
  fetchCatalog,
  fetchSpecObjects,
  sendSpecObjectToBudget,
  syncSpecObjectsFromProject,
  fetchSpecObjectApprovals,
  decideSpecObjectApproval,
  updateSpecObject,
} from "./specCatalogApi";
import type { CatalogItem, CatalogItemType, SpecApproval, SpecApprovalContext, SpecApprovalDecision, SpecObject, SpecObjectPayload } from "./specCatalogTypes";

export function useRealSpecificationCatalog(
  projectId: string,
  renderId?: string,
  options?: { catalogEnabled?: boolean },
) {
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [specObjects, setSpecObjects] = useState<SpecObject[]>([]);
  const [selectedObject, setSelectedObject] = useState<SpecObject | null>(null);
  const [catalogType, setCatalogType] = useState<CatalogItemType | "all">("all");
  const [query, setQuery] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [sendingToBudget, setSendingToBudget] = useState(false);
  const [syncingProject, setSyncingProject] = useState(false);
  const [lastSync, setLastSync] = useState<Record<string, unknown> | null>(null);
  const [approvals, setApprovals] = useState<SpecApproval[]>([]);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const catalogEnabled = Boolean(options?.catalogEnabled);

  const totals = useMemo(() => {
    const material = specObjects.reduce((sum, item) => sum + Number(item.materialValue || 0) * Number(item.quantity || 1), 0);
    const labor = specObjects.reduce((sum, item) => sum + Number(item.laborValue || 0) * Number(item.quantity || 1), 0);

    return {
      material,
      labor,
      total: material + labor,
      count: specObjects.length,
      specified: specObjects.filter((item) => ["specified", "priced", "approved", "sent-to-budget"].includes(item.status)).length,
    };
  }, [specObjects]);

  const loadCatalog = useCallback(async () => {
    if (!catalogEnabled) return;
    setLoadingCatalog(true);
    setError(null);

    const result = await fetchCatalog({ type: catalogType, query, projectId });

    if (result.error) {
      setError(result.error);
      setLoadingCatalog(false);
      return;
    }

    setCatalogItems(result.data?.items || []);
    setLoadingCatalog(false);
  }, [catalogEnabled, catalogType, projectId, query]);

  const loadSpecObjects = useCallback(async () => {
    if (!projectId) return;

    setLoadingObjects(true);
    setError(null);

    const result = await fetchSpecObjects({ projectId, renderId });

    if (result.error) {
      setError(result.error);
      setLoadingObjects(false);
      return;
    }

    const list = result.data?.items || [];
    setSpecObjects(list);
    setSelectedObject((current) => {
      if (current && list.some((item) => item.id === current.id)) return current;
      return list[0] || null;
    });

    setLoadingObjects(false);
  }, [projectId, renderId]);

  useEffect(() => {
    if (catalogEnabled) void loadCatalog();
  }, [catalogEnabled, loadCatalog]);

  const syncProject = useCallback(async () => {
    if (!projectId) return null;
    setSyncingProject(true);
    const result = await syncSpecObjectsFromProject(projectId);
    if (!result.error && result.data) {
      setSpecObjects(result.data.items || []);
      setLastSync(result.data.sync || null);
    }
    setSyncingProject(false);
    return result.data || null;
  }, [projectId]);

  useEffect(() => {
    let active = true;
    if (!projectId) return;
    void (async () => {
      setLoadingObjects(true);
      const synced = await syncSpecObjectsFromProject(projectId);
      if (!active) return;
      if (!synced.error && synced.data) {
        const list = synced.data.items || [];
        setSpecObjects(list);
        setLastSync(synced.data.sync || null);
        setSelectedObject((current) => current && list.some((item) => item.id === current.id) ? current : list[0] || null);
        setLoadingObjects(false);
        return;
      }
      await loadSpecObjects();
    })();
    return () => { active = false; };
  }, [loadSpecObjects, projectId]);

  useEffect(() => {
    if (!selectedObject?.id) {
      setApprovals([]);
      return;
    }
    void (async () => {
      const result = await fetchSpecObjectApprovals(selectedObject.id);
      if (!result.error) setApprovals(result.data?.approvals || []);
    })();
  }, [selectedObject?.id]);

  const decideApproval = useCallback(async (
    context: SpecApprovalContext,
    decision: SpecApprovalDecision,
    note?: string | null,
  ) => {
    if (!selectedObject?.id) return null;
    setApproving(true);
    setError(null);
    const result = await decideSpecObjectApproval(selectedObject.id, { context, decision, note });
    if (result.error) {
      setError(result.error);
      setApproving(false);
      return null;
    }
    if (result.data) {
      setApprovals(result.data.approvals || []);
      setSelectedObject(result.data.item);
      setSpecObjects((current) => current.map((item) => item.id === result.data!.item.id ? result.data!.item : item));
    }
    setApproving(false);
    return result.data || null;
  }, [selectedObject?.id]);

  const addObject = useCallback(
    async (payload: SpecObjectPayload) => {
      setSaving(true);
      setError(null);

      const result = await createSpecObject(payload);

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      if (result.data) {
        setSpecObjects((current) => [result.data as SpecObject, ...current]);
        setSelectedObject(result.data);
      }

      setSaving(false);
      await loadSpecObjects();
      return result.data || null;
    },
    [loadSpecObjects],
  );

  const saveObject = useCallback(
    async (id: string, payload: Partial<SpecObjectPayload>) => {
      setSaving(true);
      setError(null);

      const result = await updateSpecObject(id, payload);

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return null;
      }

      if (result.data) {
        setSpecObjects((current) => current.map((item) => (item.id === id ? result.data as SpecObject : item)));
        setSelectedObject(result.data);
      }

      setSaving(false);
      await loadSpecObjects();
      return result.data || null;
    },
    [loadSpecObjects],
  );

  const extractFromRender = useCallback(async () => {
    if (!projectId || !renderId) return null;

    setExtracting(true);
    setError(null);

    const result = await createSpecObjectsFromRender({
      projectId,
      renderId,
      preservePrompt: true,
      extractObjects: true,
    });

    if (result.error) {
      setError(result.error);
      setExtracting(false);
      return null;
    }

    const list = result.data?.items || [];
    setSpecObjects(list);
    setSelectedObject(list[0] || null);

    setExtracting(false);
    await loadSpecObjects();
    return list;
  }, [loadSpecObjects, projectId, renderId]);

  const applyCatalogToObject = useCallback(
    async (object: SpecObject, item: CatalogItem) => {
      const payload = applyCatalogItemToSpecObject(object, item);
      return saveObject(object.id, payload);
    },
    [saveObject],
  );

  const sendToBudget = useCallback(
    async (object: SpecObject) => {
      setSendingToBudget(true);
      setError(null);

      const result = await sendSpecObjectToBudget(object.id);

      if (result.error) {
        setError(result.error);
        setSendingToBudget(false);
        return null;
      }

      await loadSpecObjects();
      setSendingToBudget(false);
      return result.data || null;
    },
    [loadSpecObjects],
  );

  return {
    catalogItems,
    specObjects,
    selectedObject,
    setSelectedObject,
    catalogType,
    setCatalogType,
    query,
    setQuery,
    loadingCatalog,
    loadingObjects,
    saving,
    extracting,
    sendingToBudget,
    syncingProject,
    lastSync,
    approvals,
    approving,
    error,
    totals,
    reloadCatalog: loadCatalog,
    reloadSpecObjects: loadSpecObjects,
    syncProject,
    decideApproval,
    addObject,
    saveObject,
    extractFromRender,
    applyCatalogToObject,
    sendToBudget,
  };
}
