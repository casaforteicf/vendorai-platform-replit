import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adjustRender,
  approveRender,
  fetchRenderGallery,
  sendRenderToSpecification,
} from "./renderGalleryApi";
import type {
  AdjustRenderPayload,
  ApproveRenderPayload,
  RenderGalleryItem,
  SendToSpecificationPayload,
} from "./renderGalleryTypes";
import { groupRenderVersions } from "./renderGalleryUtils";

export function useRealRenderGallery(projectId: string) {
  const [items, setItems] = useState<RenderGalleryItem[]>([]);
  const [selectedRender, setSelectedRender] = useState<RenderGalleryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [sendingToSpec, setSendingToSpec] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGallery = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    const result = await fetchRenderGallery(projectId);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const list = result.data?.items || [];
    setItems(list);

    setSelectedRender((current) => {
      if (current && list.some((item) => item.id === current.id)) return current;
      return list[0] || null;
    });

    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  const versions = useMemo(() => groupRenderVersions(items), [items]);

  const runAdjustment = useCallback(
    async (render: RenderGalleryItem, payload: AdjustRenderPayload) => {
      setAdjusting(true);
      setError(null);

      const result = await adjustRender(render.id, {
        ...payload,
        createNewVersion: true,
        preserveCamera: true,
        preserveGeometry: true,
      });

      if (result.error) {
        setError(result.error);
        setAdjusting(false);
        return null;
      }

      if (result.data) {
        setItems((current) => [result.data as RenderGalleryItem, ...current]);
        setSelectedRender(result.data);
      }

      setAdjusting(false);
      await loadGallery();
      return result.data || null;
    },
    [loadGallery],
  );

  const runApprove = useCallback(
    async (payload: ApproveRenderPayload) => {
      setApproving(true);
      setError(null);

      const result = await approveRender(payload);

      if (result.error) {
        setError(result.error);
        setApproving(false);
        return null;
      }

      if (result.data) {
        setItems((current) => current.map((item) => (item.id === result.data?.id ? result.data : item)));
        setSelectedRender(result.data);
      }

      setApproving(false);
      await loadGallery();
      return result.data || null;
    },
    [loadGallery],
  );

  const runSendToSpecification = useCallback(
    async (payload: SendToSpecificationPayload) => {
      setSendingToSpec(true);
      setError(null);

      const result = await sendRenderToSpecification(payload);

      if (result.error) {
        setError(result.error);
        setSendingToSpec(false);
        return null;
      }

      setSendingToSpec(false);
      await loadGallery();
      return result.data || null;
    },
    [loadGallery],
  );

  return {
    items,
    versions,
    selectedRender,
    setSelectedRender,
    loading,
    adjusting,
    approving,
    sendingToSpec,
    error,
    reload: loadGallery,
    runAdjustment,
    runApprove,
    runSendToSpecification,
  };
}
