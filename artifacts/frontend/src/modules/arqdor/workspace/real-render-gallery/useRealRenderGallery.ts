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

function readPersistentStudioVersionIds(): Set<string> {
  if (typeof window === "undefined" || window.location.pathname !== "/arch/render") return new Set();
  try {
    const raw = sessionStorage.getItem("arq_studio_versions");
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((item) => String(item?.id ?? "")).filter(Boolean));
  } catch {
    return new Set();
  }
}

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

    // No Render Studio, o histórico persistente já foi hidratado antes da
    // montagem da tela. A galeria antiga fica apenas como fallback para itens
    // legados que ainda não existem em arch_ai_renders, evitando duplicidade.
    const persistentIds = readPersistentStudioVersionIds();
    const list = (result.data?.items || []).filter((item) => !persistentIds.has(item.id));
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